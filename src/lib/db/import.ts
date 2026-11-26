// src/lib/db/import.ts
//
// One-time move of every row from another Postgres (SOURCE_DATABASE_URL) into
// this one (DATABASE_URL). Used to leave a hosted database for the panel's
// own: set SOURCE_DATABASE_URL to the old connection string, restart, check
// the log, then delete the variable.
//
// Safe to leave configured across restarts:
//   - it only runs while the target has no golfers, so it never runs twice;
//   - all tables are copied in one transaction, so a failure leaves the target
//     empty and the next start retries;
//   - it refuses a source that is the same database as the target.
//
// Rows travel as JSON and are rebuilt with jsonb_populate_recordset against
// the target's own table type, so every column keeps its type (timestamps,
// json payloads, doubles) without listing columns here.

import { Pool, type PoolClient } from 'pg';
import { getPool, requirePostgresUrl } from './index';
import { cleanEnv } from '@/lib/env';

// Parents before children (foreign keys point at Golfer).
const TABLES = ['Golfer', 'Score', 'HandicapRevision', 'GolferStats', 'FeedEvent'] as const;
const BATCH = 500;

export interface ImportReport {
  ran: boolean;
  reason?: string;
  tables?: Record<string, { source: number; copied: number }>;
}

function sameDatabase(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.hostname === y.hostname && (x.port || '5432') === (y.port || '5432') && x.pathname === y.pathname;
  } catch {
    return a === b;
  }
}

async function copyTable(source: Pool, target: PoolClient, table: string) {
  const { rows } = await source.query<{ row: string }>(
    `select to_jsonb(t)::text as row from "${table}" t`,
  );
  let copied = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = `[${rows.slice(i, i + BATCH).map((r) => r.row).join(',')}]`;
    const res = await target.query(
      `insert into "${table}" select * from jsonb_populate_recordset(null::"${table}", $1::jsonb)`,
      [chunk],
    );
    copied += res.rowCount ?? 0;
  }
  return { source: rows.length, copied };
}

export async function importFromSourceIfEmpty(): Promise<ImportReport> {
  const sourceUrl = cleanEnv(process.env.SOURCE_DATABASE_URL);
  if (!sourceUrl) return { ran: false, reason: 'SOURCE_DATABASE_URL is not set' };

  const targetUrl = requirePostgresUrl('DATABASE_URL', process.env.DATABASE_URL);
  requirePostgresUrl('SOURCE_DATABASE_URL', sourceUrl);
  if (sameDatabase(sourceUrl, targetUrl)) {
    return { ran: false, reason: 'source and target are the same database' };
  }

  const pool = getPool();
  const existing = await pool.query<{ n: number }>('select count(*)::int as n from "Golfer"');
  if (existing.rows[0].n > 0) {
    return { ran: false, reason: `target already has ${existing.rows[0].n} golfers` };
  }

  const source = new Pool({ connectionString: sourceUrl, max: 2, connectionTimeoutMillis: 15_000 });
  const target = await pool.connect();
  const tables: NonNullable<ImportReport['tables']> = {};
  try {
    await target.query('begin');
    for (const table of TABLES) {
      tables[table] = await copyTable(source, target, table);
      if (tables[table].copied !== tables[table].source) {
        throw new Error(
          `${table}: copied ${tables[table].copied} of ${tables[table].source} rows`,
        );
      }
    }
    await target.query('commit');
  } catch (err) {
    await target.query('rollback').catch(() => {});
    throw err;
  } finally {
    target.release();
    await source.end().catch(() => {});
  }
  return { ran: true, tables };
}
