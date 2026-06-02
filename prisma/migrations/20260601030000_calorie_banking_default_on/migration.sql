-- Calorie banking ("smooth my week") is now ON by default for everyone
-- (Sean's call 2026-06-01). Flip the column default AND backfill every
-- existing client to enabled. Clients can still opt out via the /profile
-- toggle (setMyCalorieBanking writes false).

ALTER TABLE "Profile" ALTER COLUMN "calorieBankingEnabled" SET DEFAULT true;

UPDATE "Profile" SET "calorieBankingEnabled" = true WHERE "calorieBankingEnabled" = false;
