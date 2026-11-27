# BDT Golf Network

A read-only, broadcast-style golf dashboard for the BDT Tour, live at <https://bdt.ash10.dev>. It pulls data from the GHIN API for a fixed roster of golfers, turns scores and handicap movements into human-readable "news stories," and shows them through:

- A **Live Feed** of cards (auto-refresh, filter and sort)
- A **Roster** sorted by handicap index with trend arrows, and a profile page per golfer
- A **Ryder Cup** page: the season-long match between two drafted teams, with the score, schedule, results and player records
- A persistent bottom **Live Ticker** marquee
- A protected **Admin CMS** at `/admin` for the roster, manual sync, GHIN auth, breaking news and feed backfill

## Stack

- **Next.js 16** (App Router) + **React 19** + TypeScript, built as a standalone server and run as one long-running Node process
- **Postgres** through **Drizzle ORM** on node-postgres (`pg`)
- **Tailwind CSS 3** with a navy / red / cream broadcast palette
- **SWR** for client-side polling, **zod** for request validation

## Quickstart

```bash
cp .env.example .env
# Fill in DATABASE_URL (any Postgres), ADMIN_TOKEN, GHIN_USERNAME, GHIN_PASSWORD
npm install
npm run dev
```

Open <http://localhost:3000>. The server applies the database migrations itself when it starts. See [DEPLOYMENT.md](./DEPLOYMENT.md) for production.

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Develop, build the standalone server into `.next/standalone`, run it |
| `npm run typecheck` / `lint` | `tsc --noEmit` / ESLint |
| `npm run db:generate` | Write a new `drizzle/*.sql` migration from `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations now (the server also does this on start) |
| `npm run db:restore -- <dump.json>` | Load a backup into an empty database (see DEPLOYMENT.md) |
| `npm run icons` | Rebuild every icon and preview asset from `public/bdt-logo.png` |

## Architecture

```
drizzle/                        # SQL migrations checked into git
public/
  bdt-logo.png                  # The one source logo
  bdt-logo-sm.png, bdt-shield.png, icon-*.png   # Generated from it (npm run icons)
  manifest.webmanifest, robots.txt
scripts/
  migrate.ts                    # npm run db:migrate
  restore.ts                    # npm run db:restore
  generate-icons.mjs            # npm run icons
  assemble-standalone.mjs       # End of npm run build: adds static files, public/ and drizzle/ to the server
  start.mjs                     # npm start: runs .next/standalone/server.js
  panel-build.sh                # The panel's build command
src/
  instrumentation.ts            # Server boot hook; loads instrumentation-node.ts on Node
  instrumentation-node.ts       # Migrate, one-time import, GHIN login, reconcile, scheduled sync
  proxy.ts                      # Gates /admin and admin APIs, CSRF check
  app/
    page.tsx                    # Public broadcast dashboard; renders the feed on the server
    roster/, roster/[ghin]/     # Roster and golfer profile pages
    ryder-cup/, ryder-cup/manage/  # Ryder Cup scoreboard and its admin set-up
    signin/, signin/verify/     # Golfer sign-in by emailed link
    admin/, admin/login/        # CMS shell and token gate
    favicon.ico, icon.png, apple-icon.png   # Generated from the logo
    opengraph-image.tsx, twitter-image.tsx  # Link-preview card (uses the logo)
    healthz/route.ts            # 200 when the database answers
    api/
      feed/route.ts             # GET feed events
      roster/route.ts           # GET roster (sorted by handicap, with trend deltas)
      roster/[ghin]/route.ts    # GET one golfer's profile data
      golfers/route.ts          # GET / POST roster (admin)
      golfers/[ghin]/route.ts   # GET / DELETE (admin)
      sync/route.ts             # POST sync all (admin)
      sync/[ghin]/route.ts      # POST sync one (admin)
      backfill/route.ts         # POST replay cached scores into the feed (admin)
      backfill/[ghin]/route.ts  # POST single golfer backfill (admin)
      announcements/route.ts    # POST manual breaking news (admin)
      cup/                      # GET Ryder Cup state; matches (reporters); admin/* (season, teams, draft, roles, emails, recap)
      notifications/            # Push subscriptions, email choices, unsubscribe
      session/                  # Golfer sign-in: request a link, verify it, who am I, sign out
      auth/route.ts             # POST/DELETE admin cookie
      ghin/auth/route.ts        # GET status / POST refresh GHIN token (admin)
      diag/                     # Database snapshot and cleanup (admin)
      cron/sync/route.ts        # GET sync for an external scheduler (needs CRON_SECRET)
      backup/route.ts           # GET full database dump for the backup job (needs BACKUP_TOKEN)
  components/                   # BdtLogo, BroadcastHeader, LiveFeed, Ticker, FeedFallback, admin/*
  lib/
    env.ts                      # cleanEnv: tolerate quoted env values
    api/                        # GHIN HTTP wrapper + auth token manager
    db/                         # index (pool), schema, migrate, import, backup, reconcile
    services/                   # syncEngine, newsGenerator, feed (the feed query)
    hooks/useFeed.ts, feedKey.ts  # One shared feed request for the feed and the ticker
    utils/                      # auth, error, format
