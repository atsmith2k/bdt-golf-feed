-- Persist the per-round detail blocks GHIN now ships in
-- /golfers/{id}/scores.json. The dedicated /statistics.json endpoint is
-- no longer public for non-self golfers, so we aggregate scoring mix
-- and advanced stats from these rows on read.
--
-- Each statement is broken out separately because the Neon HTTP driver
-- only accepts one statement per prepared call.

ALTER TABLE "Score" ADD COLUMN IF NOT EXISTS "holeDetails" text;
--> statement-breakpoint
ALTER TABLE "Score" ADD COLUMN IF NOT EXISTS "roundStatistics" text;
