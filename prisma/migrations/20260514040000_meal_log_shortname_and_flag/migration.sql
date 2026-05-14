-- AlterTable
ALTER TABLE "MealLog"
  ADD COLUMN "shortName" TEXT,
  ADD COLUMN "processedFlag" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "flagReason" TEXT;
