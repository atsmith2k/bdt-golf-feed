# Deploying BDT Golf Network

The site runs as the app `bdt-golf-feed` on the ash10 panel (<https://ash10.johnnycode.ai>) and is served at <https://bdt.ash10.dev>. Every push to `master` builds and deploys. It is one long-running Node process (`next start`) with the panel's own Postgres database.

## Panel settings

| Setting | Value |
| --- | --- |
| Branch | `master`, deploy on push |
| Runtime | node |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` (Next.js listens on the panel's `$PORT`) |
| Hostname | `bdt.ash10.dev` |
| Health check path | `/healthz` |

The build (`next build --webpack`) does not touch the database. `/healthz` answers 200 only when the server can query its database, and the panel switches traffic to a new release only after that, so a release that cannot reach the database never goes live.

DNS: an `A` record `bdt` pointing at the VM, in the `ash10.dev` zone on Vercel DNS. Without it the `*` wildcard sends the hostname to Vercel (`DEPLOYMENT_NOT_FOUND`).

## Environment variables

| Name | Scope | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Runtime | Injected by the panel's **Database** card |
| `ADMIN_TOKEN` | Runtime | Password for `/admin`. `openssl rand -hex 32` |
| `GHIN_USERNAME` | Runtime | GHIN email or number |
| `GHIN_PASSWORD` | Runtime | GHIN password |
| `NEXT_PUBLIC_SITE_URL` | Build and runtime | `https://bdt.ash10.dev`; used for link-preview URLs |
| `CRON_SECRET` | Runtime | Optional; only to call `/api/cron/sync` from an external scheduler |

Values pasted with their `.env` quotes, or a site URL without `https://`, are accepted (`src/lib/env.ts`, `src/app/layout.tsx`).

## Database

The panel's Postgres, created from the app's **Database** card. The driver is node-postgres, so any Postgres works.

- **Migrations** run when the server starts: it applies whatever `drizzle/*.sql` the database has not seen. To change the schema, edit `src/lib/db/schema.ts`, run `npm run db:generate`, commit the new file in `drizzle/`, and push.
- **Backups** are whatever the panel provides for its Postgres. This database is the only copy of the feed history; GHIN scores and revisions can be re-fetched by a sync, but generated feed events and announcements cannot.

### Moving the data from another Postgres (one time)

1. In the panel, add `SOURCE_DATABASE_URL` with the old database's connection string.
2. Point `DATABASE_URL` at the new, empty database and deploy.
3. On start the server migrates the new database and copies every table from the source in one transaction, logging the row counts (`[import] copied from SOURCE_DATABASE_URL: …`).
4. Delete `SOURCE_DATABASE_URL`. Leaving it is harmless: the import only runs while the target has no golfers.

## Sync

- **Daily:** the server syncs the roster itself at 12:00 UTC. The runtime log shows `[daily-sync] next run at …` on start and `[daily-sync] scheduled: synced N golfers, M new feed events.` after each run. To change the time, edit `DAILY_SYNC_HOUR_UTC` in `src/instrumentation-node.ts`.
- **Catch-up:** a start more than 25 hours after the last sync runs one straight away.
- **Manual:** **Sync All** in `/admin`, or **Sync** on one golfer.
- **External scheduler:** set `CRON_SECRET` and call `GET /api/cron/sync` with `Authorization: Bearer <CRON_SECRET>`. Without the secret the route answers 404.
- **Roster size:** a sync runs three golfers at a time, about a second each.

## Verify a deploy

1. `https://bdt.ash10.dev/healthz` returns `{"ok":true,"golfers":…,"lastSyncedAt":…}`.
2. `/` shows the feed and `/roster` the roster.
3. `/admin/login` accepts `ADMIN_TOKEN`; the **GHIN Auth** panel reads **Active**.
4. **Sync All** updates every golfer's "Last synced" time.

## Troubleshooting

- **`/healthz` returns 503** — the server cannot reach its database, or the schema is missing. The runtime log has the reason (`[instrumentation] database migration failed: …`).
- **`DATABASE_URL must be a Postgres connection string`** — the variable holds something that is not a `postgres://` URL.
- **Admin login keeps returning to the login page** — `ADMIN_TOKEN` is unset on the server.
- **Admin action returns 403 `Bad origin`** — the request's `Origin` host is not the host the site was opened on. Open the admin on the public hostname, not an IP or internal address.
- **GHIN panel shows no token** — wrong `GHIN_USERNAME` / `GHIN_PASSWORD`. Click **Refresh Token**; the inline error is GHIN's response verbatim. 400 with `digital_profile` means bad credentials.
- **`npm ci` says the lock file is out of sync (`Missing: … from lock file`)** — the lockfile was regenerated on another OS with `node_modules` present, which drops optional packages for other platforms. Delete `node_modules` and `package-lock.json`, run `npm install`, and commit.
- **`Server Reference ID did not match` in the log** — internet scanners probing for server actions, which this app does not have. The requests are rejected.
