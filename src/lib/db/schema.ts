// src/lib/db/schema.ts
//
// Drizzle ORM schema. This is the single source of truth for the database;
// `npm run db:generate` produces SQL migrations from this file and
// `npm run db:migrate` applies them to whatever database DATABASE_URL points
// at. The server also applies them itself on every start.

import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  doublePrecision,
  integer,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const golfers = pgTable('Golfer', {
  id: text('id')
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  ghinNumber: text('ghinNumber').notNull().unique(),
  firstName: text('firstName').notNull(),
  lastName: text('lastName').notNull(),
  fullName: text('fullName').notNull(),
  handicapIndex: text('handicapIndex').notNull(),
  handicapIndexValue: doublePrecision('handicapIndexValue').notNull(),
  lowHandicapIndex: text('lowHandicapIndex'),
  club: text('club'),
  association: text('association'),
  status: text('status').notNull().default('Active'),
  revisionDate: text('revisionDate'),
  /** Sign-in address, lower-cased. Attached by an admin or claimed by the golfer. */
  email: text('email').unique('Golfer_email_unique'),
  /**
   * An address the golfer claimed and verified that an admin has not approved
   * yet. Only used when the golfer holds a role or captains a team.
   */
  pendingEmail: text('pendingEmail'),
  /** PLAYER | COMMITTEE | ADMIN. Captains are whoever a CupTeam names. */
  role: text('role').notNull().default('PLAYER'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  lastSyncedAt: timestamp('lastSyncedAt', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export const scores = pgTable(
  'Score',
  {
    id: text('id').primaryKey(), // GHIN score_id
    golferId: text('golferId')
      .notNull()
      .references(() => golfers.id, { onDelete: 'cascade' }),
    datePlayed: text('datePlayed').notNull(),
    courseName: text('courseName').notNull(),
    score: integer('score').notNull(),
    adjustedGrossScore: integer('adjustedGrossScore').notNull(),
    netScore: integer('netScore').notNull(),
    courseRating: text('courseRating'),
    courseSlope: text('courseSlope'),
    teeColor: text('teeColor'),
    /** 9 or 18 — distinguishes a 9-hole round in the feed copy. */
    numberOfHoles: integer('numberOfHoles'),
    /** GHIN-provided "to par" display value (e.g. "+6", "E"). */
    toParDisplay: text('toParDisplay'),
    /**
     * The golfer's handicap index AS OF this score being posted, taken from
     * the score row itself. Used to derive HANDICAP_CHANGED events
     * historically when the dedicated revisions endpoint is unavailable.
     */
    handicapIndexAtTime: text('handicapIndexAtTime'),
    /**
     * Per-hole detail JSON (`hole_details[]` from /scores.json). Stored
     * as JSON text so we can derive hole-by-hole birdie/par/bogey
     * aggregations without another round trip.
     */
    holeDetails: text('holeDetails'),
    /**
     * Per-round statistics block (`statistics` from /scores.json). Stored
     * as JSON text. Aggregates feed the profile-level scoring stats now
     * that the dedicated /statistics.json endpoint is no longer public.
     */
    roundStatistics: text('roundStatistics'),
    createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGolferDate: index('Score_golferId_datePlayed_idx').on(t.golferId, t.datePlayed),
  }),
);

export const handicapRevisions = pgTable(
  'HandicapRevision',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    golferId: text('golferId')
      .notNull()
      .references(() => golfers.id, { onDelete: 'cascade' }),
    /**
     * Stable per-revision identifier from GHIN's `/handicap_history.json`
     * response (the `ID` field). Used for idempotent upserts because
     * GHIN routinely emits multiple revisions on the same calendar day.
     */
    ghinRevisionId: text('ghinRevisionId'),
    revisionDate: text('revisionDate').notNull(),
    handicapIndex: text('handicapIndex').notNull(),
    club: text('club'),
    /** Lowest handicap index as of this revision row (LowHIDisplay). */
    lowHandicapIndex: text('lowHandicapIndex'),
    /** "Y" when GHIN flags an active soft cap on this revision. */
    isSoftCap: text('isSoftCap'),
    /** "Y" when GHIN flags an active hard cap on this revision. */
    isHardCap: text('isHardCap'),
    /** Pre-cap index value (HIBeforeSoftCapDisplay) when a cap is active. */
    hiBeforeSoftCap: text('hiBeforeSoftCap'),
    createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGolferRevision: index('HandicapRevision_golferId_revisionDate_idx').on(
      t.golferId,
      t.revisionDate,
    ),
    // Partial unique index: every (golfer, GHIN ID) tuple is unique, but
    // legacy rows with NULL ghinRevisionId are exempt from the constraint.
    uniqueGolferRevisionId: uniqueIndex('HandicapRevision_golferId_ghinRevisionId_key')
      .on(t.golferId, t.ghinRevisionId)
      .where(sql`${t.ghinRevisionId} IS NOT NULL`),
  }),
);

/**
 * Round-distribution and shot statistics pulled from
 * `/golfers/{id}/statistics.json`. One row per golfer; `payload` stores the
 * full JSON shape so we can surface new fields without another migration.
 */
export const golferStats = pgTable('GolferStats', {
  golferId: text('golferId')
    .primaryKey()
    .references(() => golfers.id, { onDelete: 'cascade' }),
  totalSummaryRounds: integer('totalSummaryRounds').notNull().default(0),
  totalStatsRounds: integer('totalStatsRounds').notNull().default(0),
  /** Full normalized GhinGolferStatistics payload as JSON. */
  payload: text('payload').notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export const feedEvents = pgTable(
  'FeedEvent',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    golferId: text('golferId').references(() => golfers.id, { onDelete: 'cascade' }),
    /** SCORE_POSTED | HANDICAP_CHANGED | LOW_ROUND_ALERT | MILESTONE | ADMIN_ANNOUNCEMENT | CUP_RESULT */
    type: text('type').notNull(),
    headline: text('headline').notNull(),
    details: text('details'),
    /** LOW | MEDIUM | HIGH | CRITICAL */
    importance: text('importance').notNull().default('MEDIUM'),
    /** Optional JSON-stringified payload for richer cards. */
    payload: text('payload'),
    createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byCreatedAt: index('FeedEvent_createdAt_idx').on(t.createdAt),
    byType: index('FeedEvent_type_idx').on(t.type),
  }),
);

// ---------------------------------------------------------------------------
// Sign-in (email magic link)
// ---------------------------------------------------------------------------

/** A one-time sign-in link. Only the SHA-256 of the token is stored. */
export const authTokens = pgTable(
  'AuthToken',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    tokenHash: text('tokenHash').notNull().unique('AuthToken_tokenHash_key'),
    golferId: text('golferId')
      .notNull()
      .references(() => golfers.id, { onDelete: 'cascade' }),
    /**
     * The address the link was sent to. When the golfer has no email yet,
     * using the link attaches this one. Null for a link an admin generated.
     */
    email: text('email'),
    expiresAt: timestamp('expiresAt', { withTimezone: true, mode: 'date' }).notNull(),
    usedAt: timestamp('usedAt', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byEmailCreated: index('AuthToken_email_createdAt_idx').on(t.email, t.createdAt),
  }),
);

