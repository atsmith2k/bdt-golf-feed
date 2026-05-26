import { NextResponse } from 'next/server';
import { and, eq, like, sql } from 'drizzle-orm';
import { db, feedEvents } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * One-shot cleanup of broadcast noise. Admin-only. Deletes:
 *   - HANDICAP_CHANGED events whose headline contains "(±0.0)" — these were
 *     emitted before we tightened buildHandicapChangedEvent to ignore
 *     no-op revisionDate-only diffs.
 *   - HANDICAP_CHANGED events with payload.delta == 0.
 *
 * Returns the number of rows removed. Re-running is safe (idempotent).
 */
export async function POST() {
  // Two passes: text-based for old rows that may have non-JSON payloads,
  // payload-based for anything we missed.
  const headlineSweep = await db
    .delete(feedEvents)
    .where(
      and(
        eq(feedEvents.type, 'HANDICAP_CHANGED'),
        like(feedEvents.headline, '%(±0.0)%'),
      ),
    )
    .returning({ id: feedEvents.id });

  // Fallback: any HANDICAP_CHANGED whose JSON payload says delta == 0.
  // Postgres JSON operators on a text column require a cast; we keep this
  // simple by relying on a substring match in the payload.
  const payloadSweep = await db
    .delete(feedEvents)
    .where(
      and(
        eq(feedEvents.type, 'HANDICAP_CHANGED'),
        sql`${feedEvents.payload} LIKE '%"delta":0%'`,
      ),
    )
    .returning({ id: feedEvents.id });

  return NextResponse.json({
    deletedByHeadline: headlineSweep.length,
    deletedByPayload: payloadSweep.length,
    totalDeleted: headlineSweep.length + payloadSweep.length,
  });
}
