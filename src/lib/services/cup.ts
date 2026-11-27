// src/lib/services/cup.ts
//
// The Ryder Cup: one season, two teams, matches worth points. Reads build the
// whole public state in one go (it is small: a roster and a season of
// matches); writes are called from the /api/cup routes after their
// permission check.

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  db,
  cupMatchPlayers,
  cupMatches,
  cupSeasons,
  cupTeamMembers,
  cupTeams,
  feedEvents,
  golfers,
  type CupMatch,
  type CupSeason,
  type CupTeam,
} from '@/lib/db';
import { createNotFoundError, createValidationError } from '@/lib/utils/error';
import { buildCupResultStory, type CupNewsSide } from '@/lib/services/cupNews';
import { endAllSessions, normalizeEmail } from '@/lib/services/session';
import type {
  CupAdminGolferDTO,
  CupMatchDTO,
  CupRecordDTO,
  CupStateDTO,
  CupTeamDTO,
  GolferRole,
} from '@/types/cup';

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The newest active season, or failing that the newest season. */
export async function getCurrentSeason(): Promise<CupSeason | null> {
  const rows = await db.select().from(cupSeasons).orderBy(desc(cupSeasons.createdAt));
  return rows.find((s) => s.status === 'ACTIVE') ?? rows[0] ?? null;
}

async function getTeams(seasonId: string): Promise<CupTeam[]> {
  return db
    .select()
    .from(cupTeams)
    .where(eq(cupTeams.seasonId, seasonId))
    .orderBy(asc(cupTeams.sortOrder), asc(cupTeams.id));
}

function emptyRecord(): CupRecordDTO {
  return { played: 0, won: 0, lost: 0, halved: 0, points: 0 };
}

function addResult(record: CupRecordDTO, outcome: 'W' | 'L' | 'H', matchPoints: number) {
  record.played += 1;
  if (outcome === 'W') {
    record.won += 1;
    record.points += matchPoints;
  } else if (outcome === 'L') {
    record.lost += 1;
  } else {
    record.halved += 1;
    record.points += matchPoints / 2;
  }
}

/** Scheduled matches first (soonest first), then results (newest first). */
function compareMatches(a: CupMatchDTO, b: CupMatchDTO): number {
  if (a.status !== b.status) return a.status === 'SCHEDULED' ? -1 : 1;
  if (a.status === 'SCHEDULED') {
    // Undated matches go after dated ones.
    return (a.playDate ?? '9999').localeCompare(b.playDate ?? '9999');
  }
  const byDate = (b.playDate ?? '').localeCompare(a.playDate ?? '');
  if (byDate !== 0) return byDate;
  return (b.reportedAt ?? '').localeCompare(a.reportedAt ?? '');
}

