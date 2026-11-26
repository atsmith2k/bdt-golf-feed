// src/instrumentation-node.ts
//
// Server start-up work, loaded by src/instrumentation.ts on the Node runtime
// only (it pulls in the Postgres driver, which cannot be bundled for edge).
// In order:
//   1. Apply any database migrations this database has not seen.
//   2. One-time import from SOURCE_DATABASE_URL while this database is empty.
//   3. Acquire the initial GHIN bearer token so live data works immediately.
//   4. Reconcile any cached handicap values that drifted from the canonical
//      string (fixes plus-handicap rows inserted before the parser was sign-aware).
//   5. Start the daily roster sync.
//
// Failures are logged but non-fatal — a misconfig surfaces in the server log,
// /healthz and the Admin CMS rather than crashing the process.

function logFailure(step: string, err: unknown) {
  console.error(`[instrumentation] ${step} failed:`, err instanceof Error ? err.message : err);
}

export async function startServer() {
  try {
    const { runMigrations } = await import('@/lib/db/migrate');
    await runMigrations();
    console.log('[instrumentation] database migrations are up to date.');
  } catch (err) {
    logFailure('database migration', err);
  }

  try {
    const { importFromSourceIfEmpty } = await import('@/lib/db/import');
    const report = await importFromSourceIfEmpty();
    if (report.ran) {
      console.log('[import] copied from SOURCE_DATABASE_URL:', JSON.stringify(report.tables));
    } else if (process.env.SOURCE_DATABASE_URL) {
      console.log(`[import] skipped: ${report.reason}.`);
    }
  } catch (err) {
    logFailure('import from SOURCE_DATABASE_URL', err);
  }

  const { bootstrapGhinAuth } = await import('@/lib/api/auth');
  await bootstrapGhinAuth();

  try {
    const { reconcileHandicapIndexValues } = await import('@/lib/db/reconcile');
    await reconcileHandicapIndexValues();
  } catch (err) {
    logFailure('handicap reconcile', err);
  }

  scheduleDailySync();
}

// Hour (UTC) of the daily roster sync.
const DAILY_SYNC_HOUR_UTC = 12;
// A start later than this after the last sync runs one straight away, so a
// restart or outage that spans the scheduled time does not skip a day.
const CATCH_UP_AFTER_MS = 25 * 60 * 60 * 1000;

declare global {
  var __dailySyncScheduled: boolean | undefined;
}

async function runRosterSync(reason: string) {
  try {
    const { refreshGhinAuthToken } = await import('@/lib/api/auth');
    const { syncAllGolfers } = await import('@/lib/services/syncEngine');
    await refreshGhinAuthToken();
    const results = await syncAllGolfers(3);
    const events = results.reduce((acc, r) => acc + r.feedEventsCreated, 0);
    console.log(
      `[daily-sync] ${reason}: synced ${results.length} golfers, ${events} new feed events.`,
    );
  } catch (err) {
    console.error(`[daily-sync] ${reason} failed:`, err instanceof Error ? err.message : err);
  }
}

/**
 * The daily job, run in-process: log in to GHIN again, then sync the roster.
 * Production only, so `next dev` never syncs on its own.
 */
function scheduleDailySync() {
  if (process.env.NODE_ENV !== 'production') return;
  if (global.__dailySyncScheduled) return;
  global.__dailySyncScheduled = true;

  const arm = () => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(DAILY_SYNC_HOUR_UTC, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    const timer = setTimeout(() => {
      void runRosterSync('scheduled').finally(arm);
    }, next.getTime() - now.getTime());
    timer.unref?.();
    console.log(`[daily-sync] next run at ${next.toISOString()}.`);
  };
  arm();

  void (async () => {
    try {
      const { getPool } = await import('@/lib/db');
      const { rows } = await getPool().query<{ last: Date | null; n: number }>(
        'select max("lastSyncedAt") as last, count(*)::int as n from "Golfer"',
      );
      const { last, n } = rows[0];
      if (n > 0 && (!last || Date.now() - last.getTime() > CATCH_UP_AFTER_MS)) {
        await runRosterSync('catch-up after start');
      }
    } catch (err) {
      logFailure('catch-up check', err);
    }
  })();
}
