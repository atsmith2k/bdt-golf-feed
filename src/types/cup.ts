// DTOs for the Ryder Cup pages and APIs.

export type GolferRole = 'PLAYER' | 'COMMITTEE' | 'ADMIN';

/** Who is looking at the page and what they may do. */
export interface ViewerDTO {
  signedIn: boolean;
  name: string | null;
  /** May add matches and report or correct results. */
  canReport: boolean;
  /** May set up the season, teams, emails and roles. */
  canManage: boolean;
  /** The team this golfer captains in the current season, if any. */
  captainOfTeamId: string | null;
}

export interface CupRecordDTO {
  played: number;
  won: number;
  lost: number;
  halved: number;
  points: number;
}

export interface CupMemberDTO {
  golferId: string;
  ghinNumber: string;
  fullName: string;
  handicapIndex: string;
  isCaptain: boolean;
  /** Overall draft pick number, when the golfer was drafted. */
  draftPick: number | null;
  record: CupRecordDTO;
}

export interface CupTeamDTO {
  id: string;
  /** What to call the team. A stand-in ("Team Smith / Jones") while `nameTbd`. */
  name: string;
  /** True while the team has not been given a name. */
  nameTbd: boolean;
  color: string;
  /** Up to two captains. */
  captainIds: string[];
  points: number;
  record: CupRecordDTO;
  members: CupMemberDTO[];
}

export interface CupMatchSideDTO {
  teamId: string;
  players: { golferId: string; fullName: string; handicapIndexAtTime: string | null }[];
}

export interface CupMatchDTO {
  id: string;
  format: string;
  points: number;
  status: 'SCHEDULED' | 'FINAL';
  /** Null on a FINAL match means it was halved. */
  winnerTeamId: string | null;
  margin: string | null;
  playDate: string | null;
  course: string | null;
  sessionName: string | null;
  notes: string | null;
  /** One entry per team, in scoreboard order. */
  sides: CupMatchSideDTO[];
  reportedByName: string | null;
  reportedAt: string | null;
}

export interface CupStateDTO {
  season: {
    id: string;
    name: string;
    status: 'ACTIVE' | 'COMPLETE';
    pointsToWin: number | null;
  } | null;
  /** Two teams in scoreboard order, or empty before set-up. */
  teams: CupTeamDTO[];
  matches: CupMatchDTO[];
}

/** A row of the access table in the control room. */
export interface CupAdminGolferDTO {
  id: string;
  ghinNumber: string;
  fullName: string;
  handicapIndex: string;
  email: string | null;
  pendingEmail: string | null;
  role: GolferRole;
  teamId: string | null;
  draftPick: number | null;
}

/** Preset formats offered by the match form; any other text is allowed. */
export const CUP_FORMATS = [
  { label: 'Singles', perSide: 1 },
  { label: 'Fourball', perSide: 2 },
  { label: 'Foursomes', perSide: 2 },
  { label: 'Scramble', perSide: 2 },
] as const;

/** 5.5 -> "5½", 0.5 -> "½", 3 -> "3". Other fractions keep their decimals. */
export function formatCupPoints(value: number): string {
  const whole = Math.floor(value);
  const frac = value - whole;
  if (Math.abs(frac - 0.5) < 1e-9) return whole === 0 ? '½' : `${whole}½`;
  if (Math.abs(frac) < 1e-9) return String(whole);
  return String(Math.round(value * 100) / 100);
}

/** Starting colours for the two teams; admins can change them. */
export const DEFAULT_TEAM_COLORS = ['#D41F2F', '#2F7FD4'] as const;

/** "2026-06-14" -> "Sun, Jun 14", read as a calendar date, not a UTC instant. */
export function formatCupDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Who is on each side, by full name: "Al Archer / Dan Diaz". */
export function sideNames(match: CupMatchDTO, teamId: string): string {
  const side = match.sides.find((s) => s.teamId === teamId);
  return side && side.players.length ? side.players.map((p) => p.fullName).join(' / ') : 'TBD';
}
