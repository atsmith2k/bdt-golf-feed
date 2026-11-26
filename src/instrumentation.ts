// src/instrumentation.ts
//
// Next.js calls `register()` once when the server boots (on the Node runtime).
// Use it to:
//   1. Acquire the initial GHIN bearer token so live data works immediately.
//   2. Reconcile any cached handicap values that drifted from the canonical
//      string (fixes plus-handicap rows inserted before the parser was sign-aware).
//
// Failures are logged but non-fatal — a misconfig surfaces in the server log
// and via the Admin CMS rather than crashing the process.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { bootstrapGhinAuth } = await import('@/lib/api/auth');
  await bootstrapGhinAuth();

  try {
    const { reconcileHandicapIndexValues } = await import('@/lib/db/reconcile');
    await reconcileHandicapIndexValues();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      '[instrumentation] handicap reconcile failed:',
      err instanceof Error ? err.message : err,
    );
  }

  scheduleDailySync();
}

// Hour (UTC) of the daily roster sync; matches the cron in vercel.json.
const DAILY_SYNC_HOUR_UTC = 12;

declare global {
  // eslint-disable-next-line no-var
  var __dailySyncScheduled: boolean | undefined;
}

/**
 * On a long-running server (anything but Vercel) nothing calls
 * /api/cron/sync, and the GHIN token acquired at boot eventually expires.
 * Run the same job in-process once a day: log in again, then sync the roster.
 * Vercel keeps using its own cron, so this is skipped there.
 */
function scheduleDailySync() {
  if (process.env.VERCEL || process.env.NODE_ENV !== 'production') return;
  if (global.__dailySyncScheduled) return;
  global.__dailySyncScheduled = true;

  const run = async () => {
    try {
      const { refreshGhinAuthToken } = await import('@/lib/api/auth');
      const { syncAllGolfers } = await import('@/lib/services/syncEngine');
      await refreshGhinAuthToken();
      const results = await syncAllGolfers(3);
      const events = results.reduce((acc, r) => acc + r.feedEventsCreated, 0);
      // eslint-disable-next-line no-console
      console.log(`[daily-sync] synced ${results.length} golfers, ${events} new feed events.`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[daily-sync] failed:', err instanceof Error ? err.message : err);
    }
  };

  const arm = () => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(DAILY_SYNC_HOUR_UTC, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    const timer = setTimeout(() => {
      void run().finally(arm);
    }, next.getTime() - now.getTime());
    timer.unref?.();
  };
  arm();
}
