-- Per-day-of-week calorie schedule for advanced clients (calorie cycling).
-- NULL for everyone by default; the helper in src/lib/calorie-schedule.ts
-- falls back to Profile.cutCalories when this is unset, so existing clients
-- are unaffected.

ALTER TABLE "Profile"
  ADD COLUMN "dailyCalorieSchedule" JSONB;
