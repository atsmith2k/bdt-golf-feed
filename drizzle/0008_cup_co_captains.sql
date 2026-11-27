-- A Ryder Cup team may have two captains.

ALTER TABLE "CupTeam" ADD COLUMN IF NOT EXISTS "coCaptainId" text REFERENCES "Golfer"("id") ON DELETE SET NULL;
