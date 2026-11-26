// src/lib/db/index.ts
//
// Drizzle DB client on node-postgres (`pg`): plain Postgres over TCP, so the
// same code runs against the panel's own database, a local Postgres, or any
// hosted one. The server is long-running, so a small connection pool is kept.
//
// Cached on globalThis so dev-mode HMR doesn't open a new pool per reload.
//
// The pool is built lazily on first use rather than at module-evaluate time
// so that Next.js's build-time page data collection (which loads modules
// without a DATABASE_URL configured for it) doesn't crash.

import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { cleanEnv } from '@/lib/env';

type Db = NodePgDatabase<typeof schema>;

declare global {
  var __db: Db | undefined;
  var __dbPool: Pool | undefined;
}

/** Validate a Postgres connection string, naming the variable it came from. */
export function requirePostgresUrl(name: string, value: string | undefined): string {
  const url = cleanEnv(value);
  if (!url) {
    throw new Error(`${name} is not set. Add a Postgres URL (see .env.example).`);
  }
  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    throw new Error(
      `${name} must be a Postgres connection string (got "${url.slice(0, 12)}…").`,
    );
  }
  return url;
}

/** The shared pool. Raw SQL (migrations, import, health) goes through this. */
export function getPool(): Pool {
  if (!global.__dbPool) {
    const pool = new Pool({
      connectionString: requirePostgresUrl('DATABASE_URL', process.env.DATABASE_URL),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    // An idle client dropped by the server must not crash the process.
    pool.on('error', (err) => {
      console.error('[db] idle client error:', err.message);
    });
    global.__dbPool = pool;
  }
  return global.__dbPool;
}

function buildDb(): Db {
  return drizzle(getPool(), { schema });
}

/**
 * Lazy proxy. The first time any property is accessed (e.g. `db.select`),
 * we initialize the underlying drizzle client. Until then `db` is just a
 * placeholder, which lets Next.js's build-time page-data collection import
 * route modules without immediately demanding DATABASE_URL.
 */
export const db = new Proxy({} as Db, {
  get(_t, prop, receiver) {
    const real = (global.__db ??= buildDb());
    const value = Reflect.get(real, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
}) as Db;

export { schema };
export * from './schema';
