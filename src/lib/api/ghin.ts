// src/lib/api/ghin.ts
import { ghinApiClient } from './client';
import {
  GhinGolferDetails,
  GhinHoleDetail,
  GhinRoundStatistics,
  GhinScore,
} from '@/types/golf';
import { createGhinApiError } from '@/lib/utils/error';
import { parseHandicapIndex } from '@/lib/utils/format';

/**
 * Search for a golfer by GHIN number.
 *
 * Uses the public `/golfers.json` listing endpoint (the same one GHIN.com
 * itself hits to render any golfer's profile card). The legacy
 * `/golfers/search.json` endpoint is only authorized against the calling
 * GHIN account, so it works for "me" but 401/403s for every other
 * roster member.
 *
 * `from_ghin=true` and `golfer_id=<ghin>` filter the listing to a single
 * row; `includeLowHandicapIndex=true` opts into the low-HI fields.
 */
export async function searchGolferByGhin(ghinNumber: string): Promise<GhinGolferDetails> {
  try {
    const url =
      `/golfers.json?status=Active&from_ghin=true&per_page=25&page=1` +
      `&golfer_id=${encodeURIComponent(ghinNumber)}` +
      `&includeLowHandicapIndex=true&source=GHINcom`;
    const response = await ghinApiClient.get<any>(url);

    if (!response.golfers || response.golfers.length === 0) {
      throw createGhinApiError(`No golfer found with GHIN number ${ghinNumber}`);
    }

    // Listing returns paginated results; pick the row that matches the
    // GHIN we asked for. Different account flavors expose the field as
    // either `ghin` or `ghin_number` / `golfer_id`.
    const target = String(ghinNumber).trim();
    const golfer =
      response.golfers.find((g: any) => {
        const id = String(g.ghin ?? g.ghin_number ?? g.golfer_id ?? '').trim();
        return id === target;
      }) ?? response.golfers[0];

    const resolvedGhin = String(
      golfer.ghin ?? golfer.ghin_number ?? golfer.golfer_id ?? ghinNumber ?? '',
    ).trim();
    if (!resolvedGhin) {
      throw createGhinApiError(
        `GHIN response did not include an identifier for golfer ${ghinNumber}.`,
        golfer,
      );
    }

    // Listing endpoint surfaces handicap index as either `hi_display` /
    // `hi_value` or the legacy `handicap_index`. Fall back across all of
    // them so we work whether GHIN feature-flags one shape or the other.
    const handicapIndexRaw = String(
      golfer.hi_display ?? golfer.handicap_index ?? '',
    ).trim();
    const handicapIndexValue = (() => {
      const fromValue =
        golfer.hi_value != null && golfer.hi_value !== ''
          ? Number(golfer.hi_value)
          : NaN;
      if (Number.isFinite(fromValue)) {
        // hi_value is a positive number for plus handicaps too; rely on
        // the `+` prefix in hi_display to flip the sign correctly via
        // parseHandicapIndex.
        const fromDisplay = parseHandicapIndex(handicapIndexRaw);
        return Number.isFinite(fromDisplay) ? fromDisplay : fromValue;
      }
      return parseHandicapIndex(handicapIndexRaw);
    })();

    const lowHandicapIndexRaw =
      (typeof golfer.low_hi_display === 'string' && golfer.low_hi_display) ||
      (typeof golfer.low_hi === 'string' && golfer.low_hi) ||
      (golfer.low_handicap_index != null
        ? String(golfer.low_handicap_index)
        : null);
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
      association: golfer.association_name ?? golfer.association ?? undefined,
      club: golfer.club_name ?? undefined,
      state: golfer.state ?? undefined,
      country: golfer.country ?? undefined,
      lowHandicapIndex: lowHandicapIndexRaw ?? undefined,
      lowHandicapIndexValue:
        lowHandicapIndexValue != null && Number.isFinite(lowHandicapIndexValue)
          ? lowHandicapIndexValue
          : undefined,
      lowHandicapDate: golfer.low_hi_date,
      revisionDate: golfer.rev_date ?? golfer.revision_date,
      status: golfer.status,
      isSoftCap: parseBoolish(golfer.soft_cap ?? golfer.is_soft_cap),
      isHardCap: parseBoolish(golfer.hard_cap ?? golfer.is_hard_cap),
    };
  } catch (error: any) {
    if (error.code === 'GHIN_API_ERROR') {
      throw error;
    }

    throw createGhinApiError(`Error searching for golfer: ${error.message}`);
  }
}

