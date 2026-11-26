import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db, golfers } from '@/lib/db';
import type { RosterEntryDTO } from '@/types/golf';
import { parseHandicapIndex } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    // Step 1: all golfers. Sorting happens in JS rather than SQL because the
    // cached numeric column can have the wrong sign for plus handicaps inserted
    // before the parser fix; truth lives in the canonical handicapIndex string.
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

    // Step 2: recent revisions, for the trend arrows.
    const trends = new Map<string, { latest: string; prior: string }>();
    if (all.length > 0) {
      // Only the two newest revisions per golfer are needed, so let Postgres
      // pick them (it walks the golferId/revisionDate index) instead of
      // sending the whole, ever-growing revision history on every request.
      const { rows: recentRevisions } = await db.execute<{
        golferId: string;
        handicapIndex: string;
      }>(sql`
        select "golferId", "handicapIndex"
        from (
          select "golferId", "handicapIndex",
                 row_number() over (
                   partition by "golferId"
                   -- GHIN can issue two revisions on one date; its ids grow
                   -- over time, so the higher id is the later one.
                   order by "revisionDate" desc,
                            length("ghinRevisionId") desc nulls last,
                            "ghinRevisionId" desc nulls last,
                            "createdAt" desc
                 ) as rn
          from "HandicapRevision"
        ) ranked
        where rn <= 2
        order by "golferId", rn
      `);

      // Group by golfer (newest first within each).
      const byGolfer = new Map<string, { handicapIndex: string }[]>();
      for (const r of recentRevisions) {
        const list = byGolfer.get(r.golferId) ?? [];
        list.push({ handicapIndex: r.handicapIndex });
        byGolfer.set(r.golferId, list);
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
