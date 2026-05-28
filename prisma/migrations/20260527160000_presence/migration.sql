-- Presence tracking for the "Tracy and Adrienne are in RIVEN right
-- now" indicator. Stamped every time a user opens /dashboard.
-- 15-min window defines "active right now"; query lives in
-- src/lib/presence.ts.

ALTER TABLE "User"
  ADD COLUMN "lastDashboardSeenAt" TIMESTAMP(3);
