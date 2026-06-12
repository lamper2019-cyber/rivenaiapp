-- AlterTable
ALTER TABLE "DayPick" ADD COLUMN     "eatenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MealDislike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealDislike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MealDislike_userId_idx" ON "MealDislike"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MealDislike_userId_mealId_key" ON "MealDislike"("userId", "mealId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachFlag_userId_day_kind_key" ON "CoachFlag"("userId", "day", "kind");

-- AddForeignKey
ALTER TABLE "MealDislike" ADD CONSTRAINT "MealDislike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachFlag" ADD CONSTRAINT "CoachFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
