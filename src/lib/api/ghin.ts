// src/lib/api/ghin.ts
import { ghinApiClient } from './client';
import { GhinGolferDetails, GhinScore } from '@/types/golf';
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
 * GHIN's `/golfers/{id}/handicap_revisions.json` endpoint is not exposed for
 * many account types — it commonly returns 404. We treat 404 as "no
 * revision history available" and fall back to deriving handicap-movement
 * events from the score history (each score includes a handicap_index
 * snapshot). Other failures still throw so the caller can log them.
 */
export async function getGolferHandicapRevisions(ghinNumber: string): Promise<any[]> {
  try {
    const response = await ghinApiClient.get<any>(`/golfers/${ghinNumber}/handicap_revisions.json`);

    if (!response.handicap_revisions || response.handicap_revisions.length === 0) {
      return [];
    }

    return response.handicap_revisions.map((revision: any) => ({
      date: revision.revision_date,
      handicap: revision.handicap_index,
      club: revision.club_name,
    }));
  } catch (error: any) {
    // 404 = endpoint not available for this golfer; surface as empty.
    if (
      error?.code === 'EXTERNAL_SERVICE_ERROR' &&
      typeof error?.message === 'string' &&
      error.message.includes('Not Found')
    ) {
      return [];
    }
    throw createGhinApiError(`Error fetching golfer handicap revisions: ${error.message}`);
  }
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
