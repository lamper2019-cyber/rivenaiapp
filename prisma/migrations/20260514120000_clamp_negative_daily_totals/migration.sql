-- One-time data migration. Clamps any negative DailyTotals values to 0.
--
-- Background: before the recompute-on-write refactor, logMeal/undoLastMeal
-- used Prisma's increment/decrement operators against DailyTotals. After
-- the timezone fix (commit 3efd4e2) some users had MealLog rows counted
-- in OLD UTC-midnight DailyTotals buckets while the active row is now at
-- the new Central-midnight key. Undoing one of those meals decremented a
-- row that didn't contain that meal's calories — driving values negative
-- (Sean reported a -2000 cal display).
--
-- Going forward, both logMeal and undoLastMeal recompute totals from the
-- SUM of matching MealLog rows (see src/app/(clerk)/(app)/log/actions.ts),
-- so negatives can't be reintroduced. This migration is just the one-time
-- cleanup for any rows already in a negative state.
--
-- Steps are clamped too for symmetry, even though the logSteps flow never
-- decrements — defensive only.

UPDATE "DailyTotals"
SET
  "totalCalories" = GREATEST("totalCalories", 0),
  "totalProtein"  = GREATEST("totalProtein", 0),
  "totalFat"      = GREATEST("totalFat", 0),
  "totalCarbs"    = GREATEST("totalCarbs", 0),
  "totalSteps"    = GREATEST("totalSteps", 0)
WHERE
  "totalCalories" < 0
  OR "totalProtein" < 0
  OR "totalFat" < 0
  OR "totalCarbs" < 0
  OR "totalSteps" < 0;
