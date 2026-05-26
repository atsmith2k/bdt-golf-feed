import type { GhinScore, GhinHandicapRevision, GhinGolferDetails } from '@/types/golf';
import {
  formatDelta,
  formatHandicap,
  parseHandicapIndex,
  relativeToRating,
  shortDate,
} from '@/lib/utils/format';

export interface DraftFeedEvent {
  type: 'SCORE_POSTED' | 'HANDICAP_CHANGED' | 'LOW_ROUND_ALERT' | 'MILESTONE';
  headline: string;
  details?: string;
  importance: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  payload?: Record<string, unknown>;
}

/**
 * Build a SCORE_POSTED feed event from a freshly seen score.
 *
 * Prefers the GHIN-provided `to_par_display_value` when present (e.g. "+6"),
 * falling back to a relative-to-rating computation. Distinguishes 9-hole
 * rounds in the headline.
 */
export function buildScorePostedEvent(
  golfer: { fullName: string },
  score: GhinScore,
): DraftFeedEvent {
  const toPar =
    score.toParDisplay ?? relativeToRating(score.adjustedGrossScore, score.courseRating);
  const tail = toPar ? ` (${toPar})` : '';
  const roundLabel = score.numberOfHoles === 9 ? '9-hole ' : '';
  const headline = `${golfer.fullName} shot a ${roundLabel}${score.adjustedGrossScore}${tail} at ${score.courseName}`;

  // GHIN uses 999 as a "no net score" sentinel for some round types
  // (away rounds, certain non-handicap formats). Filter it from the
  // details so the broadcast doesn't read "Net 999".
  const isValidNet =
    Number.isFinite(score.netScore) && score.netScore > 0 && score.netScore < 200;

  const details = [
    `Played ${shortDate(score.date)}`,
    score.courseRating ? `Course Rating ${score.courseRating}` : null,
    score.courseSlope ? `Slope ${score.courseSlope}` : null,
    isValidNet ? `Net ${score.netScore}` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return {
    type: 'SCORE_POSTED',
    headline,
    details,
    importance: 'MEDIUM',
    payload: { scoreId: score.id, courseName: score.courseName },
  };
}

/**
 * Compare a freshly observed handicap value against the previous one.
 * Returns null if no meaningful change.
 *
 * We deliberately ignore `revisionDate`-only deltas: GHIN's `revision_date`
 * field can update day-to-day even when the index value is unchanged, and
 * "Player X's handicap revised to 17.1 (±0.0)" is broadcast noise, not news.
 * Only fire when the index value itself actually moved.
 */
export function buildHandicapChangedEvent(
  golfer: { fullName: string },
  previous: { handicapIndexValue: number; revisionDate?: string | null },
  next: Pick<GhinGolferDetails, 'handicapIndexValue' | 'handicapIndex' | 'revisionDate'>,
): DraftFeedEvent | null {
  const prevRounded = Math.round(previous.handicapIndexValue * 10) / 10;
  const nextRounded = Math.round(next.handicapIndexValue * 10) / 10;
  if (prevRounded === nextRounded) {
    return null;
  }

  const delta = nextRounded - prevRounded;
  const direction = delta < 0 ? 'dropped' : 'climbed';
  const importance: DraftFeedEvent['importance'] =
    Math.abs(delta) >= 1 ? 'HIGH' : Math.abs(delta) >= 0.3 ? 'MEDIUM' : 'LOW';

  const headline = `${golfer.fullName}'s handicap index ${direction} to ${formatHandicap(nextRounded)} (${formatDelta(delta)})`;
  const details = [
    `Previous ${formatHandicap(prevRounded)}`,
    next.revisionDate ? `Revision ${shortDate(next.revisionDate)}` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return {
    type: 'HANDICAP_CHANGED',
    headline,
    details,
    importance,
    payload: { previous: prevRounded, next: nextRounded, delta },
  };
}

/**
 * Flag a "low round" if this is the lowest adjusted gross we've ever seen
 * for this golfer (across the local Score history).
 */
export function buildLowRoundEvent(
  golfer: { fullName: string },
  score: GhinScore,
  previousLowest: number | null,
): DraftFeedEvent | null {
  if (previousLowest != null && score.adjustedGrossScore >= previousLowest) {
    return null;
  }
  const headline = `LOW ROUND ALERT: ${golfer.fullName} fires a ${score.adjustedGrossScore} at ${score.courseName}`;
  const details = previousLowest
    ? `Beats previous best of ${previousLowest}`
    : 'First tracked round on record';
  return {
    type: 'LOW_ROUND_ALERT',
    headline,
    details,
    importance: 'CRITICAL',
    payload: { scoreId: score.id, previousLowest },
  };
}

/**
 * Detect a handicap revision we've never seen locally and convert it to
 * a HANDICAP_CHANGED event. Used when GHIN exposes the revision history
 * but we haven't yet captured a snapshot.
 */
export function buildRevisionFromHistoryEvent(
  golfer: { fullName: string },
  revision: GhinHandicapRevision,
  previousRevisionValue: number | null,
): DraftFeedEvent | null {
  const nextValue = parseHandicapIndex(revision.handicap);
  if (Number.isNaN(nextValue)) return null;
  if (previousRevisionValue == null) {
    return null; // first observation; nothing to compare
  }
  const prevRounded = Math.round(previousRevisionValue * 10) / 10;
  const nextRounded = Math.round(nextValue * 10) / 10;
  if (prevRounded === nextRounded) return null;

  const delta = nextRounded - prevRounded;
  const direction = delta < 0 ? 'dropped' : 'climbed';
  return {
    type: 'HANDICAP_CHANGED',
    headline: `${golfer.fullName}'s handicap ${direction} to ${formatHandicap(nextRounded)} (${formatDelta(delta)})`,
    details: `Revision dated ${shortDate(revision.date)}`,
    importance: Math.abs(delta) >= 1 ? 'HIGH' : 'MEDIUM',
    payload: { previous: prevRounded, next: nextRounded, delta, revisionDate: revision.date },
  };
}
