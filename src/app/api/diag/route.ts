import { NextResponse } from 'next/server';
import { count, desc } from 'drizzle-orm';
import { db, golfers, scores, handicapRevisions, feedEvents } from '@/lib/db';
import { getGhinAuthStatus } from '@/lib/api/auth';

export const dynamic = 'force-dynamic';

/**
 * Snapshot of what's actually in the database. Admin-only (gated by
 * middleware). Use this to verify whether ingest is reaching the DB:
 *
 *   curl https://localhost:3000/api/diag --cookie sgg_admin=$ADMIN_TOKEN
 *
 * Or just open it in the browser while logged into /admin.
 */
export async function GET() {
  const [golferCount] = await db.select({ value: count() }).from(golfers);
  const [scoreCount] = await db.select({ value: count() }).from(scores);
  const [revCount] = await db.select({ value: count() }).from(handicapRevisions);
  const [feedCount] = await db.select({ value: count() }).from(feedEvents);

  // Per-golfer breakdown of what we have cached: one grouped count per table
  // rather than three queries per golfer.
  const perTable = (table: typeof scores | typeof handicapRevisions | typeof feedEvents) =>
    db.select({ golferId: table.golferId, value: count() }).from(table).groupBy(table.golferId);
  const [allGolfers, scoreCounts, revisionCounts, feedCounts] = await Promise.all([
    db.select().from(golfers),
    perTable(scores),
    perTable(handicapRevisions),
    perTable(feedEvents),
  ]);
  const byGolfer = (rows: { golferId: string | null; value: number }[]) =>
    new Map(rows.map((r) => [r.golferId, r.value]));
  const scoresBy = byGolfer(scoreCounts);
  const revisionsBy = byGolfer(revisionCounts);
  const feedBy = byGolfer(feedCounts);
  const perGolfer = allGolfers.map((g) => ({
    ghinNumber: g.ghinNumber,
    fullName: g.fullName,
    handicapIndex: g.handicapIndex,
    scores: scoresBy.get(g.id) ?? 0,
    revisions: revisionsBy.get(g.id) ?? 0,
    feedEvents: feedBy.get(g.id) ?? 0,
    lastSyncedAt: g.lastSyncedAt.toISOString(),
  }));

  // Most recent 10 feed events for a quick eyeball check.
  const recentFeed = await db
    .select({
      id: feedEvents.id,
      type: feedEvents.type,
      headline: feedEvents.headline,
      createdAt: feedEvents.createdAt,
    })
    .from(feedEvents)
    .orderBy(desc(feedEvents.createdAt), desc(feedEvents.id))
    .limit(10);

  return NextResponse.json({
    totals: {
      golfers: golferCount.value,
      scores: scoreCount.value,
      handicapRevisions: revCount.value,
      feedEvents: feedCount.value,
    },
    ghinAuth: getGhinAuthStatus(),
    perGolfer,
    recentFeed: recentFeed.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
