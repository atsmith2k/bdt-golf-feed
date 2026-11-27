// src/lib/syncSchedule.ts
//
// When the roster syncs. Times are wall-clock hours in the tour's time zone,
// so they stay put across daylight-saving changes.

export const SYNC_TIME_ZONE = 'America/New_York';

// 11 PM: picks up the rounds posted that day, so they are in the feed the
//        same evening.
//  7 AM: GHIN revises handicap indexes overnight; this picks up the new
//        index and anything posted late.
export const SYNC_HOURS = [23, 7];

const HOUR_MS = 60 * 60 * 1000;

function hourIn(timeZone: string, at: Date): number {
  const hour = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(at)
    .find((p) => p.type === 'hour');
  return Number(hour?.value);
}

/** The first top-of-the-hour after `now` whose local hour is one of `hours`. */
export function nextSyncTime(
  now: Date,
  hours: readonly number[] = SYNC_HOURS,
  timeZone: string = SYNC_TIME_ZONE,
): Date {
  // Whole hours in UTC are whole hours in this zone, so step hour by hour.
  let candidate = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS + HOUR_MS);
  for (let i = 0; i < 50; i++) {
    if (hours.includes(hourIn(timeZone, candidate))) return candidate;
    candidate = new Date(candidate.getTime() + HOUR_MS);
  }
  // Unreachable with a valid hour list; fall back to a day from now.
  return new Date(now.getTime() + 24 * HOUR_MS);
}
