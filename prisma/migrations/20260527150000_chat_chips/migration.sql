-- Chat tap-reply chips for Sean's proactive daily check-ins.
--
-- chipOptions: JSON array of {label, value} pairs. When set and
-- chipsRepliedAt is null, the chat bubble renders chip buttons below
-- the message text. Tapping a chip fires the sendToSean action with
-- the chip's value as her reply, schedules the auto-reply, and stamps
-- chipsRepliedAt to hide the chips.
--
-- Both columns default null so existing messages render unchanged
-- (no chip UI on them).

ALTER TABLE "ChatMessage"
  ADD COLUMN "chipOptions"    JSONB,
  ADD COLUMN "chipsRepliedAt" TIMESTAMP(3);
