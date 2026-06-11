-- Per-post "follows" attributed by Instagram. Joins profileVisits + linkTaps
-- as the three "winner" signals on /coach/insights. Nullable for legacy rows.
ALTER TABLE "IgPostMetric" ADD COLUMN "follows" INTEGER;
