-- Optional second-tap on the daily mood ribbon: after she picks her
-- mood, she gets a soft "what's making it ___?" question with three
-- options (sleep / food / stress). Null = skipped or not asked.
-- Drives client + coach mood-pattern dashboards.

ALTER TABLE "DailyMood"
  ADD COLUMN "cause" TEXT;
