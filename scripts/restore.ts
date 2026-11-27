// scripts/restore.ts
//
// `npm run db:restore -- <dump.json | dump.json.gz>`: load a backup into the
// database at DATABASE_URL. The database must be empty: the script applies
// the migrations, then refuses to continue if any table already has rows.

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { runMigrations } from '../src/lib/db/migrate';
import { getPool } from '../src/lib/db/index';
import { parseDump, restoreDatabase } from '../src/lib/db/backup';

async function run() {
  const file = process.argv[2];
  if (!file) throw new Error('usage: npm run db:restore -- <dump.json | dump.json.gz>');

  const raw = readFileSync(file);
  const text = (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8');
  const dump = parseDump(text);
  console.log('[restore] dump holds', JSON.stringify(dump.counts));

  await runMigrations();
  const restored = await restoreDatabase(getPool(), dump);
  console.log('[restore] restored', JSON.stringify(restored));
  await getPool().end();
}

run().catch((err) => {
  console.error('[restore] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
