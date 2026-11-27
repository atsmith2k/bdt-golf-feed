// src/lib/cupStrokes.ts
//
// Strokes given in a Ryder Cup match, worked out from each player's handicap
// index as it stood when they were put in the match. A guide for the first
// tee, not a ruling: it uses the index itself, not a course handicap, so it
// ignores the slope and rating of the course being played.
//
// The allowances are the usual match-play ones. Change them here.

import { parseHandicapIndex } from '@/lib/utils/format';
import type { CupMatchDTO } from '@/types/cup';

/** Singles: the higher handicap gets this share of the difference. */
const SINGLES_ALLOWANCE = 1;
/** Fourball: everyone plays off the lowest player, at this share of the difference. */
const FOURBALL_ALLOWANCE = 0.9;
/** Foursomes: the higher side gets this share of the difference in combined handicaps. */
const FOURSOMES_ALLOWANCE = 0.5;
/** Scramble: share of each player's handicap, lowest first, by team size. */
const SCRAMBLE_SHARES: Record<number, number[]> = {
  2: [0.35, 0.15],
  3: [0.3, 0.2, 0.1],
  4: [0.25, 0.2, 0.15, 0.1],
};

interface Player {
  name: string;
  index: number;
}

function strokesText(n: number): string {
  return `${n} ${n === 1 ? 'stroke' : 'strokes'}`;
}

function lastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || fullName;
}

/**
 * A one-line description of the strokes given, or null when they cannot be
 * worked out: an unknown format, a missing player, or a golfer with no index.
 */
export function describeStrokes(match: CupMatchDTO): string | null {
  if (match.sides.length !== 2) return null;
  const sides: Player[][] = match.sides.map((s) =>
    s.players.map((p) => ({
      name: p.fullName,
      index: parseHandicapIndex(p.handicapIndexAtTime),
    })),
  );
  const [a, b] = sides;
  if (a.length === 0 || b.length === 0) return null;
  if ([...a, ...b].some((p) => !Number.isFinite(p.index))) return null;

  const format = match.format.trim().toLowerCase();

  if (format === 'singles' && a.length === 1 && b.length === 1) {
    const diff = Math.round(Math.abs(a[0].index - b[0].index) * SINGLES_ALLOWANCE);
    if (diff === 0) return 'Level: no strokes';
    const higher = a[0].index > b[0].index ? a[0] : b[0];
    return `${higher.name} gets ${strokesText(diff)}`;
  }

  if (format === 'fourball') {
    const everyone = [...a, ...b];
    const low = everyone.reduce((x, y) => (y.index < x.index ? y : x));
    const given = everyone
      .filter((p) => p !== low)
      .map((p) => ({ p, n: Math.round((p.index - low.index) * FOURBALL_ALLOWANCE) }))
      .filter((x) => x.n > 0);
    if (given.length === 0) return 'Level: no strokes';
    return `Off ${lastName(low.name)}: ${given.map((x) => `${lastName(x.p.name)} ${x.n}`).join(', ')}`;
  }

  // The two team formats compare one number per side.
  let teamHandicaps: [number, number] | null = null;
  if (format === 'foursomes') {
    const sum = (side: Player[]) => side.reduce((t, p) => t + p.index, 0);
    teamHandicaps = [sum(a) * FOURSOMES_ALLOWANCE, sum(b) * FOURSOMES_ALLOWANCE];
  } else if (format === 'scramble') {
    const shares = SCRAMBLE_SHARES[a.length];
    if (!shares || a.length !== b.length) return null;
    const weigh = (side: Player[]) =>
      [...side].sort((x, y) => x.index - y.index).reduce((t, p, i) => t + p.index * shares[i], 0);
    teamHandicaps = [weigh(a), weigh(b)];
  }
  if (!teamHandicaps) return null;

  const diff = Math.round(Math.abs(teamHandicaps[0] - teamHandicaps[1]));
  if (diff === 0) return 'Level: no strokes';
  const higher = teamHandicaps[0] > teamHandicaps[1] ? a : b;
  return `${higher.map((p) => lastName(p.name)).join(' / ')} get ${strokesText(diff)}`;
}
