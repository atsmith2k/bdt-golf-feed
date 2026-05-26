import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import {
  db,
  golfers,
  scores as scoresTbl,
  handicapRevisions as revisionsTbl,
  feedEvents,
} from '@/lib/db';
import type {
  GhinHoleDetail,
  GhinRoundStatistics,
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

    const [scoreRows, revisionRows, eventRows] = await Promise.all([
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

    const statistics: ProfileStatisticsDTO | null = aggregateStatistics(
      scoreRows,
      golfer.lastSyncedAt,
    );

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
  holeDetails: string | null;
  roundStatistics: string | null;
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

  // GHIN emits `999` (and occasionally absurdly large numbers) as a
  // sentinel for "no net score recorded" on away rounds and certain
  // non-handicap formats. Drop them before averaging — otherwise a
  // single 999 in 80 rounds inflates the average by ~12 strokes. We
  // also defensively cap on a sane plausible-range upper bound (200)
  // to absorb any other noise GHIN might surface.
  const eighteenWithNet = eighteen.filter(
    (r) => Number.isFinite(r.netScore) && r.netScore > 0 && r.netScore < 200,
  );

  const lowestAGS18 = eighteen.length
    ? Math.min(...eighteen.map((r) => r.adjustedGrossScore))
    : null;
  const lowestAGS9 = nine.length
    ? Math.min(...nine.map((r) => r.adjustedGrossScore))
    : null;
  const lowestNet18 = eighteenWithNet.length
    ? Math.min(...eighteenWithNet.map((r) => r.netScore))
    : null;

  const avgAGS18 = average(eighteen.map((r) => r.adjustedGrossScore));
  const avgNet18 = average(eighteenWithNet.map((r) => r.netScore));

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
 * Aggregate scoring-mix and advanced statistics from the per-round
 * `roundStatistics` and `holeDetails` blobs we now persist on each
 * Score row.
 *
 * Two layers of derivation:
 *
 *   1. `holeDetails[]` — when present, gives us a clean source of truth
 *      for birdie/par/bogey distribution and per-par-class averages.
 *      Hole-by-hole rollup is preferred over the per-round `statistics`
 *      block because GHIN computes the latter on a single round and we
 *      want the across-rounds distribution.
 *
 *   2. `roundStatistics` — used only for the advanced fields
 *      (fairways/GIR/putts/up-and-downs) since those aren't available
 *      from hole_details. Most posted rounds leave these as zero, which
 *      we treat as "not tracked" by counting only rounds where any
 *      advanced field is non-zero.
 *
 * Returns null when there's nothing meaningful to aggregate (no rounds
 * with hole detail and no per-round stats blocks).
 */
function aggregateStatistics(
  rows: RawScoreRow[],
  lastSyncedAt: Date,
): ProfileStatisticsDTO | null {
  if (rows.length === 0) return null;

  let birdiesOrBetter = 0;
  let pars = 0;
  let bogeys = 0;
  let doubleBogeys = 0;
  let tripleOrWorse = 0;
  let totalHoles = 0;

  // Per-par-class averages aggregated across every counted hole. We could
  // average the per-round `statistics.parNsAverage` instead, but rolling
  // up the raw hole_details entries gives us a true per-stroke average
  // weighted by how many of that par class the player has played.
  let par3Sum = 0;
  let par3Count = 0;
  let par4Sum = 0;
  let par4Count = 0;
  let par5Sum = 0;
  let par5Count = 0;

  let summaryRounds = 0;

  for (const row of rows) {
    const holes = parseJsonOrNull<GhinHoleDetail[]>(row.holeDetails);
    const stats = parseJsonOrNull<GhinRoundStatistics>(row.roundStatistics);
    if (!holes && !stats) continue;
    summaryRounds += 1;

    if (holes && holes.length > 0) {
      for (const h of holes) {
        if (h.xHole) continue;
        const par = Number(h.par);
        const score = Number(h.adjustedGrossScore);
        if (!Number.isFinite(par) || !Number.isFinite(score)) continue;
        const diff = score - par;
        totalHoles += 1;
        if (diff <= -1) birdiesOrBetter += 1;
        else if (diff === 0) pars += 1;
        else if (diff === 1) bogeys += 1;
        else if (diff === 2) doubleBogeys += 1;
        else if (diff >= 3) tripleOrWorse += 1;

        if (par === 3) {
          par3Sum += score;
          par3Count += 1;
        } else if (par === 4) {
          par4Sum += score;
          par4Count += 1;
        } else if (par === 5) {
          par5Sum += score;
          par5Count += 1;
        }
      }
    } else if (stats) {
      // No hole_details on this round but the round-level statistics are
      // present (decimals 0–1 representing that round's distribution).
      // Treat the round as 18 weighted units so it contributes
      // proportionally to the across-rounds distribution.
      const holesInRound = row.numberOfHoles === 9 ? 9 : 18;
      birdiesOrBetter += stats.birdiesOrBetterPercent * holesInRound;
      pars += stats.parsPercent * holesInRound;
      bogeys += stats.bogeysPercent * holesInRound;
      doubleBogeys += stats.doubleBogeysPercent * holesInRound;
      tripleOrWorse += stats.tripleBogeysOrWorsePercent * holesInRound;
      totalHoles += holesInRound;
    }
  }

  const advanced = aggregateAdvanced(rows);

  if (summaryRounds === 0 && advanced.statsRounds === 0) return null;

  const pct = (n: number): number | null =>
    totalHoles > 0 ? Math.round((n / totalHoles) * 100) : null;

  return {
    totalSummaryRounds: summaryRounds,
    totalStatsRounds: advanced.statsRounds,
    scoreSummary: {
      birdiesOrBetterPercent: pct(birdiesOrBetter),
      parsPercent: pct(pars),
      bogeysPercent: pct(bogeys),
      doubleBogeysPercent: pct(doubleBogeys),
      tripleBogeysOrWorsePercent: pct(tripleOrWorse),
      parsOrBetter: totalHoles > 0 ? Math.round(birdiesOrBetter + pars) : null,
      par3sAverage: par3Count > 0 ? Math.round((par3Sum / par3Count) * 100) / 100 : null,
      par4sAverage: par4Count > 0 ? Math.round((par4Sum / par4Count) * 100) / 100 : null,
      par5sAverage: par5Count > 0 ? Math.round((par5Sum / par5Count) * 100) / 100 : null,
    },
    advancedStats: advanced.values,
    updatedAt: lastSyncedAt.toISOString(),
  };
}

interface AggregatedAdvanced {
  statsRounds: number;
  values: ProfileStatisticsDTO['advancedStats'];
}

/**
 * Aggregate the advanced (shot-tracked) stats. Most posted rounds have
 * all-zero values here — those rounds are excluded from the average so
 * one shot-tracked round next to ten untracked ones doesn't get diluted
 * to a tenth of its real value. A round counts as tracked if any of
 * fairways / GIR / putts is non-zero.
 */
function aggregateAdvanced(rows: RawScoreRow[]): AggregatedAdvanced {
  let fairways = 0;
  let leftMisses = 0;
  let rightMisses = 0;
  let gir = 0;
  let onePutt = 0;
  let twoPutt = 0;
  let threePutt = 0;
  let putts = 0;
  let upAndDowns = 0;
  let counted = 0;

  for (const row of rows) {
    const stats = parseJsonOrNull<GhinRoundStatistics>(row.roundStatistics);
    if (!stats) continue;
    const tracked =
      stats.fairwayHitsPercent > 0 ||
      stats.girPercent > 0 ||
      stats.puttsTotal > 0 ||
      stats.onePuttOrBetterPercent > 0 ||
      stats.twoPuttPercent > 0 ||
      stats.threePuttOrWorsePercent > 0;
    if (!tracked) continue;
    counted += 1;
    fairways += stats.fairwayHitsPercent;
    leftMisses += stats.missedLeftPercent;
    rightMisses += stats.missedRightPercent;
    gir += stats.girPercent;
    onePutt += stats.onePuttOrBetterPercent;
    twoPutt += stats.twoPuttPercent;
    threePutt += stats.threePuttOrWorsePercent;
    putts += stats.puttsTotal;
    upAndDowns += stats.upAndDownsTotal;
  }

  if (counted === 0) {
    return {
      statsRounds: 0,
      values: {
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
  }

  const avgPct = (n: number) => Math.round((n / counted) * 100);
  return {
    statsRounds: counted,
    values: {
      fairwayHitsPercent: avgPct(fairways),
      missedLeftPercent: avgPct(leftMisses),
      missedRightPercent: avgPct(rightMisses),
      girPercent: avgPct(gir),
      onePuttOrBetterPercent: avgPct(onePutt),
      twoPuttPercent: avgPct(twoPutt),
      threePuttOrWorsePercent: avgPct(threePutt),
      putts: Math.round((putts / counted) * 10) / 10,
      upAndDownsTotal: Math.round((upAndDowns / counted) * 10) / 10,
    },
  };
}

function parseJsonOrNull<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

