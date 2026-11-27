// src/lib/services/feed.ts
//
// The feed query, shared by GET /api/feed and the home page's server render.

import { desc, eq } from 'drizzle-orm';
import { db, feedEvents, golfers } from '@/lib/db';
import type { FeedEventDTO, FeedEventImportance, FeedEventType } from '@/types/golf';

const KNOWN_TYPES: ReadonlySet<FeedEventType> = new Set([
  'SCORE_POSTED',
  'HANDICAP_CHANGED',
  'LOW_ROUND_ALERT',
  'MILESTONE',
  'ADMIN_ANNOUNCEMENT',
  'CUP_RESULT',
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

/** Events with their golfer's name, newest first; id breaks createdAt ties. */
export async function getFeedEvents(limit: number): Promise<FeedEventDTO[]> {
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

  return rows.map((e) => ({
    id: e.id,
    golferId: e.golferId,
    golferName: e.golferName ?? null,
    type: KNOWN_TYPES.has(e.type as FeedEventType) ? (e.type as FeedEventType) : 'MILESTONE',
    headline: e.headline,
    details: e.details,
    importance: KNOWN_IMPORTANCE.has(e.importance as FeedEventImportance)
      ? (e.importance as FeedEventImportance)
      : 'MEDIUM',
    createdAt: toIso(e.createdAt),
  }));
}
