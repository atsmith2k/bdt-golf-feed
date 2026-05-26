import { NextResponse } from 'next/server';
import { desc, inArray } from 'drizzle-orm';
import { db, golfers, handicapRevisions } from '@/lib/db';
import type { RosterEntryDTO } from '@/types/golf';
import { parseHandicapIndex } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    // Step 1: pull all golfers with an explicit projection. Bare
    // `db.select().from(golfers)` has been observed to return an empty
    // result against the Neon HTTP driver in this project — the working
    // /api/golfers route uses an explicit projection, so do the same here.
    // We also sort in JS rather than SQL because the cached numeric column
    // can have the wrong sign for plus handicaps inserted before the parser
    // fix; truth lives in the canonical handicapIndex string.
    const all = await db
      .select({
        id: golfers.id,
        ghinNumber: golfers.ghinNumber,
        fullName: golfers.fullName,
        handicapIndex: golfers.handicapIndex,
        handicapIndexValue: golfers.handicapIndexValue,
        club: golfers.club,
        lastSyncedAt: golfers.lastSyncedAt,
      })
      .from(golfers);

    // Step 2: pull recent revisions for the entire roster in a single
    // IN(...) query. The previous implementation used Promise.all to fan
    // out one query per golfer, which the Neon HTTP driver has been
    // observed to silently drop responses from once concurrency rises.
    const trends = new Map<string, { latest: string; prior: string }>();
    if (all.length > 0) {
      const golferIds = all.map((g) => g.id);
      const allRevisions = await db
        .select({
          golferId: handicapRevisions.golferId,
          handicapIndex: handicapRevisions.handicapIndex,
          revisionDate: handicapRevisions.revisionDate,
        })
        .from(handicapRevisions)
        .where(inArray(handicapRevisions.golferId, golferIds))
        .orderBy(desc(handicapRevisions.revisionDate));

      // Group revisions by golfer (already sorted newest-first by SQL).
      const byGolfer = new Map<string, { handicapIndex: string }[]>();
      for (const r of allRevisions) {
        const list = byGolfer.get(r.golferId) ?? [];
        if (list.length < 2) {
          list.push({ handicapIndex: r.handicapIndex });
          byGolfer.set(r.golferId, list);
        }
      }
      for (const [id, recents] of byGolfer) {
        if (recents.length >= 2) {
          trends.set(id, { latest: recents[0].handicapIndex, prior: recents[1].handicapIndex });
        }
      }
    }

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

    return NextResponse.json(
      { roster },
      { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } },
    );
  } catch (err) {
    console.error('[api/roster] query failed:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      {
        error: 'Failed to load roster',
        message: err instanceof Error ? err.message : 'Unknown error',
        roster: [],
      },
      { status: 500 },
    );
  }
}