/**
 * GHIN occasionally serializes booleans as the strings "true"/"false"
 * (notably soft_cap/hard_cap on the listing endpoint). Normalize.
 */
function parseBoolish(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return undefined;
}

/**
 * Get a golfer's scores.
 *
 * Uses the per-golfer envelope at `/golfers/{id}/scores.json`, which is
 * the only flavor of the scores API still available for non-self GHINs.
 * The flat `/scores.json?golfer_id=…` returns 401/AccessDenied for any
 * golfer other than the calling account.
 *
 * The envelope splits scores into `recent_scores`, `revision_scores`,
 * `9_hole_score`, and `deleted_scores`; we union the first three (skipping
 * deleted), dedupe by score id, and sort newest-first by `played_at`.
 *
 * Note: `played_at` on this endpoint is `YYYY-MM` (no day component).
 * That's fine for sorting and display; downstream code that wants a day
 * needs to fall back to `posted_at` or treat the date as month-only.
 */
export async function getGolferScores(ghinNumber: string): Promise<GhinScore[]> {
  try {
    const response = await ghinApiClient.get<any>(
      `/golfers/${encodeURIComponent(ghinNumber)}/scores.json?source=GHINcom`,
    );

    const buckets: any[] = [];
    const recent = response?.recent_scores?.scores;
    const revision = response?.revision_scores?.scores;
    const nineHole = response?.['9_hole_score']?.scores;
    if (Array.isArray(recent)) buckets.push(...recent);
    if (Array.isArray(revision)) buckets.push(...revision);
    if (Array.isArray(nineHole)) buckets.push(...nineHole);

    if (buckets.length === 0) return [];

    const seen = new Set<string>();
    const out: GhinScore[] = [];
    for (const raw of buckets) {
      const mapped = toGhinScore(raw);
      if (!mapped.id || seen.has(mapped.id)) continue;
      seen.add(mapped.id);
      out.push(mapped);
    }

    // Newest-first by played_at (string compare on YYYY-MM works here;
    // ties broken by score id descending so duplicates collapse cleanly).
    out.sort((a, b) => {
      if (a.date === b.date) return a.id < b.id ? 1 : -1;
      return a.date < b.date ? 1 : -1;
    });
    return out;
  } catch (error: any) {
    throw createGhinApiError(`Error fetching golfer scores: ${error.message}`);
  }
}

/**
 * Map a single raw GHIN score row to our internal shape. GHIN returns
 * most numeric fields as numbers but a few statistics fields as strings;
 * we coerce defensively in either case.
 *
 * Course name is intentionally derived as a best-effort fallback —
 * `/golfers/{id}/scores.json` often omits a textual course field, so we
 * synthesize a placeholder when the upstream is silent. The score row's
 * stable `id` is the dedup key, and we never overwrite existing rows in
 * the DB, so historical course names captured via the older endpoint
 * are preserved across this transition.
 */
function toGhinScore(raw: any): GhinScore {
  const adjustedGross = Number(raw.adjusted_gross_score ?? 0);
  const net = Number(raw.net_score ?? adjustedGross);
  const score = Number(raw.score ?? adjustedGross);
  const numberOfHoles = Number(raw.number_of_holes ?? 0) || undefined;
  const toParDisplay =
    typeof raw.to_par_display_value === 'string' &&
    raw.to_par_display_value.length > 0 &&
    raw.to_par_display_value !== '-'
      ? raw.to_par_display_value
      : undefined;

  const date = String(raw.played_at ?? raw.date_played ?? raw.posted_at ?? '');
  const courseName = pickCourseName(raw);

  const holeDetails = Array.isArray(raw.hole_details)
    ? (raw.hole_details
        .map(toHoleDetail)
        .filter(Boolean) as GhinHoleDetail[])
    : undefined;
  const roundStatistics =
    raw.statistics && typeof raw.statistics === 'object'
      ? toRoundStatistics(raw.statistics)
      : undefined;

  return {
    id: String(raw.id ?? raw.score_id ?? ''),
    date,
    courseName,
    score,
    adjustedGrossScore: adjustedGross,
    netScore: net,
    courseRating:
      raw.course_rating != null && raw.course_rating !== ''
        ? String(raw.course_rating)
        : undefined,
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
    holeDetails: holeDetails && holeDetails.length > 0 ? holeDetails : undefined,
    roundStatistics,
  };
}

