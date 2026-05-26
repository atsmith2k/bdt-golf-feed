import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import {
  db,
  golfers,
  scores as scoresTbl,
  handicapRevisions as revisionsTbl,
  feedEvents,
  golferStats,
} from '@/lib/db';
import type {
  GhinGolferStatistics,
  GolferProfileDTO,
  ProfileCourseStatDTO,
  ProfileFeedEventDTO,
  ProfileHandicapPointDTO,
  ProfileRevisionDTO,
  ProfileScoreDTO,
  ProfileStatisticsDTO,
  ProfileStatsDTO,
  FeedEventImportance,
  FeedEventType,
} from '@/types/golf';
import { parseHandicapIndex, relativeToRating } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface Ctx {
  params: { ghin: string };
}

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

/**
 * Public golfer profile endpoint.
 *
 * Lives under /api/roster/[ghin] (not /api/golfers/[ghin]) so it sits outside
 * the admin-auth middleware matcher and can be consumed from the public
 * /roster/[ghin] page. Reads exclusively from the local DB — the sync
 * pipeline already pulls and caches everything we need from GHIN.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const ghin = decodeURIComponent(params.ghin ?? '').trim();
  if (!ghin) {
    return NextResponse.json({ error: 'Missing GHIN number' }, { status: 400 });
  }

  try {
    const [golfer] = await db
      .select()
      .from(golfers)
      .where(eq(golfers.ghinNumber, ghin))
      .limit(1);

    if (!golfer) {
      return NextResponse.json(
        { error: 'Golfer not found', ghinNumber: ghin },
        { status: 404 },
      );
    }

    const [scoreRows, revisionRows, eventRows, statsRow] = await Promise.all([
      db
        .select()
        .from(scoresTbl)
        .where(eq(scoresTbl.golferId, golfer.id))
        .orderBy(desc(scoresTbl.datePlayed)),
      db
        .select()
        .from(revisionsTbl)
        .where(eq(revisionsTbl.golferId, golfer.id))
        .orderBy(desc(revisionsTbl.revisionDate)),
      db
        .select({
          id: feedEvents.id,
          type: feedEvents.type,
          headline: feedEvents.headline,
          details: feedEvents.details,
          importance: feedEvents.importance,
          createdAt: feedEvents.createdAt,
        })
        .from(feedEvents)
        .where(eq(feedEvents.golferId, golfer.id))
        .orderBy(desc(feedEvents.createdAt))
        .limit(40),
      db
        .select()
        .from(golferStats)
        .where(eq(golferStats.golferId, golfer.id))
        .limit(1),
    ]);

    const recentScores: ProfileScoreDTO[] = scoreRows.slice(0, 25).map((s) => ({
      id: s.id,
      datePlayed: s.datePlayed,
      courseName: s.courseName,
      adjustedGrossScore: s.adjustedGrossScore,
      score: s.score,
      netScore: s.netScore,
      courseRating: s.courseRating ?? null,
      courseSlope: s.courseSlope ?? null,
      teeColor: s.teeColor ?? null,
      numberOfHoles: s.numberOfHoles ?? null,
      toParDisplay: s.toParDisplay ?? null,
      handicapIndexAtTime: s.handicapIndexAtTime ?? null,
      vsRating: relativeToRating(s.adjustedGrossScore, s.courseRating),
    }));

    const revisions: ProfileRevisionDTO[] = revisionRows.slice(0, 40).map((r) => ({
      revisionDate: r.revisionDate,
      handicapIndex: r.handicapIndex,
      handicapIndexValue: parseHandicapIndex(r.handicapIndex),
      club: r.club ?? null,
      lowHandicapIndex: r.lowHandicapIndex ?? null,
      isSoftCap: r.isSoftCap === 'Y',
      isHardCap: r.isHardCap === 'Y',
      hiBeforeSoftCap: r.hiBeforeSoftCap ?? null,
    }));

    const activeCap: GolferProfileDTO['activeCap'] = revisions[0]
      ? revisions[0].isHardCap
        ? 'HARD'
        : revisions[0].isSoftCap
          ? 'SOFT'
          : null
      : null;

    const statistics: ProfileStatisticsDTO | null = statsRow[0]
      ? buildStatisticsDTO(statsRow[0])
      : null;

    const stats = computeStats(scoreRows);
    const handicapHistory = buildHandicapHistory(scoreRows, revisionRows, golfer);
    const courseBreakdown = buildCourseBreakdown(scoreRows);

    // Trend mirrors the roster card: compare the two most recent revisions
    // when available, otherwise the two most recent score-derived index
    // snapshots.
    const trendBasis = (revisionRows.length >= 2
      ? revisionRows.slice(0, 2).map((r) => r.handicapIndex)
      : scoreRows
          .map((s) => s.handicapIndexAtTime)
          .filter((s): s is string => !!s)
          .slice(0, 2)) as string[];
    let trend: GolferProfileDTO['trend'] = 'FLAT';
    let trendDelta = 0;
    if (trendBasis.length === 2) {
      const latest = parseHandicapIndex(trendBasis[0]);
      const prior = parseHandicapIndex(trendBasis[1]);
      if (Number.isFinite(latest) && Number.isFinite(prior)) {
        trendDelta = Math.round((latest - prior) * 10) / 10;
        if (trendDelta < 0) trend = 'DOWN';
        else if (trendDelta > 0) trend = 'UP';
      }
    }

    const events: ProfileFeedEventDTO[] = eventRows.map((e) => ({
      id: e.id,
      type: KNOWN_TYPES.has(e.type as FeedEventType)
        ? (e.type as FeedEventType)
        : 'MILESTONE',
      headline: e.headline,
      details: e.details,
      importance: KNOWN_IMPORTANCE.has(e.importance as FeedEventImportance)
        ? (e.importance as FeedEventImportance)
        : 'MEDIUM',
      createdAt:
        e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
    }));

    const profile: GolferProfileDTO = {
      id: golfer.id,
      ghinNumber: golfer.ghinNumber,
      firstName: golfer.firstName,
      lastName: golfer.lastName,
      fullName: golfer.fullName,
      handicapIndex: golfer.handicapIndex,
      handicapIndexValue: golfer.handicapIndexValue,
      lowHandicapIndex: golfer.lowHandicapIndex ?? null,
      club: golfer.club ?? null,
      association: golfer.association ?? null,
      status: golfer.status,
      revisionDate: golfer.revisionDate ?? null,
      createdAt: golfer.createdAt.toISOString(),
      lastSyncedAt: golfer.lastSyncedAt.toISOString(),
      trend,
      trendDelta,
      stats,
      recentScores,
      revisions,
      handicapHistory,
      courseBreakdown,
      events,
      activeCap,
      statistics,
    };

    return NextResponse.json(
      { profile },
      { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } },
    );
  } catch (err) {
    console.error('[api/roster/[ghin]] query failed:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      {
        error: 'Failed to load profile',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RawScoreRow {
  id: string;
  datePlayed: string;
  courseName: string;
  score: number;
  adjustedGrossScore: number;
  netScore: number;
  courseRating: string | null;
  courseSlope: string | null;
  teeColor: string | null;
  numberOfHoles: number | null;
  toParDisplay: string | null;
  handicapIndexAtTime: string | null;
}

function holesFor(s: RawScoreRow): 9 | 18 {
  if (s.numberOfHoles === 9) return 9;
  if (s.numberOfHoles === 18) return 18;
  // Defensive fallback for legacy rows that never had numberOfHoles set —
  // a sub-60 adjusted gross is almost always a 9-hole round.
  return s.adjustedGrossScore < 60 ? 9 : 18;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

/**
 * USGA-style score differential: (AGS - rating) * 113 / slope.
 * Returns null if any required input is missing or invalid.
 */
