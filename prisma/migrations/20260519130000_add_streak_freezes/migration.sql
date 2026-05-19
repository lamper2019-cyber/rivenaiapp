-- Duolingo-style streak protection. Each client starts with one freeze.
-- v1 of this feature ships the foundation (column + UI visibility); the
-- auto-spend logic in sean-messages lands in a follow-up so the behavior
-- can be tested in isolation before going live on the cron path.

ALTER TABLE "Profile"
  ADD COLUMN "streakFreezesAvailable" INTEGER NOT NULL DEFAULT 1;