/**
 * Best-effort course-name resolver. The per-golfer `/scores.json` envelope
 * usually omits a textual course field — we accept any of the variants we
 * have ever seen, then fall back to a placeholder so the row still sorts
 * and renders. Note: when this row already exists in the DB we skip the
 * insert (id is a stable PK), so historical course names captured via the
 * legacy endpoint are preserved automatically.
 */
function pickCourseName(raw: any): string {
  const candidates = [
    raw.course_display_value,
    raw.course_name,
    raw.facility_name,
    raw.club_name,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c;
  }
  return 'Unknown Course';
}

function toHoleDetail(raw: any): GhinHoleDetail | null {
  const holeNumber = Number(raw?.hole_number ?? raw?.holeNumber ?? NaN);
  const par = Number(raw?.par ?? NaN);
  const adjustedGrossScore = Number(raw?.adjusted_gross_score ?? raw?.score ?? NaN);
  if (!Number.isFinite(holeNumber) || !Number.isFinite(par) || !Number.isFinite(adjustedGrossScore)) {
    return null;
  }
  return {
    holeNumber,
    par,
    adjustedGrossScore,
    rawScore: Number(raw?.raw_score ?? adjustedGrossScore),
    putts: numberOrNullStrict(raw?.putts),
    fairwayHit: typeof raw?.fairway_hit === 'boolean' ? raw.fairway_hit : null,
    girFlag: typeof raw?.gir_flag === 'boolean' ? raw.gir_flag : null,
    driveAccuracy:
      typeof raw?.drive_accuracy === 'string' ? raw.drive_accuracy : null,
    approachShotAccuracy:
      typeof raw?.approach_shot_accuracy === 'string'
        ? raw.approach_shot_accuracy
        : null,
    strokeAllocation: numberOrNullStrict(raw?.stroke_allocation),
    xHole: Boolean(raw?.x_hole),
    mostLikelyScore: numberOrNullStrict(raw?.most_likely_score),
  };
}

function toRoundStatistics(raw: any): GhinRoundStatistics {
  return {
    puttsTotal: Number(raw.putts_total ?? 0) || 0,
    onePuttOrBetterPercent: Number(raw.one_putt_or_better_percent ?? 0) || 0,
    twoPuttPercent: Number(raw.two_putt_percent ?? 0) || 0,
    threePuttOrWorsePercent: Number(raw.three_putt_or_worse_percent ?? 0) || 0,
    twoPuttOrBetterPercent: Number(raw.two_putt_or_better_percent ?? 0) || 0,
    upAndDownsTotal: Number(raw.up_and_downs_total ?? 0) || 0,
    par3sAverage: Number(raw.par3s_average ?? 0) || 0,
    par4sAverage: Number(raw.par4s_average ?? 0) || 0,
    par5sAverage: Number(raw.par5s_average ?? 0) || 0,
    parsPercent: Number(raw.pars_percent ?? 0) || 0,
    birdiesOrBetterPercent: Number(raw.birdies_or_better_percent ?? 0) || 0,
    bogeysPercent: Number(raw.bogeys_percent ?? 0) || 0,
    doubleBogeysPercent: Number(raw.double_bogeys_percent ?? 0) || 0,
    tripleBogeysOrWorsePercent: Number(raw.triple_bogeys_or_worse_percent ?? 0) || 0,
    fairwayHitsPercent: Number(raw.fairway_hits_percent ?? 0) || 0,
    missedLeftPercent: Number(raw.missed_left_percent ?? 0) || 0,
    missedRightPercent: Number(raw.missed_right_percent ?? 0) || 0,
    missedLongPercent: Number(raw.missed_long_percent ?? 0) || 0,
    missedShortPercent: Number(raw.missed_short_percent ?? 0) || 0,
    girPercent: Number(raw.gir_percent ?? 0) || 0,
  };
}

function numberOrNullStrict(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
