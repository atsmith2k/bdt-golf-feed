// src/lib/api/ghin.ts
import { ghinApiClient } from './client';
import { GhinGolferDetails, GhinGolferStatistics, GhinScore } from '@/types/golf';
import { createGhinApiError } from '@/lib/utils/error';
import { parseHandicapIndex } from '@/lib/utils/format';

/**
 * Search for a golfer by GHIN number.
 *
 * Note: GHIN's search endpoint expects `golfer_id`, not `ghin_number` —
 * the latter returns HTTP 400. Confirmed against the legacy authenticated
 * client (see ghin.service.ts-old `getGolferDetails`).
 *
 * The response shape varies a bit too: in some accounts the identifier
 * comes back as `ghin_number`, in others as `golfer_id`. We accept either
 * and fall back to the value we searched with so the downstream record
 * always has a non-empty `ghinNumber`.
 */
export async function searchGolferByGhin(ghinNumber: string): Promise<GhinGolferDetails> {
  try {
    const response = await ghinApiClient.get<any>(
      `/golfers/search.json?per_page=1&page=1&golfer_id=${encodeURIComponent(ghinNumber)}`,
    );

    if (!response.golfers || response.golfers.length === 0) {
      throw createGhinApiError(`No golfer found with GHIN number ${ghinNumber}`);
    }

    const golfer = response.golfers[0];
    const resolvedGhin = String(
      golfer.ghin_number ?? golfer.golfer_id ?? ghinNumber ?? '',
    ).trim();
    if (!resolvedGhin) {
      throw createGhinApiError(
        `GHIN response did not include an identifier for golfer ${ghinNumber}.`,
        golfer,
      );
    }

    const handicapIndexRaw = golfer.handicap_index ?? '';
    const handicapIndexValue = parseHandicapIndex(handicapIndexRaw);
    const lowHandicapIndexRaw = golfer.low_handicap_index ?? null;
    const lowHandicapIndexValue =
      lowHandicapIndexRaw != null ? parseHandicapIndex(lowHandicapIndexRaw) : undefined;

    return {
      ghinNumber: resolvedGhin,
      firstName: golfer.first_name,
      lastName: golfer.last_name,
      fullName: `${golfer.first_name ?? ''} ${golfer.last_name ?? ''}`.trim(),
      gender: golfer.gender,
      handicapIndex: handicapIndexRaw || 'NH',
      handicapIndexValue: Number.isFinite(handicapIndexValue) ? handicapIndexValue : 54,
      association: golfer.association,
      club: golfer.club_name,
      state: golfer.state,
      country: golfer.country,
      lowHandicapIndex: lowHandicapIndexRaw ?? undefined,
      lowHandicapIndexValue:
        lowHandicapIndexValue != null && Number.isFinite(lowHandicapIndexValue)
          ? lowHandicapIndexValue
          : undefined,
      lowHandicapDate: golfer.low_hi_date,
      revisionDate: golfer.revision_date,
      status: golfer.status,
      isSoftCap: golfer.is_soft_cap,
      isHardCap: golfer.is_hard_cap,
    };
  } catch (error: any) {
    if (error.code === 'GHIN_API_ERROR') {
      throw error;
    }

    throw createGhinApiError(`Error searching for golfer: ${error.message}`);
  }
}

/**
 * Get a golfer's scores.
 *
 * Uses the flat search endpoint (`/scores.json?golfer_id=…`) rather than the
 * nested envelope at `/golfers/{ghin}/scores.json`. The latter returns
 * `{ recent_scores, revision_scores, 9_hole_score, deleted_scores }` and is
 * a pain to merge correctly. The search endpoint returns a paginated
 * `{ scores: [...], total_count }` covering all rounds in one shape.
 *
 * Defaults to `limit=100&offset=1` which is the most we typically need for
 * a single golfer's recent history; pass options to widen the window.
 */
