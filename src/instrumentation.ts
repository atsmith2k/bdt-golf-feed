// src/instrumentation.ts
//
// Next.js calls `register()` once when the server boots. Everything it does
// needs Node (database driver, timers), so it lives in instrumentation-node.ts
// and is imported inside this runtime check; that form lets the bundler leave
// it out of the edge build entirely.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startServer } = await import('./instrumentation-node');
    await startServer();
  }
}
