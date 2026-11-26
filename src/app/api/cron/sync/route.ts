import { NextResponse } from 'next/server';
import { syncAllGolfers } from '@/lib/services/syncEngine';
import { cleanEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Periodic roster sync. Hit by Vercel Cron on the schedule defined in
 * vercel.json. Vercel attaches `Authorization: Bearer <CRON_SECRET>` when
 * CRON_SECRET is configured; we verify it to prevent random callers from
 * triggering syncs (and thus burning GHIN quota).
 *
 * Without CRON_SECRET the route is open only in development and on Vercel
 * (whose cron is the caller). A self-hosted production server syncs
 * in-process (src/instrumentation.ts) and answers 404 here, so the public
 * cannot trigger syncs.
 */
export async function GET(req: Request) {
  const secret = cleanEnv(process.env.CRON_SECRET);
  if (!secret && process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
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