export async function getGolferScores(
  ghinNumber: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<GhinScore[]> {
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 1;
  try {
    const response = await ghinApiClient.get<any>(
      `/scores.json?golfer_id=${encodeURIComponent(ghinNumber)}&limit=${limit}&offset=${offset}&source=GHINcom`,
    );

    const scores = Array.isArray(response?.scores) ? response.scores : [];
    if (scores.length === 0) return [];

    return scores.map(toGhinScore);
  } catch (error: any) {
    throw createGhinApiError(`Error fetching golfer scores: ${error.message}`);
  }
}

/**
 * Map a single raw GHIN score row to our internal shape. GHIN returns these
 * as numbers (not strings) for adjusted_gross_score / net_score / course_rating
 * etc.; coerce defensively in case a different account flavor returns strings.
 */
function toGhinScore(raw: any): GhinScore {
  const adjustedGross = Number(raw.adjusted_gross_score ?? 0);
  const net = Number(raw.net_score ?? adjustedGross);
  const score = Number(raw.score ?? adjustedGross);
  const numberOfHoles = Number(raw.number_of_holes ?? 0) || undefined;
  const toParDisplay =
    typeof raw.to_par_display_value === 'string' && raw.to_par_display_value.length > 0
      ? raw.to_par_display_value
      : undefined;

  return {
    id: String(raw.id ?? raw.score_id ?? ''),
    date: String(raw.played_at ?? raw.date_played ?? ''),
    // Prefer the display-formatted course name (which GHIN composes from
    // facility + sub-course like "The Shoals - The Schoolmaster"), fall
    // back to the raw course name, then facility, then a placeholder.
    courseName: String(
      raw.course_display_value ??
        raw.course_name ??
        raw.facility_name ??
        'Unknown Course',
    ),
    score,
    adjustedGrossScore: adjustedGross,
    netScore: net,
    courseRating:
      raw.course_rating != null && raw.course_rating !== '' ? String(raw.course_rating) : undefined,
    courseSlope:
      raw.slope_rating != null && raw.slope_rating !== ''
        ? String(raw.slope_rating)
        : raw.course_slope != null
          ? String(raw.course_slope)
          : undefined,
    playingConditions: raw.playing_conditions ?? undefined,
    teeColor: raw.tee_name ?? raw.tee_color ?? undefined,
    numberOfHoles,
    toParDisplay,
    handicapIndexAtTime:
      raw.handicap_index_display != null && raw.handicap_index_display !== ''
        ? String(raw.handicap_index_display)
        : raw.handicap_index != null
          ? String(raw.handicap_index)
          : undefined,
  };
}

/**
 * Get a golfer's handicap revisions.
 *
 * GHIN exposes two endpoints for this:
 *
 *   - `/golfers/{id}/handicap_history.json?revCount=0&date_begin=…&date_end=…`
 *     This is the version GHIN.com itself uses. Returns a rich row per
 *     revision (Display, Value, LowHIDisplay, soft/hard cap flags,
 *     HIBeforeSoftCapDisplay, etc.) and is reliably populated for every
 *     account we've tested.
 *
 *   - `/golfers/{id}/handicap_revisions.json`
 *     The legacy endpoint. Returns a slimmer shape and is documented as
 *     optional — many account types just 404 on it.
 *
 * We try the modern endpoint first and fall back to the legacy one if
 * GHIN ever stops serving it. 404 from both is treated as "no revision
 * history available" (empty array) rather than a hard error.
 */
export async function getGolferHandicapRevisions(ghinNumber: string): Promise<any[]> {
  // Pull a rolling 13-month window so we always get at least a full season
  // of history without burdening GHIN with an unbounded query.
  const today = new Date();
  const dateEnd = today.toISOString().slice(0, 10);
  const begin = new Date(today);
  begin.setUTCFullYear(begin.getUTCFullYear() - 1);
  begin.setUTCDate(begin.getUTCDate() - 30);
  const dateBegin = begin.toISOString().slice(0, 10);

  try {
    const response = await ghinApiClient.get<any>(
      `/golfers/${encodeURIComponent(ghinNumber)}/handicap_history.json?revCount=0&date_begin=${dateBegin}&date_end=${dateEnd}&source=GHINcom`,
    );

    const list = Array.isArray(response?.handicap_revisions)
      ? response.handicap_revisions
      : [];
    if (list.length > 0) {
      return list.map(toHandicapRevisionFromHistory).filter(Boolean) as any[];
    }
  } catch (error: any) {
    if (!isNotFoundError(error)) {
      throw createGhinApiError(`Error fetching golfer handicap history: ${error.message}`);
    }
    // 404 just means try the legacy shape below.
  }

  try {
    const response = await ghinApiClient.get<any>(
      `/golfers/${encodeURIComponent(ghinNumber)}/handicap_revisions.json`,
    );
    if (!response.handicap_revisions || response.handicap_revisions.length === 0) {
      return [];
    }
    return response.handicap_revisions.map((revision: any) => ({
      date: String(revision.revision_date ?? '').slice(0, 10),
      handicap: String(revision.handicap_index ?? ''),
      club: revision.club_name,
    }));
  } catch (error: any) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw createGhinApiError(`Error fetching golfer handicap revisions: ${error.message}`);
  }
}

