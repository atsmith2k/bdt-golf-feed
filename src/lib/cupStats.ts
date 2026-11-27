// src/lib/cupStats.ts
//
// Per-player Ryder Cup breakdowns, worked out from the public cup state the
// page already has: record by format, with each partner and against each
// opponent. Pure functions.

import type { CupStateDTO } from '@/types/cup';

export interface SplitRow {
  /** A format name, or a golfer's full name. */
  label: string;
  won: number;
  lost: number;
  halved: number;
}

export interface PlayerBreakdown {
  byFormat: SplitRow[];
  partners: SplitRow[];
  opponents: SplitRow[];
}

function bump(rows: Map<string, SplitRow>, label: string, outcome: 'W' | 'L' | 'H') {
  const row = rows.get(label) ?? { label, won: 0, lost: 0, halved: 0 };
  if (outcome === 'W') row.won += 1;
  else if (outcome === 'L') row.lost += 1;
  else row.halved += 1;
  rows.set(label, row);
}

/** Most matches first, then alphabetical. */
function sorted(rows: Map<string, SplitRow>): SplitRow[] {
  const total = (r: SplitRow) => r.won + r.lost + r.halved;
  return [...rows.values()].sort((x, y) => total(y) - total(x) || x.label.localeCompare(y.label));
}

export function playerBreakdown(state: CupStateDTO, golferId: string): PlayerBreakdown {
  const byFormat = new Map<string, SplitRow>();
  const partners = new Map<string, SplitRow>();
  const opponents = new Map<string, SplitRow>();

  for (const match of state.matches) {
    if (match.status !== 'FINAL') continue;
    const mine = match.sides.find((s) => s.players.some((p) => p.golferId === golferId));
    if (!mine) continue;
    const outcome = match.winnerTeamId === null ? 'H' : match.winnerTeamId === mine.teamId ? 'W' : 'L';

    bump(byFormat, match.format, outcome);
    for (const p of mine.players) {
      if (p.golferId !== golferId) bump(partners, p.fullName, outcome);
    }
    for (const side of match.sides) {
      if (side === mine) continue;
      for (const p of side.players) bump(opponents, p.fullName, outcome);
    }
  }

  return { byFormat: sorted(byFormat), partners: sorted(partners), opponents: sorted(opponents) };
}