export async function getCupState(): Promise<CupStateDTO> {
  const season = await getCurrentSeason();
  if (!season) return { season: null, teams: [], matches: [] };

  const [teams, memberRows, matchRows] = await Promise.all([
    getTeams(season.id),
    db
      .select({
        teamId: cupTeamMembers.teamId,
        draftPick: cupTeamMembers.draftPick,
        golferId: golfers.id,
        ghinNumber: golfers.ghinNumber,
        fullName: golfers.fullName,
        handicapIndex: golfers.handicapIndex,
        handicapIndexValue: golfers.handicapIndexValue,
      })
      .from(cupTeamMembers)
      .innerJoin(golfers, eq(golfers.id, cupTeamMembers.golferId))
      .where(eq(cupTeamMembers.seasonId, season.id))
      .orderBy(asc(golfers.handicapIndexValue)),
    db.select().from(cupMatches).where(eq(cupMatches.seasonId, season.id)),
  ]);

  const matchIds = matchRows.map((m) => m.id);
  const reporterIds = [...new Set(matchRows.map((m) => m.reportedById).filter((v): v is string => !!v))];
  const [playerRows, reporterRows] = await Promise.all([
    matchIds.length
      ? db
          .select({
            matchId: cupMatchPlayers.matchId,
            teamId: cupMatchPlayers.teamId,
            golferId: cupMatchPlayers.golferId,
            handicapIndexAtTime: cupMatchPlayers.handicapIndexAtTime,
            fullName: golfers.fullName,
          })
          .from(cupMatchPlayers)
          .innerJoin(golfers, eq(golfers.id, cupMatchPlayers.golferId))
          .where(inArray(cupMatchPlayers.matchId, matchIds))
          .orderBy(asc(golfers.fullName))
      : [],
    reporterIds.length
      ? db
          .select({ id: golfers.id, fullName: golfers.fullName })
          .from(golfers)
          .where(inArray(golfers.id, reporterIds))
      : [],
  ]);
  const reporterName = new Map(reporterRows.map((r) => [r.id, r.fullName]));

  const teamRecords = new Map(teams.map((t) => [t.id, emptyRecord()]));
  const playerRecords = new Map<string, CupRecordDTO>();

  const matches: CupMatchDTO[] = matchRows.map((m) => {
    const players = playerRows.filter((p) => p.matchId === m.id);
    const isFinal = m.status === 'FINAL';

    if (isFinal) {
      for (const team of teams) {
        const outcome = m.winnerTeamId === null ? 'H' : m.winnerTeamId === team.id ? 'W' : 'L';
        addResult(teamRecords.get(team.id)!, outcome, m.points);
        for (const p of players.filter((x) => x.teamId === team.id)) {
          if (!playerRecords.has(p.golferId)) playerRecords.set(p.golferId, emptyRecord());
          addResult(playerRecords.get(p.golferId)!, outcome, m.points);
        }
      }
    }

    return {
      id: m.id,
      format: m.format,
      points: m.points,
      status: isFinal ? 'FINAL' : 'SCHEDULED',
      winnerTeamId: m.winnerTeamId,
      margin: m.margin,
      playDate: m.playDate,
      course: m.course,
      sessionName: m.sessionName,
      notes: m.notes,
      sides: teams.map((team) => ({
        teamId: team.id,
        players: players
          .filter((p) => p.teamId === team.id)
          .map((p) => ({
            golferId: p.golferId,
            fullName: p.fullName,
            handicapIndexAtTime: p.handicapIndexAtTime,
          })),
      })),
      reportedByName: m.reportedById ? (reporterName.get(m.reportedById) ?? null) : null,
      reportedAt: m.reportedAt ? m.reportedAt.toISOString() : null,
    };
  });
  matches.sort(compareMatches);

  const teamDtos: CupTeamDTO[] = teams.map((team) => {
    const record = teamRecords.get(team.id)!;
    return {
      id: team.id,
      name: team.name,
      color: team.color,
      captainId: team.captainId,
      points: record.points,
      record,
      members: memberRows
        .filter((r) => r.teamId === team.id)
        .map((r) => ({
          golferId: r.golferId,
          ghinNumber: r.ghinNumber,
          fullName: r.fullName,
          handicapIndex: r.handicapIndex,
          isCaptain: r.golferId === team.captainId,
          draftPick: r.draftPick,
          record: playerRecords.get(r.golferId) ?? emptyRecord(),
        })),
    };
  });

  return {
    season: {
      id: season.id,
      name: season.name,
      status: season.status === 'COMPLETE' ? 'COMPLETE' : 'ACTIVE',
      pointsToWin: season.pointsToWin,
    },
    teams: teamDtos,
    matches,
  };
}