function isNotFoundError(error: any): boolean {
  if (error?.code !== 'EXTERNAL_SERVICE_ERROR') return false;
  const message = typeof error?.message === 'string' ? error.message : '';
  // GHIN returns HTTP 404 for both "endpoint not exposed for this account"
  // and "this golfer's stats aren't shareable" — the latter shows up as
  // an "AccessDenied" body even though the status is 404. Treat both as
  // "no data available for this golfer", which is what callers want.
  return (
    message.includes('Not Found') ||
    /AccessDenied/i.test(message) ||
    /not authorized/i.test(message)
  );
}

/**
 * Map a row from `/handicap_history.json` to the internal revision shape.
 * Returns null when the upstream row is missing both a date and a value
 * (occasionally seen for placeholder rows).
 */
function toHandicapRevisionFromHistory(row: any): {
  date: string;
  handicap: string;
  ghinRevisionId?: string;
  club?: string;
  lowHandicapIndex?: string;
  isSoftCap?: boolean;
  isHardCap?: boolean;
  hiBeforeSoftCap?: string;
} | null {
  const rawDate = row?.RevDate ?? row?.rev_date ?? row?.revision_date ?? '';
  const date = String(rawDate).slice(0, 10);
  const handicap = String(row?.Display ?? row?.display ?? row?.Value ?? row?.handicap_index ?? '');
  if (!date || !handicap) return null;

  const rawId = row?.ID ?? row?.id ?? row?.revision_id ?? null;
  const ghinRevisionId =
    rawId == null || rawId === '' ? undefined : String(rawId);

  return {
    date,
    handicap,
    ghinRevisionId,
    club: row.ClubName ?? row.club_name ?? undefined,
    lowHandicapIndex: row.LowHIDisplay ?? row.LowHI ?? undefined,
    isSoftCap: typeof row.Soft_Cap === 'string' ? row.Soft_Cap === 'Y' : undefined,
    isHardCap: typeof row.Hard_Cap === 'string' ? row.Hard_Cap === 'Y' : undefined,
    hiBeforeSoftCap:
      row.HIBeforeSoftCapDisplay ?? row.HIBeforeSoftCap ?? undefined,
  };
}

/**
 * Pull GHIN's pre-computed round-distribution + advanced stats. The
 * endpoint accepts `filter` to scope the window — `recent_and_revision_scores`
 * matches what GHIN.com displays on a player's profile page.
 *
 * Most golfers won't have advanced shot tracking populated; the response
 * still comes back successfully with all-zero values for those fields.
 */
