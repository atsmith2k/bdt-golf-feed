import { NextResponse } from 'next/server';
import { desc, inArray } from 'drizzle-orm';
import { db, feedEvents, golfers } from '@/lib/db';
import type { FeedEventDTO, FeedEventImportance, FeedEventType } from '@/types/golf';

export const dynamic = 'force-dynamic';
// Belt and suspenders: prevent Next.js's extended fetch from caching the
// outgoing Neon HTTP request even though the driver's body varies per call.
export const revalidate = 0;
export const fetchCache = 'force-no-store';

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
    // Step 1: pull the feed events themselves. No JOIN — the Neon HTTP
    // driver has been observed to silently return an empty result for
    // certain LEFT JOIN + ORDER BY + LIMIT combinations above ~20 rows,
    // and there's no operational reason to do this in a single SQL query.
    const rows = await db
      .select({
        id: feedEvents.id,
        golferId: feedEvents.golferId,
        type: feedEvents.type,
        headline: feedEvents.headline,
        details: feedEvents.details,
        importance: feedEvents.importance,
        createdAt: feedEvents.createdAt,
      })
      .from(feedEvents)
      .orderBy(desc(feedEvents.createdAt))
      .limit(limit);

    // Step 2: resolve golfer names with a single IN(...) lookup. The roster
    // is tiny so this is essentially free and bounded.
    const golferIds = Array.from(
      new Set(rows.map((r) => r.golferId).filter((id): id is string => !!id)),
    );
    const golferNameById = new Map<string, string>();
    if (golferIds.length > 0) {
      const golferRows = await db
        .select({ id: golfers.id, fullName: golfers.fullName })
        .from(golfers)
        .where(inArray(golfers.id, golferIds));
      for (const g of golferRows) {
        golferNameById.set(g.id, g.fullName);
      }
    }

    const dto: FeedEventDTO[] = rows.map((e) => ({
      id: e.id,
      golferId: e.golferId,
      golferName: e.golferId ? (golferNameById.get(e.golferId) ?? null) : null,
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
