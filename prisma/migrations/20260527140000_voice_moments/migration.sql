-- Voice moments — Sean records a 60-second voice memo for each client
-- milestone (currently only on monthly check-in submission). Two
-- changes:
--
-- 1. ChatMessage.audioUrl + audioDurationSec — when a message is a
--    voice memo, these fields point at the R2 audio file and store
--    its duration. The chat bubble renders as an audio player
--    instead of plain text.
--
-- 2. VoiceMoment queue table — every trigger fires a queued row.
--    Sean's coach dashboard surfaces the queue; recording flips a
--    row to "recorded" and links the delivered ChatMessage.id.
--    Status values: queued | recorded | skipped.

ALTER TABLE "ChatMessage"
  ADD COLUMN "audioUrl"         TEXT,
  ADD COLUMN "audioDurationSec" INTEGER;

CREATE TABLE "VoiceMoment" (
  "id"                  TEXT NOT NULL,
  "recipientUserId"     TEXT NOT NULL,
  "triggerKind"         TEXT NOT NULL,
  "triggerSourceId"     TEXT NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'queued',
  "audioUrl"            TEXT,
  "durationSec"         INTEGER,
  "deliveredMessageId"  TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedAt"          TIMESTAMP(3),

  CONSTRAINT "VoiceMoment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VoiceMoment_deliveredMessageId_key"
  ON "VoiceMoment" ("deliveredMessageId");

CREATE UNIQUE INDEX "VoiceMoment_recipientUserId_triggerKind_triggerSourceId_key"
  ON "VoiceMoment" ("recipientUserId", "triggerKind", "triggerSourceId");

CREATE INDEX "VoiceMoment_status_createdAt_idx"
  ON "VoiceMoment" ("status", "createdAt");

ALTER TABLE "VoiceMoment"
  ADD CONSTRAINT "VoiceMoment_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "User" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VoiceMoment"
  ADD CONSTRAINT "VoiceMoment_deliveredMessageId_fkey"
  FOREIGN KEY ("deliveredMessageId") REFERENCES "ChatMessage" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