```

### News engine

When a golfer is synced, `syncGolfer()`:

1. Fetches profile, score history and handicap revision history from GHIN.
2. Inserts any new score rows.
3. Compares `handicapIndexValue` against the cached snapshot and emits a `HANDICAP_CHANGED` event when the index moved.
4. Inserts any new revisions and emits `HANDICAP_CHANGED` for each.
5. Calls `emitMissingScoreFeedEvents()` to add `SCORE_POSTED` and `LOW_ROUND_ALERT` for any cached score without a published event, backdated to `played_at` so the feed reads chronologically.

Copy is generated by pure functions in `src/lib/services/newsGenerator.ts`, so it can be restyled without touching database logic.

### Ryder Cup

One season at a time, two teams, matches worth points (`src/lib/services/cup.ts`, tables `CupSeason`, `CupTeam`, `CupTeamMember`, `CupMatch`, `CupMatchPlayer`).

- **Set-up** (admins): the season, team names, colours and captains, then who plays for which team, in the control room at `/admin` or at `/ryder-cup/manage`.
- **Matches** (captains, committee members, admins): **Add match or result** on `/ryder-cup`. A match needs a format and a point value; posting a result also needs at least one player a side and who won (or halved). Margin, date, course, session and notes are optional. A match saved without a result goes on the schedule and is reported later with one tap.
- **Scoring**: the winner takes the match's points; a halved match splits them.
- **Feed**: each result is a `CUP_RESULT` story in the live feed and ticker, reworded if the result is corrected and removed if it is cleared. Every story carries the running score at that point, in the order results were reported, so correcting an early result rewords the later ones too.
- **Closed seasons**: matches of a season marked complete cannot be changed until an admin reopens it.
- **Winning total**: with "points to win" set, the scoreboard shows what each team still needs and how many points are on the schedule, and the result that gets a team there is flagged as clinching the cup.
- **Draft**: the control room's draft board puts the team on the clock (snake or alternating order) and saves each pick with its number. Captains are on their teams already and are not picks.
- **Strokes given**: a scheduled match with its players named shows the strokes given, worked out from each player's handicap index as it stood when they were put in the match. It is a guide (index, not course handicap). The allowances are constants at the top of `src/lib/cupStrokes.ts`: singles 100% of the difference, fourball 90% off the low player, foursomes 50% of the combined difference, scramble 35%/15% of the low/high player. Other formats show nothing.
- **Player breakdowns**: tapping a player on the team tables shows their record by format, with each partner and against each opponent (`src/lib/cupStats.ts`).

### Notifications and the weekly recap

- **Push** (`src/lib/services/push.ts`, `public/sw.js`): anyone can turn on notifications for a device from the Notifications panel on `/ryder-cup`. On an iPhone the site has to be added to the Home Screen first. Needs the `VAPID_*` keys; without them push is not offered.
- **Email** (`src/lib/services/cupNotify.ts`): a signed-in golfer with an email can opt in to every result, the weekly recap, or both. Every email carries an unsubscribe link that works without signing in. Needs the `EMAIL_*` settings.
- **What is sent**: a result when it is first reported (not when it is corrected), and the weekly recap.
- **Weekly recap** (`src/lib/services/cupRecap.ts`): a `CUP_RECAP` feed story, a push and the email digest covering Monday to Sunday: the score, the week's results, the player of the week, what each team needs and what is coming up. The server checks every morning at 8 AM Eastern and once at start, and sends the recap for the week that ended on Sunday the first time it finds it unsent (normally Monday). A week with no results and nothing scheduled is skipped. Admins can preview and publish a recap of the last seven days from the control room.

### Sign-in and roles

Golfers sign in at `/signin` with an emailed link (`src/lib/services/session.ts`); there are no passwords.

- A known email gets a link. An unknown one is asked for a GHIN number; if that golfer has no email yet, the link goes to the new address and using it attaches the address to the golfer.
- A golfer who can report results (a captain, or the `COMMITTEE` or `ADMIN` role) does not get in on a self-claimed address until an admin approves it in the control room. Otherwise knowing a captain's GHIN number would be enough to report as them. The same happens to an address a golfer claimed earlier if they are later made a captain or given a role: it goes back to pending and they are signed out until an admin approves it.
- Admins can also set a golfer's email directly, or copy a one-time sign-in link to send themselves, which is the way in when email is not configured (see `EMAIL_*` in `.env.example`).
- The `ADMIN_TOKEN` cookie from `/admin/login` counts as an admin everywhere.

### Sync schedule

The server syncs the whole roster itself at 11 PM and 7 AM Eastern time (`src/lib/syncSchedule.ts`, run from `src/instrumentation-node.ts`): it logs in to GHIN again, then runs `syncAllGolfers(concurrency=3)`. The evening run catches the day's rounds, the morning run GHIN's overnight handicap revisions. If it starts more than 25 hours after the last sync, it runs one straight away. **Sync All** in the admin CMS does the same on demand. `GET /api/cron/sync` exists for an external scheduler and is closed unless `CRON_SECRET` is set.

### GHIN authentication

- A token is acquired at server start and cached on `globalThis.__ghinAuth`.
- Tokens last about an hour. An expired one is renewed automatically on the next GHIN call (at most one attempt a minute).
- If no token could ever be acquired (bad credentials), requests return a clear error pointing to the admin CMS, whose **Refresh Token** button (`POST /api/ghin/auth`) retries the login and shows live status.

### Database

The schema is `src/lib/db/schema.ts` (Golfer, Score, HandicapRevision, GolferStats, FeedEvent, the `Cup*` tables, PushSubscription, and AuthToken and Session for sign-in). Migrations live in `drizzle/*.sql` and are applied when the server starts. To change the schema, edit the file, run `npm run db:generate`, and commit the new migration.

## Branding

- Tailwind palette `bdt.*` (navy / red / cream / muted): see `tailwind.config.ts`.
- Bebas Neue / Inter / JetBrains Mono via `next/font/google`.
- `public/bdt-logo.png` is the source logo. `<BdtLogo>` renders a header-size copy of it in the header, login and admin pages. That copy, the favicon, home-screen icons and the link-preview card are generated from it: replace the file, run `npm run icons`, and commit the results.
