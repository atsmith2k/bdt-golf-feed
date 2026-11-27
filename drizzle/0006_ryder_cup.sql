-- Ryder Cup: sign-in by email magic link, roles, teams and matches.

ALTER TABLE "Golfer" ADD COLUMN IF NOT EXISTS "email" text;
--> statement-breakpoint
ALTER TABLE "Golfer" ADD COLUMN IF NOT EXISTS "pendingEmail" text;
--> statement-breakpoint
ALTER TABLE "Golfer" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'PLAYER';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Golfer_email_unique" ON "Golfer" ("email");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "AuthToken" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tokenHash" text NOT NULL CONSTRAINT "AuthToken_tokenHash_key" UNIQUE,
  "golferId" text NOT NULL REFERENCES "Golfer"("id") ON DELETE CASCADE,
  "email" text,
  "expiresAt" timestamptz NOT NULL,
  "usedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AuthToken_email_createdAt_idx" ON "AuthToken" ("email", "createdAt");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Session" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tokenHash" text NOT NULL CONSTRAINT "Session_tokenHash_key" UNIQUE,
  "golferId" text NOT NULL REFERENCES "Golfer"("id") ON DELETE CASCADE,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "CupSeason" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "pointsToWin" double precision,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "CupTeam" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "seasonId" text NOT NULL REFERENCES "CupSeason"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "color" text NOT NULL,
  "captainId" text REFERENCES "Golfer"("id") ON DELETE SET NULL,
  "sortOrder" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CupTeam_seasonId_idx" ON "CupTeam" ("seasonId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "CupTeamMember" (
  "seasonId" text NOT NULL REFERENCES "CupSeason"("id") ON DELETE CASCADE,
  "golferId" text NOT NULL REFERENCES "Golfer"("id") ON DELETE CASCADE,
  "teamId" text NOT NULL REFERENCES "CupTeam"("id") ON DELETE CASCADE,
  PRIMARY KEY ("seasonId", "golferId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "CupMatch" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "seasonId" text NOT NULL REFERENCES "CupSeason"("id") ON DELETE CASCADE,
  "format" text NOT NULL,
  "points" double precision NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'SCHEDULED',
  "winnerTeamId" text REFERENCES "CupTeam"("id") ON DELETE SET NULL,
  "margin" text,
  "playDate" text,
  "course" text,
  "sessionName" text,
  "notes" text,
  "reportedById" text REFERENCES "Golfer"("id") ON DELETE SET NULL,
  "reportedAt" timestamptz,
  "feedEventId" text REFERENCES "FeedEvent"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CupMatch_seasonId_idx" ON "CupMatch" ("seasonId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "CupMatchPlayer" (
  "matchId" text NOT NULL REFERENCES "CupMatch"("id") ON DELETE CASCADE,
  "golferId" text NOT NULL REFERENCES "Golfer"("id") ON DELETE CASCADE,
  "teamId" text NOT NULL REFERENCES "CupTeam"("id") ON DELETE CASCADE,
  "handicapIndexAtTime" text,
  PRIMARY KEY ("matchId", "golferId")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CupMatchPlayer_golferId_idx" ON "CupMatchPlayer" ("golferId");
