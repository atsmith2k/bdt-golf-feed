# Deploying BDT Golf Network

End-to-end walkthrough. The same Postgres database backs both local development and the Vercel deployment, so the two environments behave identically — no SQLite-vs-Postgres surprises.

The data layer is **Drizzle ORM + Neon serverless driver**. There are no native binaries to ship and no Prisma engine to bundle. The driver speaks HTTP, so it works the same on your laptop and in Lambda.

## 1. Provision Postgres (Neon free tier — 2 minutes)

1. Sign up at <https://neon.tech>.
2. Create a project (any name; pick the region closest to your Vercel region).
3. Copy the **connection string** Neon shows you. It looks like:
   ```
   postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```

Optional: create a second Neon project for your local dev environment. Each project is fully isolated and free. If you'd rather use one DB for both, that works too.

Any other Postgres host works (Supabase, Vercel Postgres, RDS, self-hosted) — you just need a `postgres://` or `postgresql://` URL.

## 2. Local setup

```bash
cp .env.example .env
# paste your DATABASE_URL, ADMIN_TOKEN, GHIN_USERNAME, GHIN_PASSWORD
npm install
npm run db:migrate     # applies drizzle/*.sql migrations
npm run dev            # http://localhost:3000
```

Open `/admin/login`, sign in with `ADMIN_TOKEN`, click **Refresh Token** in the GHIN Auth panel to verify GHIN credentials, then add golfers.

## 3. Vercel setup

1. Push the repo to GitHub/GitLab.
2. Click **New Project** in Vercel and import the repo. Framework auto-detects as Next.js.
3. Set environment variables (Production + Preview + Development):

   | Name             | Value                                              |
   | ---------------- | -------------------------------------------------- |
   | `DATABASE_URL`   | Neon connection string                             |
   | `ADMIN_TOKEN`    | `openssl rand -hex 32`                             |
   | `GHIN_USERNAME`  | GHIN email or number                               |
   | `GHIN_PASSWORD`  | GHIN password                                      |
   | `CRON_SECRET`    | `openssl rand -hex 32` (for the periodic sync cron) |

4. Click **Deploy**.

Vercel runs `npm install`, then `npm run build` which executes `npm run db:migrate && next build`. The first deploy applies the initial migration; subsequent deploys are no-ops on a clean schema.

## 4. Verify

After the first deploy:

1. `https://<your-app>/` — broadcast dashboard (empty until you add golfers).
2. `https://<your-app>/admin/login` — sign in with `ADMIN_TOKEN`.
3. **GHIN Auth** panel should read **Active** with an expiry timestamp.
4. Add a GHIN number — first sync populates the feed.

## 5. Cron schedule

`vercel.json` schedules `GET /api/cron/sync` every 2 hours. Adjust the cron expression there to taste:

- `0 */2 * * *` — every 2 hours (default)
- `0 7,12,18 * * *` — 7am, noon, 6pm UTC
- `*/30 * * * *` — every 30 minutes (mind GHIN rate limits)

The cron job is gated by `CRON_SECRET`. Vercel's cron infrastructure attaches the bearer token automatically; outside callers can't trigger the route.

## 6. Schema changes

The schema lives in `src/lib/db/schema.ts`. After editing it:

```bash
npm run db:generate    # produces drizzle/NNNN_name.sql
npm run db:migrate     # applies it locally
git add drizzle/ src/lib/db/schema.ts
git commit -m "schema: add column"
git push               # Vercel deploys + applies the new migration
```

For quick prototyping (without a migration file) use `npm run db:push` — but commit the eventual generated migration before deploying.

## 7. Operational notes

- **GHIN auth token is per-lambda.** Each warm Lambda instance authenticates independently and reuses its token until expiry. Cold starts perform one extra GHIN login. No shared cache (no Redis required).
- **Manual GHIN refresh** in the admin CMS only refreshes the token in the lambda that handled the request. New lambdas mint their own. This is fine for low traffic.
- **Roster size:** `syncAllGolfers()` runs with concurrency 3; ~2–5s per golfer is typical. A 50+ golfer roster may approach 60s. If you need to go bigger, raise the cron `maxDuration` in `vercel.json` (Pro plan max 300s) or shard the cron.
- **Backfill** is local-only — the admin CMS Backfill button replays cached scores into the feed without contacting GHIN. Fast, useful for re-styling.

## Troubleshooting

- **`DATABASE_URL must be a Postgres connection string`** — your `.env` still has a SQLite or other non-Postgres URL. Replace with a Neon (or other Postgres) URL.
- **`relation "Golfer" does not exist`** — schema not applied. Run `npm run db:migrate`.
- **Admin login redirect loops** — `ADMIN_TOKEN` env var unset.
- **Cron returns 401** — `CRON_SECRET` mismatch in Vercel dashboard.
- **GHIN bootstrap fails on first deploy** — open `/admin`, click **Refresh Token**. The error inline is the GHIN response verbatim. 400 with `digital_profile` means bad credentials.
- **`fetchConnectionCache` warning during build** — harmless. Newer driver versions ignore this option; the warning will go away when we bump the driver.
