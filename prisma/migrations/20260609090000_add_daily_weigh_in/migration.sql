-- CreateTable
CREATE TABLE "DailyWeighIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "weightLb" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyWeighIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyWeighIn_userId_day_idx" ON "DailyWeighIn"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWeighIn_userId_day_key" ON "DailyWeighIn"("userId", "day");

-- AddForeignKey
ALTER TABLE "DailyWeighIn" ADD CONSTRAINT "DailyWeighIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

