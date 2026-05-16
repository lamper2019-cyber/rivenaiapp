-- Add a `category` column to ChatMessage so the proactive-messaging tick
-- (src/lib/sean-messages.ts) can:
--   1. Enforce a 48h cooldown per (userId, category) — don't re-send the
--      same rhythm or behavioral message back-to-back.
--   2. Enforce a per-day cap of 3 proactive sends per client by counting
--      messages where category IS NOT NULL on today's date.
--
-- Null for normal chat-thread messages and hand-written coach messages —
-- those aren't subject to the same caps.

ALTER TABLE "ChatMessage" ADD COLUMN "category" TEXT;

-- Index to make cooldown + daily-cap queries cheap.
CREATE INDEX "ChatMessage_userId_category_createdAt_idx"
  ON "ChatMessage" ("userId", "category", "createdAt");
