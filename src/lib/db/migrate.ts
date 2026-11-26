// src/lib/db/migrate.ts
//
// Apply the committed drizzle/*.sql migrations to the database at
// DATABASE_URL. Idempotent: drizzle records what it has applied, so this runs
// on every server start (src/instrumentation.ts) and from `npm run db:migrate`.
//
// It runs at start rather than during the build because a build sandbox is
// not guaranteed to reach the database, while the running server always is.

import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getPool } from './index';

export async function runMigrations(): Promise<void> {
  const migrationsFolder = path.join(process.cwd(), 'drizzle');
  await migrate(drizzle(getPool()), { migrationsFolder });
}
