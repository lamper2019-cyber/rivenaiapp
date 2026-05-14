-- Per-item breakdown for meal logs. JSON array of
-- { name, calories, protein, fat, carbs }. Drives the per-item pill UI on
-- /log so a "Big Mac, large fries, quest chips" log shows up as three
-- separately tappable pills with their own macros — instead of one
-- combo row that pre-fills the whole thing on tap.
--
-- Nullable on existing rows; populated for new logs from Claude's
-- structured output. UI falls back to the combined shortName for legacy.

ALTER TABLE "MealLog" ADD COLUMN "items" JSONB;