export async function getGolferStatistics(
  ghinNumber: string,
  opts: { filter?: 'recent_and_revision_scores' | 'all' } = {},
): Promise<GhinGolferStatistics | null> {
  const filter = opts.filter ?? 'recent_and_revision_scores';
  try {
    const response = await ghinApiClient.get<any>(
      `/golfers/${encodeURIComponent(ghinNumber)}/statistics.json?filter=${filter}&source=GHINcom`,
    );
    if (!response || typeof response !== 'object') return null;
    return {
      totalSummaryRounds: Number(response.total_summary_rounds ?? 0) || 0,
      totalStatsRounds: Number(response.total_stats_rounds ?? 0) || 0,
      scoreSummary: {
        birdiesOrBetterPercent: numberOrNull(response.score_summary?.birdies_or_better_percent),
        parsPercent: numberOrNull(response.score_summary?.pars_percent),
        bogeysPercent: numberOrNull(response.score_summary?.bogeys_percent),
        doubleBogeysPercent: numberOrNull(response.score_summary?.double_bogeys_percent),
        tripleBogeysOrWorsePercent: numberOrNull(
          response.score_summary?.triple_bogeys_or_worse_percent,
        ),
        parsOrBetter: numberOrNull(response.score_summary?.pars_or_better),
        par3sAverage: numberOrNull(response.score_summary?.par3s_average),
        par4sAverage: numberOrNull(response.score_summary?.par4s_average),
        par5sAverage: numberOrNull(response.score_summary?.par5s_average),
      },
      advancedStats: {
        fairwayHitsPercent: numberOrNull(response.advanced_stats?.fairway_hits_percent),
        missedLeftPercent: numberOrNull(response.advanced_stats?.missed_left_percent),
        missedRightPercent: numberOrNull(response.advanced_stats?.missed_right_percent),
        girPercent: numberOrNull(response.advanced_stats?.gir_percent),
        onePuttOrBetterPercent: numberOrNull(response.advanced_stats?.one_putt_or_better_percent),
        twoPuttPercent: numberOrNull(response.advanced_stats?.two_putt_percent),
        threePuttOrWorsePercent: numberOrNull(
          response.advanced_stats?.three_putt_or_worse_percent,
        ),
        putts: numberOrNull(response.advanced_stats?.putts),
        upAndDownsTotal: numberOrNull(response.advanced_stats?.up_and_downs_total),
      },
    };
  } catch (error: any) {
    if (isNotFoundError(error)) return null;
    throw createGhinApiError(`Error fetching golfer statistics: ${error.message}`);
  }
}

/** Coerce GHIN's number-or-null fields into a clean nullable number. */
function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Get a golfer's home club
 */
export async function getGolferHomeClub(ghinNumber: string): Promise<any> {
  try {
    const response = await ghinApiClient.get<any>(`/golfers/${ghinNumber}/clubs.json`);

    if (!response.clubs || response.clubs.length === 0) {
      return null;
    }

    // Find the home club (primary club)
    const homeClub = response.clubs.find((club: any) => club.is_home === true) || response.clubs[0];

    return {
      id: homeClub.club_id,
      name: homeClub.club_name,
      association: homeClub.association_name,
      isHome: homeClub.is_home,
    };
  } catch (error: any) {
    throw createGhinApiError(`Error fetching golfer home club: ${error.message}`);
  }
}

/**
 * Search for golf courses
 */
export async function searchGolfCourses(searchTerm: string): Promise<any[]> {
  try {
    const response = await ghinApiClient.get<any>(
      `/courses/search.json?name=${encodeURIComponent(searchTerm)}`
    );

    if (!response.courses || response.courses.length === 0) {
      return [];
    }

    return response.courses.map((course: any) => ({
      id: course.course_id,
      name: course.course_name,
      city: course.city,
      state: course.state,
      country: course.country,
      teeSets: course.tee_sets.map((teeSet: any) => ({
        id: teeSet.tee_set_id,
        name: teeSet.tee_name,
        gender: teeSet.gender,
        rating: teeSet.course_rating,
        slope: teeSet.slope_rating,
        par: teeSet.par,
      })),
    }));
  } catch (error: any) {
    throw createGhinApiError(`Error searching for golf courses: ${error.message}`);
  }
}

/**
 * Get detailed course information
 */
export async function getGolfCourseDetails(courseId: string, teeSetId: string): Promise<any> {
  try {
    const response = await ghinApiClient.get<any>(`/courses/${courseId}/tee_sets/${teeSetId}.json`);

    if (!response.tee_set) {
      throw createGhinApiError(
        `No tee set found for course ID ${courseId} and tee set ID ${teeSetId}`
      );
    }

    const teeSet = response.tee_set;

    return {
      id: teeSet.tee_set_id,
      name: teeSet.tee_name,
      gender: teeSet.gender,
      rating: teeSet.course_rating,
      slope: teeSet.slope_rating,
      par: teeSet.par,
      holes: teeSet.holes.map((hole: any) => ({
        number: hole.hole_number,
        par: hole.par,
        handicap: hole.handicap,
        yards: hole.yardage,
      })),
    };
  } catch (error: any) {
    throw createGhinApiError(`Error fetching golf course details: ${error.message}`);
  }
}