/** Every golfer with their sign-in details and team, for the control room. */
export async function getCupAdminGolfers(): Promise<CupAdminGolferDTO[]> {
  const season = await getCurrentSeason();
  const [rows, members] = await Promise.all([
    db
      .select({
        id: golfers.id,
        ghinNumber: golfers.ghinNumber,
        fullName: golfers.fullName,
        handicapIndex: golfers.handicapIndex,
        email: golfers.email,
        pendingEmail: golfers.pendingEmail,
        role: golfers.role,
      })
      .from(golfers)
      .orderBy(asc(golfers.fullName)),
    season
      ? db
          .select({
            golferId: cupTeamMembers.golferId,
            teamId: cupTeamMembers.teamId,
            draftPick: cupTeamMembers.draftPick,
          })
          .from(cupTeamMembers)
          .where(eq(cupTeamMembers.seasonId, season.id))
      : [],
  ]);
  const memberOf = new Map(members.map((m) => [m.golferId, m]));
  return rows.map((g) => ({
    ...g,
    role: (g.role === 'ADMIN' || g.role === 'COMMITTEE' ? g.role : 'PLAYER') as GolferRole,
    teamId: memberOf.get(g.id)?.teamId ?? null,
    draftPick: memberOf.get(g.id)?.draftPick ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Season and team set-up (admins)
// ---------------------------------------------------------------------------

const teamSetupSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colour must look like #D41F2F'),
  captainId: z.string().min(1).nullable().optional(),
});

export const seasonSetupSchema = z.object({
  name: z.string().trim().min(1).max(60),
  pointsToWin: z.number().positive().max(1000).nullable().optional(),
  status: z.enum(['ACTIVE', 'COMPLETE']).optional(),
  teams: z.tuple([teamSetupSchema, teamSetupSchema]),
  /** Start a fresh season instead of editing the current one. */
  startNew: z.boolean().optional(),
});
export type SeasonSetupInput = z.infer<typeof seasonSetupSchema>;

export async function saveSeasonSetup(input: SeasonSetupInput): Promise<void> {
  const [a, b] = input.teams;
  if (a.captainId && a.captainId === b.captainId) {
    throw createValidationError('One golfer cannot captain both teams.');
  }
  if (a.name.toLowerCase() === b.name.toLowerCase()) {
    throw createValidationError('The two teams need different names.');
  }

  const current = input.startNew ? null : await getCurrentSeason();

  await db.transaction(async (tx) => {
    let seasonId: string;
    if (current) {
      seasonId = current.id;
      await tx
        .update(cupSeasons)
        .set({
          name: input.name,
          pointsToWin: input.pointsToWin ?? null,
          status: input.status ?? current.status,
        })
        .where(eq(cupSeasons.id, seasonId));
    } else {
      // Only one season is live at a time.
      await tx.update(cupSeasons).set({ status: 'COMPLETE' }).where(eq(cupSeasons.status, 'ACTIVE'));
      const [created] = await tx
        .insert(cupSeasons)
        .values({ name: input.name, pointsToWin: input.pointsToWin ?? null })
        .returning({ id: cupSeasons.id });
      seasonId = created.id;
    }

    const existing = await tx
      .select()
      .from(cupTeams)
      .where(eq(cupTeams.seasonId, seasonId))
      .orderBy(asc(cupTeams.sortOrder), asc(cupTeams.id));

    for (const [i, team] of input.teams.entries()) {
      const values = {
        name: team.name,
        color: team.color.toUpperCase(),
        captainId: team.captainId ?? null,
        sortOrder: i,
      };
      let teamId: string;
      if (existing[i]) {
        teamId = existing[i].id;
        await tx.update(cupTeams).set(values).where(eq(cupTeams.id, teamId));
      } else {
        const [created] = await tx
          .insert(cupTeams)
          .values({ seasonId, ...values })
          .returning({ id: cupTeams.id });
        teamId = created.id;
      }
      // A captain plays for the team they captain.
      if (team.captainId) {
        await tx
          .insert(cupTeamMembers)
          .values({ seasonId, golferId: team.captainId, teamId })
          .onConflictDoUpdate({
            target: [cupTeamMembers.seasonId, cupTeamMembers.golferId],
            set: { teamId },
          });
      }
    }
  });
}

/**
 * Put a golfer on a team for the current season, or take them off (null).
 * `draftPick` records the overall pick number when this is a draft pick.
 */
export async function setTeamMember(
  golferId: string,
  teamId: string | null,
  draftPick: number | null = null,
): Promise<void> {
  const season = await getCurrentSeason();
  if (!season) throw createValidationError('Set up the season first.');

  if (teamId === null) {
    const captained = await db
      .select({ id: cupTeams.id })
      .from(cupTeams)
      .where(and(eq(cupTeams.seasonId, season.id), eq(cupTeams.captainId, golferId)))
      .limit(1);
    if (captained.length) {
      throw createValidationError('That golfer is a captain. Change the captain first.');
    }
    const played = await db
      .select({ matchId: cupMatchPlayers.matchId })
      .from(cupMatchPlayers)
      .innerJoin(cupMatches, eq(cupMatches.id, cupMatchPlayers.matchId))
      .where(and(eq(cupMatches.seasonId, season.id), eq(cupMatchPlayers.golferId, golferId)))
      .limit(1);
    if (played.length) {
      throw createValidationError('That golfer is in a match. Remove them from it first.');
    }
    await db
      .delete(cupTeamMembers)
      .where(and(eq(cupTeamMembers.seasonId, season.id), eq(cupTeamMembers.golferId, golferId)));
    return;
  }

  const teams = await getTeams(season.id);
  if (!teams.some((t) => t.id === teamId)) throw createValidationError('Unknown team.');

  const [current] = await db
    .select({ teamId: cupTeamMembers.teamId })
    .from(cupTeamMembers)
    .where(and(eq(cupTeamMembers.seasonId, season.id), eq(cupTeamMembers.golferId, golferId)))
    .limit(1);
  if (current?.teamId === teamId && draftPick === null) return;

  if (current && current.teamId !== teamId) {
    // Switching sides would silently rewrite history.
    if (teams.some((t) => t.captainId === golferId)) {
      throw createValidationError('That golfer is a captain. Change the captain first.');
    }
    const played = await db
      .select({ matchId: cupMatchPlayers.matchId })
      .from(cupMatchPlayers)
      .innerJoin(cupMatches, eq(cupMatches.id, cupMatchPlayers.matchId))
      .where(and(eq(cupMatches.seasonId, season.id), eq(cupMatchPlayers.golferId, golferId)))
      .limit(1);
    if (played.length) {
      throw createValidationError('That golfer is in a match. Remove them from it first.');
    }
  }

  await db
    .insert(cupTeamMembers)
    .values({ seasonId: season.id, golferId, teamId, draftPick })
    .onConflictDoUpdate({
      target: [cupTeamMembers.seasonId, cupTeamMembers.golferId],
      set: { teamId, draftPick },
    });
}

// ---------------------------------------------------------------------------
// Sign-in details and roles (admins)
// ---------------------------------------------------------------------------

export const golferAccessSchema = z.object({
  email: z.union([z.email().max(254), z.literal(''), z.null()]).optional(),
  role: z.enum(['PLAYER', 'COMMITTEE', 'ADMIN']).optional(),
  /** Accept the address the golfer claimed for themselves. */
  approvePending: z.boolean().optional(),
  rejectPending: z.boolean().optional(),
});
export type GolferAccessInput = z.infer<typeof golferAccessSchema>;

export async function setGolferAccess(golferId: string, input: GolferAccessInput): Promise<void> {
  const [golfer] = await db.select().from(golfers).where(eq(golfers.id, golferId)).limit(1);
  if (!golfer) throw createNotFoundError('Golfer not found.');

  const patch: Partial<typeof golfers.$inferInsert> = {};
  if (input.approvePending) {
    if (!golfer.pendingEmail) throw createValidationError('Nothing to approve.');
    patch.email = golfer.pendingEmail;
    patch.pendingEmail = null;
  } else if (input.rejectPending) {
    patch.pendingEmail = null;
  } else if (input.email !== undefined) {
    patch.email = input.email ? normalizeEmail(input.email) : null;
    patch.pendingEmail = null;
  }
  if (input.role !== undefined) patch.role = input.role;
  if (Object.keys(patch).length === 0) return;

  if (patch.email) {
    const [taken] = await db
      .select({ id: golfers.id, fullName: golfers.fullName })
      .from(golfers)
      .where(eq(golfers.email, patch.email))
      .limit(1);
    if (taken && taken.id !== golferId) {
      throw createValidationError(`That email already belongs to ${taken.fullName}.`);
    }
  }

  await db.update(golfers).set(patch).where(eq(golfers.id, golferId));

  // A changed address must not leave the old owner signed in.
  if (patch.email !== undefined && patch.email !== golfer.email && golfer.email) {
    await endAllSessions(golferId);
  }
}

// ---------------------------------------------------------------------------
// Matches (captains, committee, admins)
// ---------------------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .nullable()
  .optional();

const matchFields = {
  format: z.string().trim().min(1).max(40),
  points: z.number().positive().max(100),
  playDate: isoDate,
  course: optionalText(80),
  sessionName: optionalText(40),
  notes: optionalText(500),
  margin: optionalText(20),
  players: z.array(z.object({ golferId: z.string().min(1), teamId: z.string().min(1) })).max(40),
  /** A team id (that team won), "HALVED", or null for not played yet. */
  result: z.string().min(1).nullable(),
};

export const createMatchSchema = z.object({
  ...matchFields,
  players: matchFields.players.default([]),
  result: matchFields.result.default(null),
});
export const updateMatchSchema = z.object(matchFields).partial();
export type CreateMatchInput = z.infer<typeof createMatchSchema>;
export type UpdateMatchInput = z.infer<typeof updateMatchSchema>;

interface MatchPlayerInput {
  golferId: string;
  teamId: string;
}

/**
 * Check the pairing against the season's teams. A result needs somebody on
 * each side (that is who gets the win or loss); a scheduled match may still
 * be waiting for its pairings.
 */
async function checkPlayers(
  seasonId: string,
  teams: CupTeam[],
  players: MatchPlayerInput[],
  hasResult: boolean,
): Promise<Map<string, string>> {
  const ids = players.map((p) => p.golferId);
  if (new Set(ids).size !== ids.length) {
    throw createValidationError('A golfer is listed twice in this match.');
  }
  const members = ids.length
    ? await db
        .select({
          golferId: cupTeamMembers.golferId,
          teamId: cupTeamMembers.teamId,
          handicapIndex: golfers.handicapIndex,
        })
        .from(cupTeamMembers)
        .innerJoin(golfers, eq(golfers.id, cupTeamMembers.golferId))
        .where(and(eq(cupTeamMembers.seasonId, seasonId), inArray(cupTeamMembers.golferId, ids)))
    : [];
  const memberTeam = new Map(members.map((m) => [m.golferId, m.teamId]));
  for (const p of players) {
    if (memberTeam.get(p.golferId) !== p.teamId) {
      throw createValidationError('Every player must be on the team they are playing for.');
    }
  }
  if (hasResult) {
    for (const team of teams) {
      if (!players.some((p) => p.teamId === team.id)) {
        throw createValidationError(`Pick at least one player for ${team.name}.`);
      }
    }
  }
  return new Map(members.map((m) => [m.golferId, m.handicapIndex]));
}

function resolveResult(teams: CupTeam[], result: string | null) {
  if (result === null) return { status: 'SCHEDULED', winnerTeamId: null } as const;
  if (result === 'HALVED') return { status: 'FINAL', winnerTeamId: null } as const;
  if (!teams.some((t) => t.id === result)) throw createValidationError('Unknown winning team.');
  return { status: 'FINAL', winnerTeamId: result } as const;
}

async function requireOpenSeason(): Promise<{ season: CupSeason; teams: CupTeam[] }> {
  const season = await getCurrentSeason();
  if (!season) throw createValidationError('The Ryder Cup season has not been set up yet.');
  const teams = await getTeams(season.id);
  if (teams.length !== 2) throw createValidationError('The season needs two teams first.');
  return { season, teams };
}

export async function createMatch(
  input: CreateMatchInput,
  reporterId: string | null,
): Promise<string> {
  const { season, teams } = await requireOpenSeason();
  const outcome = resolveResult(teams, input.result);
  const isFinal = outcome.status === 'FINAL';
  const indexOf = await checkPlayers(season.id, teams, input.players, isFinal);

  const matchId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(cupMatches)
      .values({
        seasonId: season.id,
        format: input.format,
        points: input.points,
        status: outcome.status,
        winnerTeamId: outcome.winnerTeamId,
        margin: isFinal ? (input.margin ?? null) : null,
        playDate: input.playDate ?? null,
        course: input.course ?? null,
        sessionName: input.sessionName ?? null,
        notes: input.notes ?? null,
        reportedById: isFinal ? reporterId : null,
        reportedAt: isFinal ? new Date() : null,
      })
      .returning({ id: cupMatches.id });
    if (input.players.length) {
      await tx.insert(cupMatchPlayers).values(
        input.players.map((p) => ({
          matchId: created.id,
          golferId: p.golferId,
          teamId: p.teamId,
          handicapIndexAtTime: indexOf.get(p.golferId) ?? null,
        })),
      );
    }
    return created.id;
  });

  await syncMatchFeedEvent(matchId);
  return matchId;
}

