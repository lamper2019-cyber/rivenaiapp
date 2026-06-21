-- CreateTable
CREATE TABLE "WaistEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "waistIn" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaistEntry_userId_weekStart_idx" ON "WaistEntry"("userId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "WaistEntry_userId_weekStart_key" ON "WaistEntry"("userId", "weekStart");

-- AddForeignKey
ALTER TABLE "WaistEntry" ADD CONSTRAINT "WaistEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

