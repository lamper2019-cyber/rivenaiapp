-- Vision engine output on each post (src/lib/vision.ts). Reads the SCREEN
-- (on-screen captions + visuals) since Sean's content is mostly silent.

ALTER TABLE "IgPost" ADD COLUMN "onScreenText" TEXT;
ALTER TABLE "IgPost" ADD COLUMN "visualSummary" TEXT;
ALTER TABLE "IgPost" ADD COLUMN "contentType" TEXT;
ALTER TABLE "IgPost" ADD COLUMN "whyItWorks" TEXT;
ALTER TABLE "IgPost" ADD COLUMN "visionAt" TIMESTAMP(3);
