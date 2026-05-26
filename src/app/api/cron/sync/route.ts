import { NextResponse } from 'next/server';
import { syncAllGolfers } from '@/lib/services/syncEngine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Periodic roster sync. Hit by Vercel Cron on the schedule defined in
 * vercel.json. Vercel attaches `Authorization: Bearer <CRON_SECRET>` when
 * CRON_SECRET is configured; we verify it to prevent random callers from
 * triggering syncs (and thus burning GHIN quota).
 *
 * If CRON_SECRET is unset (e.g. local dev), the route allows requests
 * with no Authorization header so curl smoke tests work.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
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
