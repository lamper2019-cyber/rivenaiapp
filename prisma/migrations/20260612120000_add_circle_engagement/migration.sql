-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "shareToCircle" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "CommunityPost" ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "DailyAnswer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "questionKey" TEXT NOT NULL,
    "choice" TEXT,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyAnswer_day_idx" ON "DailyAnswer"("day");

-- CreateIndex
CREATE UNIQUE INDEX "DailyAnswer_userId_day_key" ON "DailyAnswer"("userId", "day");

-- CreateIndex
CREATE INDEX "CommunityPost_authorId_source_idx" ON "CommunityPost"("authorId", "source");

-- AddForeignKey
ALTER TABLE "DailyAnswer" ADD CONSTRAINT "DailyAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

