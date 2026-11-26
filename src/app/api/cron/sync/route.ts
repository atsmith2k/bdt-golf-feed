import { NextResponse } from 'next/server';
import { syncAllGolfers } from '@/lib/services/syncEngine';
import { cleanEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Roster sync for an external scheduler. The server already syncs once a day
 * by itself (src/instrumentation-node.ts), so this is only needed for a
 * different cadence: set CRON_SECRET and call it with
 * `Authorization: Bearer <CRON_SECRET>`.
 *
 * Without CRON_SECRET it is open in development (for curl smoke tests) and
 * answers 404 in production, so the public cannot trigger syncs.
 */
export async function GET(req: Request) {
  const secret = cleanEnv(process.env.CRON_SECRET);
  if (!secret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (secret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const results = await syncAllGolfers(3);
    const totalEvents = results.reduce((acc, r) => acc + r.feedEventsCreated, 0);
    return NextResponse.json({
      ok: true,
      synced: results.length,
      totalEvents,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
