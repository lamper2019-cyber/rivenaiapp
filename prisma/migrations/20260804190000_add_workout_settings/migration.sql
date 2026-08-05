-- Per-exercise training numbers for the /coach/train push/pull/legs board.
CREATE TABLE "WorkoutSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseKey" TEXT NOT NULL,
    "sets" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "weightLb" INTEGER NOT NULL,
    "weightChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkoutSetting_userId_exerciseKey_key" ON "WorkoutSetting"("userId", "exerciseKey");
CREATE INDEX "WorkoutSetting_userId_idx" ON "WorkoutSetting"("userId");

ALTER TABLE "WorkoutSetting" ADD CONSTRAINT "WorkoutSetting_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
