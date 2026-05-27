-- Unified "Sean" thread infrastructure. Two changes:
--
-- 1. ChatMessage.aiGenerated boolean — marks COACH-kind messages that
--    were auto-replied by AI on Sean's behalf (vs ones Sean wrote
--    manually). Invisible to clients; the coach messaging dashboard
--    uses it so Sean can see which auto-replies he might want to
--    follow up on. Defaults false so all existing messages (which
--    are all real Sean / proactive crons) read as not-AI.
--
-- 2. PendingAiReply table — queue for delayed AI auto-replies. When
--    a client sends Sean a message, a row goes in here with a
--    scheduledFor timestamp randomized in the 1.5-15 minute range.
--    The new cron at /api/cron/process-ai-replies polls every minute,
--    finds due rows, calls Claude to generate a Sean-voice reply,
--    inserts it as a COACH ChatMessage, and marks the row sent.

ALTER TABLE "ChatMessage"
  ADD COLUMN "aiGenerated" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PendingAiReply" (
  "id"               TEXT NOT NULL,
  "userId"           TEXT NOT NULL,
  "triggerMessageId" TEXT NOT NULL,
  "scheduledFor"     TIMESTAMP(3) NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'pending',
  "sentAt"           TIMESTAMP(3),
  "errorMessage"     TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PendingAiReply_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PendingAiReply_status_scheduledFor_idx"
  ON "PendingAiReply" ("status", "scheduledFor");

CREATE INDEX "PendingAiReply_userId_idx"
  ON "PendingAiReply" ("userId");

ALTER TABLE "PendingAiReply"
  ADD CONSTRAINT "PendingAiReply_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
