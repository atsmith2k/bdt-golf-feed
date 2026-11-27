# Deploying BDT Golf Network

The site runs as the app `bdt-golf-feed` on the ash10 panel (<https://ash10.johnnycode.ai>) and is served at <https://bdt.ash10.dev>. Every push to `master` builds and deploys. It is one long-running Node process (Next.js's standalone server) with the panel's own Postgres database.

## Panel settings

| Setting | Value |
| --- | --- |
| Branch | `master`, deploy on push |
| Runtime | node |
| Build command | `bash scripts/panel-build.sh` |
| Start command | `npm start` (runs `.next/standalone/server.js`, listening on the panel's `$PORT`) |
| Hostname | `bdt.ash10.dev` |
| Health check path | `/healthz` |

The build (`output: 'standalone'` in `next.config.js`) leaves a self-contained server in `.next/standalone`: the compiled app, only the `node_modules` files it loads, and copies of `public/`, `drizzle/` and the static assets. The full `node_modules` therefore does not stay in the release; the script parks it in the panel's `$BUILD_CACHE_DIR` and moves it back in for the next build, so `npm ci` runs only when `package-lock.json` or the Node version changes. Next's build cache lives there too. Each kept release is about 50 MB. It does not touch the database. `/healthz` answers 200 only when the server can query its database, and the panel switches traffic to a new release only after that, so a release that cannot reach the database never goes live.

DNS: an `A` record `bdt` pointing at the VM, in the `ash10.dev` zone on Vercel DNS. Without it the `*` wildcard sends the hostname to Vercel (`DEPLOYMENT_NOT_FOUND`).

## Environment variables

| Name | Scope | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Runtime | Injected by the panel's **Database** card |
| `ADMIN_TOKEN` | Runtime | Password for `/admin`. `openssl rand -hex 32` |
| `GHIN_USERNAME` | Runtime | GHIN email or number |
| `GHIN_PASSWORD` | Runtime | GHIN password |
| `NEXT_PUBLIC_SITE_URL` | Build and runtime | `https://bdt.ash10.dev`; used for link-preview URLs and the links in emails |
| `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_API_URL` | Runtime | Optional; sends sign-in links and Ryder Cup emails through Remail: a sending-only Remail key, `BDT Golf Network <bdt@ash10.dev>` and `https://remail.foo/v1/emails`. Any Resend-compatible API works. Without the key and sender no email is sent and admins hand out sign-in links from the control room |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Runtime | Optional; turns on push notifications. `npx web-push generate-vapid-keys`, set once |
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

- **Scheduled:** the server syncs the roster itself twice a day, at 11 PM and 7 AM Eastern time. The evening run puts that day's rounds in the feed the same night; the morning run picks up GHIN's overnight handicap revisions. The runtime log shows `[daily-sync] next run at …` on start and `[daily-sync] scheduled: synced N golfers, M new feed events.` after each run. To change the times or the time zone, edit `SYNC_HOURS` and `SYNC_TIME_ZONE` in `src/lib/syncSchedule.ts`.
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
- **`[start] .next/standalone/server.js is missing`** — the release was not built with `npm run build`. Check the panel's build command is `bash scripts/panel-build.sh`.
- **A new file read at runtime is not found** — the server runs from `.next/standalone`, which holds only what the build traced plus what `scripts/assemble-standalone.mjs` copies. Add the directory there.
- **`Server Reference ID did not match` in the log** — internet scanners probing for server actions, which this app does not have. The requests are rejected.
