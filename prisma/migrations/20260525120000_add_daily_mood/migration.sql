-- Daily mood ribbon — one-tap-a-day community pulse. Each client taps one
-- of four moods (tired / blah / good / fire) and immediately sees the
-- room's aggregate. Bucketed by Central-time day (so the count resets at
-- midnight CT, matching the rest of the app's day boundaries). The unique
-- on (userId, centralDate) means re-tapping during the day updates her
-- mood instead of stacking rows.

CREATE TABLE "DailyMood" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "mood"        TEXT NOT NULL,
  "centralDate" TIMESTAMP(3) NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DailyMood_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyMood_userId_centralDate_key"
  ON "DailyMood" ("userId", "centralDate");

CREATE INDEX "DailyMood_centralDate_idx"
  ON "DailyMood" ("centralDate");

ALTER TABLE "DailyMood"
  ADD CONSTRAINT "DailyMood_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
