// scripts/migrate.ts
//
// `npm run db:migrate`: apply Drizzle migrations to whatever database
// DATABASE_URL points at. The server also does this itself on every start
// (src/instrumentation.ts), so this is for local work and one-off use.

import 'dotenv/config';
import { runMigrations } from '../src/lib/db/migrate';
import { getPool } from '../src/lib/db/index';

async function run() {
  console.log('[migrate] applying migrations from ./drizzle …');
  await runMigrations();
  console.log('[migrate] done');
  await getPool().end();
}

run().catch((err) => {
  console.error('[migrate] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
