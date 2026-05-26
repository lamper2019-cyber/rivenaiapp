-- Falling-roses ceremony tracking. cheersLastSeenAt is bumped to now()
-- after she sits through (or skips) the animated overlay; the next
-- ceremony only includes CheerReactions newer than this. firstCheer-
-- CeremonySeenAt is set the first time the welcome banner plays, so
-- subsequent ceremonies skip the banner and go straight to the rose
-- drop.

ALTER TABLE "User"
  ADD COLUMN "cheersLastSeenAt"          TIMESTAMP(3),
  ADD COLUMN "firstCheerCeremonySeenAt"  TIMESTAMP(3);