/** A signed-in device. The cookie holds the token; the row holds its SHA-256. */
export const sessions = pgTable('Session', {
  id: text('id')
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  tokenHash: text('tokenHash').notNull().unique('Session_tokenHash_key'),
  golferId: text('golferId')
    .notNull()
    .references(() => golfers.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expiresAt', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Ryder Cup
// ---------------------------------------------------------------------------

export const cupSeasons = pgTable('CupSeason', {
  id: text('id')
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  name: text('name').notNull(),
  /** ACTIVE | COMPLETE. The newest ACTIVE season is the one the site shows. */
  status: text('status').notNull().default('ACTIVE'),
  /** Points that clinch the cup, when the league sets a target. */
  pointsToWin: doublePrecision('pointsToWin'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export const cupTeams = pgTable(
  'CupTeam',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    seasonId: text('seasonId')
      .notNull()
      .references(() => cupSeasons.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Hex colour, e.g. "#D41F2F". */
    color: text('color').notNull(),
    captainId: text('captainId').references(() => golfers.id, { onDelete: 'set null' }),
    /** 0 or 1: which side of the scoreboard the team sits on. */
    sortOrder: integer('sortOrder').notNull().default(0),
  },
  (t) => ({
    bySeason: index('CupTeam_seasonId_idx').on(t.seasonId),
  }),
);

export const cupTeamMembers = pgTable(
  'CupTeamMember',
  {
    seasonId: text('seasonId')
      .notNull()
      .references(() => cupSeasons.id, { onDelete: 'cascade' }),
    golferId: text('golferId')
      .notNull()
      .references(() => golfers.id, { onDelete: 'cascade' }),
    teamId: text('teamId')
      .notNull()
      .references(() => cupTeams.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    // A golfer plays for one team per season.
    pk: primaryKey({ columns: [t.seasonId, t.golferId] }),
  }),
);

export const cupMatches = pgTable(
  'CupMatch',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    seasonId: text('seasonId')
      .notNull()
      .references(() => cupSeasons.id, { onDelete: 'cascade' }),
    /** Free text: "Singles", "Fourball", "Foursomes", "Scramble" or anything else. */
    format: text('format').notNull(),
    /** Points the match is worth: all to the winner, split when halved. */
    points: doublePrecision('points').notNull().default(1),
    /** SCHEDULED | FINAL */
    status: text('status').notNull().default('SCHEDULED'),
    /** The winner of a FINAL match. Null on a FINAL match means halved. */
    winnerTeamId: text('winnerTeamId').references(() => cupTeams.id, { onDelete: 'set null' }),
    /** Optional, e.g. "3&2" or "1 up". */
    margin: text('margin'),
    /** YYYY-MM-DD: when it is scheduled, then when it was played. */
    playDate: text('playDate'),
    course: text('course'),
    /** Optional grouping label, e.g. "Week 3" or "Opening Day". */
    sessionName: text('sessionName'),
    notes: text('notes'),
    reportedById: text('reportedById').references(() => golfers.id, { onDelete: 'set null' }),
    reportedAt: timestamp('reportedAt', { withTimezone: true, mode: 'date' }),
    /** The feed story for this result, kept in step when the result changes. */
    feedEventId: text('feedEventId').references(() => feedEvents.id, { onDelete: 'set null' }),
    createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    bySeason: index('CupMatch_seasonId_idx').on(t.seasonId),
  }),
);

export const cupMatchPlayers = pgTable(
  'CupMatchPlayer',
  {
    matchId: text('matchId')
      .notNull()
      .references(() => cupMatches.id, { onDelete: 'cascade' }),
    golferId: text('golferId')
      .notNull()
      .references(() => golfers.id, { onDelete: 'cascade' }),
    teamId: text('teamId')
      .notNull()
      .references(() => cupTeams.id, { onDelete: 'cascade' }),
    /** The golfer's index when they were put in the match (for strokes given). */
    handicapIndexAtTime: text('handicapIndexAtTime'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.matchId, t.golferId] }),
    byGolfer: index('CupMatchPlayer_golferId_idx').on(t.golferId),
  }),
);

export type CupSeason = typeof cupSeasons.$inferSelect;
export type CupTeam = typeof cupTeams.$inferSelect;
export type CupMatch = typeof cupMatches.$inferSelect;
export type CupMatchPlayer = typeof cupMatchPlayers.$inferSelect;

// Convenience inferred types — used by the rest of the app instead of
// hand-maintained DTO interfaces for DB rows.
export type Golfer = typeof golfers.$inferSelect;
export type NewGolfer = typeof golfers.$inferInsert;
export type Score = typeof scores.$inferSelect;
export type NewScore = typeof scores.$inferInsert;
export type HandicapRevision = typeof handicapRevisions.$inferSelect;
export type NewHandicapRevision = typeof handicapRevisions.$inferInsert;
export type FeedEvent = typeof feedEvents.$inferSelect;
export type NewFeedEvent = typeof feedEvents.$inferInsert;
export type GolferStat = typeof golferStats.$inferSelect;
export type NewGolferStat = typeof golferStats.$inferInsert;
