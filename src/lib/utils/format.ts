/**
 * Formatting helpers for human-readable feed copy.
 */

/**
 * Parse a USGA handicap index string into a numeric value where lower is
 * better. GHIN expresses "plus" handicaps with a literal "+" prefix —
 * "+3.6" means the golfer plays 3.6 strokes BETTER than scratch and should
 * sort below 0.0. parseFloat alone strips the sign and yields the wrong
 * ordering, so this helper negates plus values.
 *
 *   parseHandicapIndex("+3.6") // -> -3.6
 *   parseHandicapIndex("0.4")  // ->  0.4
 *   parseHandicapIndex("NH")   // ->  NaN
 */
export function parseHandicapIndex(raw: string | null | undefined): number {
  if (raw == null) return NaN;
  const trimmed = String(raw).trim();
  if (!trimmed) return NaN;
  if (trimmed.startsWith('+')) {
    const v = parseFloat(trimmed.slice(1));
    return Number.isFinite(v) ? -v : NaN;
  }
  return parseFloat(trimmed);
}

/**
 * Format a numeric handicap value back into the conventional USGA string.
 * Negative values render with a "+" prefix (plus handicaps). Use this for
 * any feed copy or computed display where the numeric value is the source
 * of truth — for raw passthrough from GHIN, just emit the original string.
 *
 *   formatHandicapIndex(-3.6) // -> "+3.6"
 *   formatHandicapIndex(0.4)  // -> "0.4"
 */
export function formatHandicapIndex(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  if (rounded < 0) return `+${Math.abs(rounded).toFixed(1)}`;
  return rounded.toFixed(1);
}

export function formatHandicap(value: number): string {
  // Kept for backwards compat; defers to the index-aware formatter so that
  // plus handicaps render correctly.
  return formatHandicapIndex(value);
}

export function formatDelta(delta: number): string {
  if (delta === 0) return '±0.0';
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${Math.abs(delta).toFixed(1)}`;
}

/**
 * Compute score relative to course rating, expressed as a signed string.
 * e.g. 78 vs 72.0 -> "+6"
 */
export function relativeToRating(score: number, courseRating?: string | null): string | null {
  if (!courseRating) return null;
  const rating = parseFloat(courseRating);
  if (Number.isNaN(rating)) return null;
  const diff = score - rating;
  const rounded = Math.round(diff);
  if (rounded === 0) return 'E';
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

export function shortDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.max(1, Math.floor((now - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}
