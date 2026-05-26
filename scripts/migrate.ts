// scripts/migrate.ts
//
// Apply Drizzle migrations to whatever database DATABASE_URL points at.
// Used both for `npm run db:migrate` (local) and `npm run build` (Vercel).
//
// Idempotent: drizzle's migrator records applied filenames in a metadata
// table, so it's safe to run on every deploy.

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set; skipping migrations.');
    process.exit(1);
  }
  const sql = neon(url);
  const db = drizzle(sql);
  console.log('[migrate] applying migrations from ./drizzle …');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('[migrate] done');
}

run().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
