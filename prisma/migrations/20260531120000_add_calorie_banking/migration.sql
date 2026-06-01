-- Client-controlled calorie banking ("smooth my week"). When ON, today's
-- target = cutCalories + yesterday's leftover/overage, replayed from Sunday
-- and clamped to cutCalories ± 600. Defaults OFF so every existing client is
-- unaffected; the resolver in src/lib/calorie-banking.ts falls back to the
-- flat cutCalories / per-day schedule when this is false.

ALTER TABLE "Profile"
  ADD COLUMN "calorieBankingEnabled" BOOLEAN NOT NULL DEFAULT false;