async function loadMatch(matchId: string): Promise<CupMatch> {
  const [match] = await db.select().from(cupMatches).where(eq(cupMatches.id, matchId)).limit(1);
  if (!match) throw createNotFoundError('Match not found.');
  return match;
}

export async function updateMatch(
  matchId: string,
  input: UpdateMatchInput,
  reporterId: string | null,
): Promise<{ becameFinal: boolean }> {
  const match = await loadMatch(matchId);
  const teams = await getTeams(match.seasonId);

  const outcome =
    input.result === undefined
      ? { status: match.status === 'FINAL' ? 'FINAL' : 'SCHEDULED', winnerTeamId: match.winnerTeamId }
      : resolveResult(teams, input.result);
  const isFinal = outcome.status === 'FINAL';

  const existingPlayers = await db
    .select()
    .from(cupMatchPlayers)
    .where(eq(cupMatchPlayers.matchId, matchId));
  const players: MatchPlayerInput[] = input.players ?? existingPlayers;
  const indexOf = await checkPlayers(match.seasonId, teams, players, isFinal);

  const becameFinal = isFinal && match.status !== 'FINAL';

  await db.transaction(async (tx) => {
    await tx
      .update(cupMatches)
      .set({
        format: input.format ?? match.format,
        points: input.points ?? match.points,
        status: outcome.status,
        winnerTeamId: outcome.winnerTeamId,
        margin: isFinal ? (input.margin !== undefined ? input.margin : match.margin) : null,
        playDate: input.playDate !== undefined ? input.playDate : match.playDate,
        course: input.course !== undefined ? input.course : match.course,
        sessionName: input.sessionName !== undefined ? input.sessionName : match.sessionName,
        notes: input.notes !== undefined ? input.notes : match.notes,
        reportedById: !isFinal ? null : becameFinal ? reporterId : match.reportedById,
        reportedAt: !isFinal ? null : becameFinal ? new Date() : match.reportedAt,
      })
      .where(eq(cupMatches.id, matchId));

    if (input.players) {
      // Keep the index a golfer was first entered with.
      const kept = new Map(existingPlayers.map((p) => [p.golferId, p.handicapIndexAtTime]));
      await tx.delete(cupMatchPlayers).where(eq(cupMatchPlayers.matchId, matchId));
      if (input.players.length) {
        await tx.insert(cupMatchPlayers).values(
          input.players.map((p) => ({
            matchId,
            golferId: p.golferId,
            teamId: p.teamId,
            handicapIndexAtTime: kept.get(p.golferId) ?? indexOf.get(p.golferId) ?? null,
          })),
        );
      }
    }
  });

  await syncMatchFeedEvent(matchId);
  return { becameFinal };
}

