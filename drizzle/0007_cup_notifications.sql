-- Ryder Cup notifications (email opt-ins, web push), the weekly recap ledger
-- and draft pick numbers.

ALTER TABLE "Golfer" ADD COLUMN IF NOT EXISTS "notifyResults" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "Golfer" ADD COLUMN IF NOT EXISTS "notifyWeekly" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "Golfer" ADD COLUMN IF NOT EXISTS "unsubscribeToken" text;
--> statement-breakpoint
ALTER TABLE "Golfer" ADD COLUMN IF NOT EXISTS "emailApproved" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "CupTeamMember" ADD COLUMN IF NOT EXISTS "draftPick" integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "CupRecap" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "seasonId" text NOT NULL REFERENCES "CupSeason"("id") ON DELETE CASCADE,
  "weekEnding" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "CupRecap_seasonId_weekEnding_key" ON "CupRecap" ("seasonId", "weekEnding");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "endpoint" text NOT NULL CONSTRAINT "PushSubscription_endpoint_key" UNIQUE,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
