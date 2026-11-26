import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db, feedEvents, golfers } from '@/lib/db';
import type { FeedEventDTO, FeedEventImportance, FeedEventType } from '@/types/golf';

export const dynamic = 'force-dynamic';

const KNOWN_TYPES: ReadonlySet<FeedEventType> = new Set([
  'SCORE_POSTED',
  'HANDICAP_CHANGED',
  'LOW_ROUND_ALERT',
  'MILESTONE',
  'ADMIN_ANNOUNCEMENT',
]);
const KNOWN_IMPORTANCE: ReadonlySet<FeedEventImportance> = new Set([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);

function toIso(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const isoCandidate = value.includes('T')
      ? value
      : value.replace(' ', 'T') + (value.endsWith('Z') ? '' : 'Z');
    const t = Date.parse(isoCandidate);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return new Date().toISOString();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1),
    200,
  );

  try {
    // Events with their golfer's name, newest first; id breaks createdAt ties.
    const rows = await db
      .select({
        id: feedEvents.id,
        golferId: feedEvents.golferId,
        golferName: golfers.fullName,
        type: feedEvents.type,
        headline: feedEvents.headline,
        details: feedEvents.details,
        importance: feedEvents.importance,
        createdAt: feedEvents.createdAt,
      })
      .from(feedEvents)
      .leftJoin(golfers, eq(golfers.id, feedEvents.golferId))
      .orderBy(desc(feedEvents.createdAt), desc(feedEvents.id))
      .limit(limit);

    const dto: FeedEventDTO[] = rows.map((e) => ({
      id: e.id,
      golferId: e.golferId,
      golferName: e.golferName ?? null,
      type: KNOWN_TYPES.has(e.type as FeedEventType)
        ? (e.type as FeedEventType)
        : 'MILESTONE',
      headline: e.headline,
      details: e.details,
      importance: KNOWN_IMPORTANCE.has(e.importance as FeedEventImportance)
        ? (e.importance as FeedEventImportance)
        : 'MEDIUM',
      createdAt: toIso(e.createdAt),
    }));

    return NextResponse.json(
      { events: dto, count: dto.length },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0, must-revalidate',
        },
      },
    );
  } catch (err) {
    console.error('[api/feed] query failed:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      {
        error: 'Failed to load feed',
        message: err instanceof Error ? err.message : 'Unknown error',
        events: [],
        count: 0,
      },
      { status: 500 },
    );
  }
}
