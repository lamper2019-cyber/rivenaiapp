-- Content Command Center (/coach/insights). Stores daily snapshots of Sean's
-- Instagram performance joined to the RIVEN funnel (link taps → quiz → trials),
-- filled by /api/cron/sync-instagram. See prisma/schema.prisma for field docs.

-- CreateTable
CREATE TABLE "IgPost" (
    "id" TEXT NOT NULL,
    "igId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "permalink" TEXT,
    "caption" TEXT,
    "thumbnailUrl" TEXT,
    "mediaUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "transcript" TEXT,
    "hook" TEXT,
    "utmContent" TEXT,

    CONSTRAINT "IgPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgPostMetric" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "reach" INTEGER,
    "impressions" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "saved" INTEGER,
    "shares" INTEGER,
    "plays" INTEGER,
    "avgWatchTimeMs" INTEGER,
    "totalWatchTimeMs" INTEGER,
    "profileVisits" INTEGER,
    "linkTaps" INTEGER,
    "quizStarts" INTEGER,
    "trials" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IgPostMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgAccountSnapshot" (
    "id" TEXT NOT NULL,
    "followers" INTEGER,
    "reach7d" INTEGER,
    "profileVisits7d" INTEGER,
    "qualifiedDmsWeek" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IgAccountSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IgPost_igId_key" ON "IgPost"("igId");

-- CreateIndex
CREATE INDEX "IgPost_publishedAt_idx" ON "IgPost"("publishedAt");

-- CreateIndex
CREATE INDEX "IgPostMetric_postId_capturedAt_idx" ON "IgPostMetric"("postId", "capturedAt");

-- CreateIndex
CREATE INDEX "IgAccountSnapshot_capturedAt_idx" ON "IgAccountSnapshot"("capturedAt");

-- AddForeignKey
ALTER TABLE "IgPostMetric" ADD CONSTRAINT "IgPostMetric_postId_fkey" FOREIGN KEY ("postId") REFERENCES "IgPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
