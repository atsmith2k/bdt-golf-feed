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
}
