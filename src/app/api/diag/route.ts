import { NextResponse } from 'next/server';
import { count, desc, eq } from 'drizzle-orm';
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

  // Per-golfer breakdown of what we have cached. We deliberately fetch
  // sequentially: Neon's HTTP driver opens a fresh connection per query and
  // 30-plus parallel calls in a tight loop occasionally drop responses.
  const allGolfers = await db.select().from(golfers);
  const perGolfer: Array<{
    ghinNumber: string;
    fullName: string;
    handicapIndex: string;
    scores: number;
    revisions: number;
    feedEvents: number;
    lastSyncedAt: string;
  }> = [];
  for (const g of allGolfers) {
    const [s] = await db
      .select({ value: count() })
      .from(scores)
      .where(eq(scores.golferId, g.id));
    const [r] = await db
      .select({ value: count() })
      .from(handicapRevisions)
      .where(eq(handicapRevisions.golferId, g.id));
    const [f] = await db
      .select({ value: count() })
      .from(feedEvents)
      .where(eq(feedEvents.golferId, g.id));
    perGolfer.push({
      ghinNumber: g.ghinNumber,
      fullName: g.fullName,
      handicapIndex: g.handicapIndex,
      scores: s.value,
      revisions: r.value,
      feedEvents: f.value,
      lastSyncedAt: g.lastSyncedAt.toISOString(),
    });
  }

  // Most recent 10 feed events for a quick eyeball check.
  const recentFeed = await db
    .select({
      id: feedEvents.id,
      type: feedEvents.type,
      headline: feedEvents.headline,
      createdAt: feedEvents.createdAt,
    })
    .from(feedEvents)
    .orderBy(desc(feedEvents.createdAt))
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