function scoreDifferential(s: RawScoreRow): number | null {
  if (holesFor(s) !== 18) return null;
  const rating = s.courseRating ? parseFloat(s.courseRating) : NaN;
  const slope = s.courseSlope ? parseFloat(s.courseSlope) : NaN;
  if (!Number.isFinite(rating) || !Number.isFinite(slope) || slope === 0) return null;
  return ((s.adjustedGrossScore - rating) * 113) / slope;
}

function computeStats(rows: RawScoreRow[]): ProfileStatsDTO {
  const eighteen = rows.filter((r) => holesFor(r) === 18);
  const nine = rows.filter((r) => holesFor(r) === 9);

  const lowestAGS18 = eighteen.length
    ? Math.min(...eighteen.map((r) => r.adjustedGrossScore))
    : null;
  const lowestAGS9 = nine.length
    ? Math.min(...nine.map((r) => r.adjustedGrossScore))
    : null;
  const lowestNet18 = eighteen.length ? Math.min(...eighteen.map((r) => r.netScore)) : null;

  const avgAGS18 = average(eighteen.map((r) => r.adjustedGrossScore));
  const avgNet18 = average(eighteen.map((r) => r.netScore));

  const differentials = eighteen
    .map(scoreDifferential)
    .filter((d): d is number => d != null && Number.isFinite(d))
    .slice(0, 20);
  const diffAvg = average(differentials);

  // Recent five vs prior five (18-hole rounds only). `rows` is already
  // sorted newest-first.
  let deltaLast5VsPrior5: number | null = null;
  if (eighteen.length >= 10) {
    const last5 = eighteen.slice(0, 5).map((r) => r.adjustedGrossScore);
    const prior5 = eighteen.slice(5, 10).map((r) => r.adjustedGrossScore);
    const lastAvg = average(last5);
    const priorAvg = average(prior5);
    if (lastAvg != null && priorAvg != null) {
      deltaLast5VsPrior5 = Math.round((lastAvg - priorAvg) * 10) / 10;
    }
  }

  // Best round relative to course rating (most strokes under rating, 18s only).
  let bestVsRating: ProfileStatsDTO['bestVsRating'] = null;
  for (const r of eighteen) {
    if (!r.courseRating) continue;
    const rating = parseFloat(r.courseRating);
    if (!Number.isFinite(rating)) continue;
    const diff = Math.round(r.adjustedGrossScore - rating);
    if (bestVsRating == null || diff < bestVsRating.diff) {
      bestVsRating = {
        scoreId: r.id,
        courseName: r.courseName,
        datePlayed: r.datePlayed,
        diff,
        adjustedGross: r.adjustedGrossScore,
        courseRating: r.courseRating,
      };
    }
  }

  const lastPlayedAt = rows[0]?.datePlayed ?? null;
  const uniqueCourses = new Set(rows.map((r) => r.courseName)).size;

  return {
    rounds: {
      total: rows.length,
      eighteenHole: eighteen.length,
      nineHole: nine.length,
    },
    lowest: {
      adjustedGross18: lowestAGS18,
      adjustedGross9: lowestAGS9,
      net18: lowestNet18,
    },
    averages: {
      adjustedGross18: avgAGS18,
      net18: avgNet18,
      differentialLast20: diffAvg,
    },
    scoringTrend: { deltaLast5VsPrior5 },
    bestVsRating,
    lastPlayedAt,
    uniqueCourses,
  };
}