export async function deleteMatch(matchId: string): Promise<void> {
  const match = await loadMatch(matchId);
  await db.delete(cupMatches).where(eq(cupMatches.id, matchId));
  if (match.feedEventId) await db.delete(feedEvents).where(eq(feedEvents.id, match.feedEventId));
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

/**
 * Keep the match's feed story in step with its result: written when the match
 * goes final, reworded when the result is corrected, removed when the result
 * is cleared. The story keeps its original time so a correction does not jump
 * back to the top of the feed.
 */
async function syncMatchFeedEvent(matchId: string): Promise<void> {
  const match = await loadMatch(matchId);

  if (match.status !== 'FINAL') {
    if (match.feedEventId) await db.delete(feedEvents).where(eq(feedEvents.id, match.feedEventId));
    return;
  }

  const [[season], teams, players, finals] = await Promise.all([
    db.select().from(cupSeasons).where(eq(cupSeasons.id, match.seasonId)).limit(1),
    getTeams(match.seasonId),
    db
      .select({
        teamId: cupMatchPlayers.teamId,
        fullName: golfers.fullName,
        lastName: golfers.lastName,
      })
      .from(cupMatchPlayers)
      .innerJoin(golfers, eq(golfers.id, cupMatchPlayers.golferId))
      .where(eq(cupMatchPlayers.matchId, matchId))
      .orderBy(asc(golfers.lastName)),
    db
      .select({ winnerTeamId: cupMatches.winnerTeamId, points: cupMatches.points })
      .from(cupMatches)
      .where(and(eq(cupMatches.seasonId, match.seasonId), eq(cupMatches.status, 'FINAL'))),
  ]);
  if (teams.length !== 2) return;

  const sides = teams.map<CupNewsSide>((team) => ({
    teamName: team.name,
    teamPoints: finals.reduce(
      (sum, m) =>
        sum + (m.winnerTeamId === null ? m.points / 2 : m.winnerTeamId === team.id ? m.points : 0),
      0,
    ),
    players: players.filter((p) => p.teamId === team.id),
  })) as [CupNewsSide, CupNewsSide];

  // The cup is clinched by the result that first takes a team to the target.
  const target = season?.pointsToWin ?? null;
  const clinchedBy =
    target === null
      ? null
      : (sides.find((side, i) => {
          const gained =
            match.winnerTeamId === null
              ? match.points / 2
              : match.winnerTeamId === teams[i].id
                ? match.points
                : 0;
          return gained > 0 && side.teamPoints >= target && side.teamPoints - gained < target;
        })?.teamName ?? null);

  const story = buildCupResultStory({
    clinchedBy,
    format: match.format,
    points: match.points,
    margin: match.margin,
    winner: match.winnerTeamId === null ? null : match.winnerTeamId === teams[0].id ? 0 : 1,
    sides,
  });

  if (match.feedEventId) {
    const updated = await db
      .update(feedEvents)
      .set({ ...story, importance: clinchedBy ? 'CRITICAL' : 'HIGH' })
      .where(eq(feedEvents.id, match.feedEventId))
      .returning({ id: feedEvents.id });
    if (updated.length) return;
  }
  const [event] = await db
    .insert(feedEvents)
    .values({
      type: 'CUP_RESULT',
      importance: clinchedBy ? 'CRITICAL' : 'HIGH',
      payload: JSON.stringify({ matchId }),
      ...story,
    })
    .returning({ id: feedEvents.id });
  await db.update(cupMatches).set({ feedEventId: event.id }).where(eq(cupMatches.id, matchId));
}

/** The feed story for a reported match, for notifications. */
export async function getMatchStory(
  matchId: string,
): Promise<{ headline: string; details: string | null } | null> {
  const [row] = await db
    .select({ headline: feedEvents.headline, details: feedEvents.details })
    .from(cupMatches)
    .innerJoin(feedEvents, eq(feedEvents.id, cupMatches.feedEventId))
    .where(eq(cupMatches.id, matchId))
    .limit(1);
  return row ?? null;
}
