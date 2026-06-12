-- CreateTable
CREATE TABLE "DayPick" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "slot" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayPick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DayPick_userId_day_idx" ON "DayPick"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "DayPick_userId_day_slot_key" ON "DayPick"("userId", "day", "slot");

-- AddForeignKey
ALTER TABLE "DayPick" ADD CONSTRAINT "DayPick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
