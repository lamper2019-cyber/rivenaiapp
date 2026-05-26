-- Peer-to-peer cheer reactions. Other clients send 🌹 to a member having
-- a hard day. Unique constraint prevents one sender from spamming the
-- same trigger context for the same recipient.

CREATE TABLE "CheerReaction" (
    "id" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheerReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CheerReaction_recipientUserId_senderUserId_context_key"
  ON "CheerReaction"("recipientUserId", "senderUserId", "context");

CREATE INDEX "CheerReaction_recipientUserId_createdAt_idx"
  ON "CheerReaction"("recipientUserId", "createdAt");

CREATE INDEX "CheerReaction_senderUserId_idx"
  ON "CheerReaction"("senderUserId");

ALTER TABLE "CheerReaction"
  ADD CONSTRAINT "CheerReaction_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CheerReaction"
  ADD CONSTRAINT "CheerReaction_senderUserId_fkey"
  FOREIGN KEY ("senderUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
