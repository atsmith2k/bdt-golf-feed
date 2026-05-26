import { NextResponse } from 'next/server';
import { backfillRosterFeed } from '@/lib/services/syncEngine';
import { isAppError } from '@/lib/utils/error';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Replay locally-cached scores into the feed for every golfer on the roster.
 * Emits SCORE_POSTED + LOW_ROUND_ALERT entries that don't already exist,
 * backdated to each round's date_played. Does NOT contact the GHIN API.
 */
export async function POST() {
  try {
    const results = await backfillRosterFeed();
    const total = results.reduce((acc, r) => acc + r.feedEventsCreated, 0);
    return NextResponse.json({ results, totalEvents: total });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
