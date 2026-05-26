-- Convert all timestamp columns to TIMESTAMP WITH TIME ZONE so reads are
-- timezone-agnostic. Without this, JS new Date("2026-04-09 12:00:00")
-- interprets the value in the server's local timezone, which differs
-- between local dev and Vercel (UTC).
--
-- Each ALTER TABLE is broken out separately because the Neon HTTP driver
-- only accepts one statement per prepared call.

ALTER TABLE "Golfer" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "Golfer" ALTER COLUMN "lastSyncedAt" TYPE timestamptz USING "lastSyncedAt" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "Score" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "HandicapRevision" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "FeedEvent" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt" AT TIME ZONE 'UTC';
