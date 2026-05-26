// src/lib/db/schema.ts
//
// Drizzle ORM schema. This is the single source of truth for the database;
// `npm run db:generate` produces SQL migrations from this file and
// `npm run db:migrate` applies them to whatever database DATABASE_URL points
// at (local Neon, prod Neon, or any other Postgres).

import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  doublePrecision,
  integer,
  timestamp,
  index,
  uniqueIndex,
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
    revisionDate: text('revisionDate').notNull(),
    handicapIndex: text('handicapIndex').notNull(),
    club: text('club'),
    createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGolferRevision: index('HandicapRevision_golferId_revisionDate_idx').on(
      t.golferId,
      t.revisionDate,
    ),
    uniqueGolferRevision: uniqueIndex('HandicapRevision_golferId_revisionDate_key').on(
      t.golferId,
      t.revisionDate,
    ),
  }),
);

export const feedEvents = pgTable(
  'FeedEvent',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    golferId: text('golferId').references(() => golfers.id, { onDelete: 'cascade' }),
    /** SCORE_POSTED | HANDICAP_CHANGED | LOW_ROUND_ALERT | MILESTONE | ADMIN_ANNOUNCEMENT */
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
