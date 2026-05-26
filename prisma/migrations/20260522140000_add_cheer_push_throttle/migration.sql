-- 10-minute throttle for peer-cheer push notifications. When a 🌹 lands
-- and cheerLastPushAt is null or > 10 min ago, the action fires a push
-- and updates this timestamp. Subsequent cheers inside the same window
-- skip the push so she doesn't get buzz-buzz-buzz for a flurry — the
-- dashboard card surfaces them when she opens the app instead.

ALTER TABLE "User"
  ADD COLUMN "cheerLastPushAt" TIMESTAMP(3);
