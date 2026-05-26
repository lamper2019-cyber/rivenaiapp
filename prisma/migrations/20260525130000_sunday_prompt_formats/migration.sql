-- Rotate-able Sunday prompt formats. Three tap-based card types (pulse /
-- this_or_that / is_this_you) plus the legacy "open" written-answer format.
-- Going forward, new prompts auto-rotate through the three tap formats.
-- Sean can override per week. Historical written answers stay readable
-- (body column kept on SundayPromptAnswer, just made nullable).

ALTER TABLE "SundayPrompt"
  ADD COLUMN "kind"    TEXT NOT NULL DEFAULT 'pulse',
  ADD COLUMN "options" JSONB;

-- Every existing prompt is a historical written-answer prompt. The default
-- 'pulse' value we just added is correct for FUTURE inserts, but legacy
-- rows need to be marked 'open' so the UI renders them in replay mode with
-- the body text instead of trying to look up tap options that don't exist.
UPDATE "SundayPrompt" SET "kind" = 'open';

ALTER TABLE "SundayPromptAnswer"
  ADD COLUMN "choice" TEXT,
  ALTER COLUMN "body" DROP NOT NULL;