/**
 * Build the handicap-trend timeline. Prefers the dedicated
 * HandicapRevision rows when available (they're the canonical source);
 * otherwise reconstructs the timeline from `handicapIndexAtTime` snapshots
 * embedded in score rows. Always includes the current live index as the
 * trailing point so the chart matches the headline number.
 */
function buildHandicapHistory(
  scoreRows: RawScoreRow[],
  revisionRows: { revisionDate: string; handicapIndex: string }[],
  golfer: { handicapIndex: string; handicapIndexValue: number; revisionDate: string | null },
): ProfileHandicapPointDTO[] {
  const points: ProfileHandicapPointDTO[] = [];

  if (revisionRows.length > 0) {
    // Revisions arrive newest-first from the DB query; the chart reads
    // oldest-first. GHIN sometimes posts multiple revisions on the same
    // calendar day (a club re-post or correction). Group by date and
    // keep the latest one per day — `revisionRows` is already
    // newest-first, so the first occurrence per date wins.
    const latestByDate = new Map<string, { handicapIndex: string }>();
    for (const r of revisionRows) {
      if (!latestByDate.has(r.revisionDate)) {
        latestByDate.set(r.revisionDate, { handicapIndex: r.handicapIndex });
      }
    }
    const ordered = Array.from(latestByDate.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    for (const r of ordered) {
      const v = parseHandicapIndex(r.handicapIndex);
      if (!Number.isFinite(v)) continue;
      points.push({ date: r.date, value: v, label: r.handicapIndex });
    }
  } else if (scoreRows.length > 0) {
    // Walk scores oldest-first; only emit a point when the index actually
    // changed so the line shows movement rather than a flat staircase.
    const ordered = [...scoreRows].sort((a, b) => (a.datePlayed < b.datePlayed ? -1 : 1));
    let last: number | null = null;
    for (const s of ordered) {
      if (!s.handicapIndexAtTime) continue;
      const v = parseHandicapIndex(s.handicapIndexAtTime);
      if (!Number.isFinite(v)) continue;
      const rounded = Math.round(v * 10) / 10;
      if (last !== null && Math.round(last * 10) / 10 === rounded) continue;
      points.push({
        date: s.datePlayed,
        value: v,
        label: s.handicapIndexAtTime,
      });
      last = v;
    }
  }

  // Always anchor to the current index. If the trailing point already matches,
  // skip the duplicate.
  const liveValue = golfer.handicapIndexValue;
  const liveDate = golfer.revisionDate ?? new Date().toISOString().slice(0, 10);
  const tail = points[points.length - 1];
  const tailRounded = tail ? Math.round(tail.value * 10) / 10 : null;
  const liveRounded = Math.round(liveValue * 10) / 10;
  if (Number.isFinite(liveValue) && (!tail || tailRounded !== liveRounded)) {
    points.push({ date: liveDate, value: liveValue, label: golfer.handicapIndex });
  }

  return points;
}

function buildCourseBreakdown(rows: RawScoreRow[]): ProfileCourseStatDTO[] {
  const byCourse = new Map<string, RawScoreRow[]>();
  for (const r of rows) {
    const list = byCourse.get(r.courseName) ?? [];
    list.push(r);
    byCourse.set(r.courseName, list);
  }
  return Array.from(byCourse.entries())
    .map(([courseName, list]) => {
      const eighteens = list.filter((r) => holesFor(r) === 18);
      const sample = eighteens.length > 0 ? eighteens : list;
      const best = Math.min(...sample.map((r) => r.adjustedGrossScore));
      const avg = average(sample.map((r) => r.adjustedGrossScore)) ?? best;
      return {
        courseName,
        rounds: list.length,
        bestAdjustedGross: best,
        averageAdjustedGross: avg,
      };
    })
    .sort((a, b) => b.rounds - a.rounds || a.bestAdjustedGross - b.bestAdjustedGross)
    .slice(0, 8);
}

/**
 * Decode a stored statistics payload into the public DTO shape, falling
 * back to the columnar fields if the JSON blob is unparseable for any
 * reason. Returns null only when both inputs are unusable, which the
 * caller already handles with a missing `statsRow` early return.
 */
function buildStatisticsDTO(row: {
  payload: string;
  totalSummaryRounds: number;
  totalStatsRounds: number;
  updatedAt: Date;
}): ProfileStatisticsDTO {
  let parsed: GhinGolferStatistics | null = null;
  try {
    parsed = JSON.parse(row.payload) as GhinGolferStatistics;
  } catch {
    parsed = null;
  }
  const empty: GhinGolferStatistics = {
    totalSummaryRounds: row.totalSummaryRounds,
    totalStatsRounds: row.totalStatsRounds,
    scoreSummary: {
      birdiesOrBetterPercent: null,
      parsPercent: null,
      bogeysPercent: null,
      doubleBogeysPercent: null,
      tripleBogeysOrWorsePercent: null,
      parsOrBetter: null,
      par3sAverage: null,
      par4sAverage: null,
      par5sAverage: null,
    },
    advancedStats: {
      fairwayHitsPercent: null,
      missedLeftPercent: null,
      missedRightPercent: null,
      girPercent: null,
      onePuttOrBetterPercent: null,
      twoPuttPercent: null,
      threePuttOrWorsePercent: null,
      putts: null,
      upAndDownsTotal: null,
    },
  };
  const src = parsed ?? empty;
  return {
    totalSummaryRounds: row.totalSummaryRounds,
    totalStatsRounds: row.totalStatsRounds,
    scoreSummary: src.scoreSummary,
    advancedStats: src.advancedStats,
    updatedAt: row.updatedAt.toISOString(),
  };
}

