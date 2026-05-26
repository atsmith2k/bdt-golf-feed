-- Add fields surfaced by GHIN's /handicap_history.json that we previously
-- couldn't capture (low HI as of revision, soft/hard cap flags, pre-cap
-- value), and a new GolferStats table backing /statistics.json.
--
-- Each statement is broken out separately because the Neon HTTP driver
-- only accepts one statement per prepared call.

ALTER TABLE "HandicapRevision" ADD COLUMN IF NOT EXISTS "lowHandicapIndex" text;
--> statement-breakpoint
ALTER TABLE "HandicapRevision" ADD COLUMN IF NOT EXISTS "isSoftCap" text;
--> statement-breakpoint
ALTER TABLE "HandicapRevision" ADD COLUMN IF NOT EXISTS "isHardCap" text;
--> statement-breakpoint
ALTER TABLE "HandicapRevision" ADD COLUMN IF NOT EXISTS "hiBeforeSoftCap" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "GolferStats" (
  "golferId" text PRIMARY KEY REFERENCES "Golfer"("id") ON DELETE CASCADE,
  "totalSummaryRounds" integer NOT NULL DEFAULT 0,
  "totalStatsRounds" integer NOT NULL DEFAULT 0,
  "payload" text NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
