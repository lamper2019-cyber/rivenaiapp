-- Lead from the /quiz funnel. Captured pre-signup so Sean can route the
-- results page CTA by Q14 budget tier (FREE / APP / COACH / DONE_FOR_YOU)
-- and segment marketing later. convertedToUserId is a loose pointer, not
-- a FK, so deleting a converted User doesn't cascade and erase the lead.

CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "ipAddress" TEXT,
    "country" TEXT,
    "answers" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "budgetTier" TEXT NOT NULL,
    "convertedToUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Lead_email_idx" ON "Lead"("email");
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");
CREATE INDEX "Lead_budgetTier_score_idx" ON "Lead"("budgetTier", "score");
