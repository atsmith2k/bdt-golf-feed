CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Golfer" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"ghinNumber" text NOT NULL,
	"firstName" text NOT NULL,
	"lastName" text NOT NULL,
	"fullName" text NOT NULL,
	"handicapIndex" text NOT NULL,
	"handicapIndexValue" double precision NOT NULL,
	"lowHandicapIndex" text,
	"club" text,
	"association" text,
	"status" text DEFAULT 'Active' NOT NULL,
	"revisionDate" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"lastSyncedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Golfer_ghinNumber_unique" UNIQUE("ghinNumber")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Score" (
	"id" text PRIMARY KEY NOT NULL,
	"golferId" text NOT NULL,
	"datePlayed" text NOT NULL,
	"courseName" text NOT NULL,
	"score" integer NOT NULL,
	"adjustedGrossScore" integer NOT NULL,
	"netScore" integer NOT NULL,
	"courseRating" text,
	"courseSlope" text,
	"teeColor" text,
	"numberOfHoles" integer,
	"toParDisplay" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "HandicapRevision" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"golferId" text NOT NULL,
	"revisionDate" text NOT NULL,
	"handicapIndex" text NOT NULL,
	"club" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "FeedEvent" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"golferId" text,
	"type" text NOT NULL,
	"headline" text NOT NULL,
	"details" text,
	"importance" text DEFAULT 'MEDIUM' NOT NULL,
	"payload" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Score" ADD CONSTRAINT "Score_golferId_Golfer_id_fk" FOREIGN KEY ("golferId") REFERENCES "Golfer"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "HandicapRevision" ADD CONSTRAINT "HandicapRevision_golferId_Golfer_id_fk" FOREIGN KEY ("golferId") REFERENCES "Golfer"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FeedEvent" ADD CONSTRAINT "FeedEvent_golferId_Golfer_id_fk" FOREIGN KEY ("golferId") REFERENCES "Golfer"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Score_golferId_datePlayed_idx" ON "Score" ("golferId","datePlayed");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "HandicapRevision_golferId_revisionDate_idx" ON "HandicapRevision" ("golferId","revisionDate");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "HandicapRevision_golferId_revisionDate_key" ON "HandicapRevision" ("golferId","revisionDate");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FeedEvent_createdAt_idx" ON "FeedEvent" ("createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FeedEvent_type_idx" ON "FeedEvent" ("type");
