import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db, golfers, handicapRevisions } from '@/lib/db';
import type { RosterEntryDTO } from '@/types/golf';
import { parseHandicapIndex } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Pull all golfers; we sort in JS (not SQL) because the cached numeric
  // column may have the wrong sign for plus handicaps inserted before the
  // parser fix. Truth lives in the canonical handicapIndex string.
  const all = await db.select().from(golfers);

  // Two most recent revisions per golfer for the trend arrow.
  const trends = new Map<string, { latest: string; prior: string }>();
  await Promise.all(
    all.map(async (g) => {
      const recents = await db
        .select({
          handicapIndex: handicapRevisions.handicapIndex,
          revisionDate: handicapRevisions.revisionDate,
        })
        .from(handicapRevisions)
        .where(eq(handicapRevisions.golferId, g.id))
        .orderBy(desc(handicapRevisions.revisionDate))
        .limit(2);
      if (recents.length >= 2) {
        trends.set(g.id, {
          latest: recents[0].handicapIndex,
          prior: recents[1].handicapIndex,
        });
      }
    }),
  );

  const roster: RosterEntryDTO[] = all
    .map((g) => {
      let trend: RosterEntryDTO['trend'] = 'FLAT';
      let trendDelta = 0;
      const t = trends.get(g.id);
      if (t) {
        const latest = parseHandicapIndex(t.latest);
        const prior = parseHandicapIndex(t.prior);
        if (!Number.isNaN(latest) && !Number.isNaN(prior)) {
          trendDelta = Math.round((latest - prior) * 10) / 10;
          if (trendDelta < 0) trend = 'DOWN';
          else if (trendDelta > 0) trend = 'UP';
        }
      }
      const parsedIndex = parseHandicapIndex(g.handicapIndex);
      const sortValue = Number.isFinite(parsedIndex)
        ? parsedIndex
        : Number.isFinite(g.handicapIndexValue)
          ? g.handicapIndexValue
          : Number.POSITIVE_INFINITY;
      return {
        entry: {
          id: g.id,
          ghinNumber: g.ghinNumber,
          fullName: g.fullName,
          handicapIndex: g.handicapIndex,
          handicapIndexValue: sortValue,
          club: g.club,
          trend,
          trendDelta,
          lastSyncedAt: g.lastSyncedAt.toISOString(),
        } as RosterEntryDTO,
        sortValue,
      };
    })
    .sort((a, b) => a.sortValue - b.sortValue)
    .map(({ entry }) => entry);

  return NextResponse.json({ roster });
}
