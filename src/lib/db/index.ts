// src/lib/db/index.ts
//
// Drizzle DB client backed by the Neon serverless driver.
//
// Same stack locally and in Vercel:
//   - Local dev: a Neon free-tier project (recommended) over HTTP/WebSocket.
//   - Vercel:    the same Neon (or any Postgres reachable via the Neon driver).
// No native binaries; Lambda cold-start is just JS.
//
// Cached on globalThis so dev-mode HMR doesn't open a new client per reload.
//
// The client is built lazily on first use rather than at module-evaluate time
// so that Next.js's build-time page data collection (which loads modules
// without a DATABASE_URL configured for it) doesn't crash.

import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

type Db = NeonHttpDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __db: Db | undefined;
}

function buildDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Add a Neon Postgres URL to .env (see .env.example).',
    );
  }
  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    throw new Error(
      `DATABASE_URL must be a Postgres connection string (got "${url.slice(0, 16)}…"). ` +
        'Get a free one at https://neon.tech.',
    );
  }
  const sql = neon(url);
  return drizzle(sql, { schema });
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
