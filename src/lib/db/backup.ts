// src/lib/db/backup.ts
//
// A complete, restorable copy of the database as one JSON document, and the
// way back in. The site serves the dump at GET /api/backup (BACKUP_TOKEN) for
// an off-site job to collect; `npm run db:restore` loads one into an empty
// database.
//
// Rows travel as Postgres's own JSON (to_jsonb) and are rebuilt with
// jsonb_populate_recordset against the target's table type, so every column
// keeps its type (timestamps, json payloads, doubles) without listing columns
// here, and a dump taken before a column was added still restores.

import type { Pool, PoolClient } from 'pg';

// Parents before children (foreign keys point at earlier tables). The second
// value is the primary key (comma-separated when it has two columns), used to
// write rows in a stable order so two dumps of unchanged data are
// byte-identical.
//
// Sign-in links and sessions (AuthToken, Session) are left out on purpose:
// they are short-lived, and after a restore golfers just sign in again.
export const BACKUP_TABLES = [
  ['Golfer', 'id'],
  ['Score', 'id'],
  ['HandicapRevision', 'id'],
  ['GolferStats', 'golferId'],
  ['FeedEvent', 'id'],
  ['CupSeason', 'id'],
  ['CupTeam', 'id'],
  ['CupTeamMember', 'seasonId,golferId'],
  ['CupMatch', 'id'],
  ['CupMatchPlayer', 'matchId,golferId'],
  ['CupRecap', 'id'],
  ['PushSubscription', 'id'],
] as const;

// Tables added after the first dumps were taken. A dump (or an import source)
// without them is still complete; they are treated as empty.
export const TABLES_ADDED_LATER: ReadonlySet<string> = new Set([
  'CupSeason',
  'CupTeam',
  'CupTeamMember',
  'CupMatch',
  'CupMatchPlayer',
  'CupRecap',
  'PushSubscription',
]);

// Required columns added after the first dumps were taken. Rows are rebuilt
// from JSON, where a missing column becomes NULL rather than its default, so
// an older row needs these filled in. A value in the row always wins.
const COLUMN_DEFAULTS: Record<string, Record<string, unknown>> = {
  Golfer: { role: 'PLAYER', notifyResults: false, notifyWeekly: false, emailApproved: false },
};

export const DUMP_FORMAT = 'bdt-golf-feed-dump';
export const DUMP_VERSION = 1;
const BATCH = 500;

export interface DatabaseDump {
  format: typeof DUMP_FORMAT;
  version: number;
  counts: Record<string, number>;
  tables: Record<string, unknown[]>;
}

/** Insert rows (each one a JSON object as text) into a table; returns how many went in. */
export async function insertJsonRows(
  target: PoolClient,
  table: string,
  rows: readonly string[],
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = `[${rows.slice(i, i + BATCH).join(',')}]`;
    const res = await target.query(
      `insert into "${table}" select * from jsonb_populate_recordset(null::"${table}",
         (select coalesce(jsonb_agg($2::jsonb || e), '[]'::jsonb) from jsonb_array_elements($1::jsonb) e))`,
      [chunk, JSON.stringify(COLUMN_DEFAULTS[table] ?? {})],
    );
    inserted += res.rowCount ?? 0;
  }
  return inserted;
}

/**
 * The whole database as JSON text. Every table is read in one read-only
 * snapshot, so a sync running at the same moment cannot leave the dump with
 * a score whose golfer is missing.
 */
export async function dumpDatabase(
  pool: Pool,
): Promise<{ json: string; counts: Record<string, number> }> {
  const client = await pool.connect();
  try {
    await client.query('begin transaction isolation level repeatable read read only');
    const counts: Record<string, number> = {};
    const parts: string[] = [];
    for (const [table, key] of BACKUP_TABLES) {
      const { rows } = await client.query<{ row: string }>(
        `select to_jsonb(t)::text as row from "${table}" t order by ${key
          .split(',')
          .map((k) => `t."${k}"`)
          .join(', ')}`,
      );
      counts[table] = rows.length;
      parts.push(`${JSON.stringify(table)}:[\n${rows.map((r) => r.row).join(',\n')}\n]`);
    }
    await client.query('commit');
    const json =
      `{"format":${JSON.stringify(DUMP_FORMAT)},"version":${DUMP_VERSION},` +
      `"counts":${JSON.stringify(counts)},"tables":{\n${parts.join(',\n')}\n}}\n`;
    return { json, counts };
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Check that a file's text is a dump this code can restore. */
export function parseDump(text: string): DatabaseDump {
  const dump = JSON.parse(text) as DatabaseDump;
  if (dump?.format !== DUMP_FORMAT) throw new Error('not a bdt-golf-feed dump file');
  if (dump.version !== DUMP_VERSION) throw new Error(`unsupported dump version ${dump.version}`);
  for (const [table] of BACKUP_TABLES) {
    if (dump.tables && dump.tables[table] === undefined && TABLES_ADDED_LATER.has(table)) {
      dump.tables[table] = [];
      dump.counts[table] = 0;
    }
    const rows = dump.tables?.[table];
    if (!Array.isArray(rows)) throw new Error(`dump has no "${table}" table`);
    if (rows.length !== dump.counts?.[table]) {
      throw new Error(
        `"${table}" has ${rows.length} rows but the dump says ${dump.counts?.[table]}; the file is incomplete`,
      );
    }
  }
  return dump;
}

/**
 * Load a dump into a migrated, empty database, in one transaction. Refuses a
 * database that already holds rows, so it can never overwrite live data.
 */
export async function restoreDatabase(
  pool: Pool,
  dump: DatabaseDump,
): Promise<Record<string, number>> {
  const client = await pool.connect();
  const restored: Record<string, number> = {};
  try {
    await client.query('begin');
    for (const [table] of BACKUP_TABLES) {
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from "${table}"`,
      );
      if (rows[0].n > 0) {
        throw new Error(`the target database is not empty ("${table}" has ${rows[0].n} rows)`);
      }
    }
    for (const [table] of BACKUP_TABLES) {
      const rows = dump.tables[table].map((r) => JSON.stringify(r));
      restored[table] = await insertJsonRows(client, table, rows);
      if (restored[table] !== rows.length) {
        throw new Error(`${table}: restored ${restored[table]} of ${rows.length} rows`);
      }
    }
    await client.query('commit');
    return restored;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
