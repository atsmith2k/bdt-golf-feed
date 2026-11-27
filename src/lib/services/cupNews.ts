// src/lib/services/cupNews.ts
//
// Feed copy for Ryder Cup results. Pure functions, like newsGenerator.ts, so
// the wording can change without touching database logic.

import { formatCupPoints } from '@/types/cup';

export interface CupNewsSide {
  teamName: string;
  /** Team total after this result. */
  teamPoints: number;
  players: { fullName: string; lastName: string }[];
}

export interface CupNewsInput {
  format: string;
  points: number;
  margin: string | null;
  /** Index into `sides` of the winner, or null when halved. */
  winner: 0 | 1 | null;
  sides: [CupNewsSide, CupNewsSide];
  /** The team this result takes to the winning total, if any. */
  clinchedBy?: string | null;
}

/** One player by full name, partners by last name: "Smith / Jones". */
function sideLabel(side: CupNewsSide): string {
  if (side.players.length === 0) return side.teamName;
  if (side.players.length === 1) return side.players[0].fullName;
  return side.players.map((p) => p.lastName).join(' / ');
}

function scoreLine(sides: [CupNewsSide, CupNewsSide]): string {
  const [a, b] = sides;
  const score = `${a.teamName} ${formatCupPoints(a.teamPoints)} – ${formatCupPoints(b.teamPoints)} ${b.teamName}`;
  if (a.teamPoints === b.teamPoints) return `${score} (all square)`;
  return score;
}

export function buildCupResultStory(input: CupNewsInput): { headline: string; details: string } {
  const [a, b] = input.sides;
  const format = input.format.toLowerCase();
  const pts = formatCupPoints(input.points);
  const unit = input.points === 1 ? 'point' : 'points';
  const clinch = input.clinchedBy ? `${input.clinchedBy} win the cup! • ` : '';

  if (input.winner === null) {
    const each = formatCupPoints(input.points / 2);
    return {
      headline: `Ryder Cup: ${sideLabel(a)} and ${sideLabel(b)} halve their ${format} match`,
      details: `${clinch}${each} each • ${scoreLine(input.sides)}`,
    };
  }

  const won = input.sides[input.winner];
  const lost = input.sides[input.winner === 0 ? 1 : 0];
  const margin = input.margin ? `, ${input.margin}` : '';
  return {
    headline: `Ryder Cup: ${sideLabel(won)} def. ${sideLabel(lost)}${margin} in ${format}`,
    details: `${clinch}${pts} ${unit} to ${won.teamName} • ${scoreLine(input.sides)}`,
  };
}
