-- Sunday Daily Ritual — one weekly community prompt + per-client answers
-- + per-answer reactions. "Open Sunday" semantics live in app code, not
-- here — the schema records everything, the UI decides who can write
-- when (day == Sunday in Central time).

CREATE TABLE "SundayPrompt" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "question" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SundayPrompt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SundayPrompt_weekStart_key" ON "SundayPrompt"("weekStart");

CREATE TABLE "SundayPromptAnswer" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SundayPromptAnswer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SundayPromptAnswer_promptId_userId_key"
  ON "SundayPromptAnswer"("promptId", "userId");

CREATE INDEX "SundayPromptAnswer_promptId_createdAt_idx"
  ON "SundayPromptAnswer"("promptId", "createdAt");

ALTER TABLE "SundayPromptAnswer"
  ADD CONSTRAINT "SundayPromptAnswer_promptId_fkey"
  FOREIGN KEY ("promptId") REFERENCES "SundayPrompt"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SundayPromptAnswer"
  ADD CONSTRAINT "SundayPromptAnswer_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SundayPromptReaction" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SundayPromptReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SundayPromptReaction_answerId_userId_kind_key"
  ON "SundayPromptReaction"("answerId", "userId", "kind");

CREATE INDEX "SundayPromptReaction_answerId_idx"
  ON "SundayPromptReaction"("answerId");

ALTER TABLE "SundayPromptReaction"
  ADD CONSTRAINT "SundayPromptReaction_answerId_fkey"
  FOREIGN KEY ("answerId") REFERENCES "SundayPromptAnswer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SundayPromptReaction"
  ADD CONSTRAINT "SundayPromptReaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
