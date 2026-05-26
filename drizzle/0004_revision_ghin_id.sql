-- Replace the date-based uniqueness on HandicapRevision with a stable
-- GHIN-supplied revision ID. GHIN's /handicap_history.json regularly
-- returns multiple revisions on the same calendar day (a club re-post,
-- or a same-day correction), which the previous UNIQUE(golferId,
-- revisionDate) index rejected — causing the entire revision insert
-- loop to throw and the chart to come up empty.
--
-- Each statement is broken out separately because the Neon HTTP driver
-- only accepts one statement per prepared call.

ALTER TABLE "HandicapRevision" ADD COLUMN IF NOT EXISTS "ghinRevisionId" text;
--> statement-breakpoint
DROP INDEX IF EXISTS "HandicapRevision_golferId_revisionDate_key";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "HandicapRevision_golferId_ghinRevisionId_key"
  ON "HandicapRevision" ("golferId", "ghinRevisionId")
  WHERE "ghinRevisionId" IS NOT NULL;
