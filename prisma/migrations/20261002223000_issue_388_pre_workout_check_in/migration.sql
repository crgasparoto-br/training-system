-- Issue #388: canonical pre-workout check-in with idempotent operation ledger.
CREATE TABLE "PreWorkoutCheckIn" (
  "id" TEXT NOT NULL,
  "workoutDayId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "psr" INTEGER,
  "sleepQuality" INTEGER,
  "fatigue" INTEGER,
  "painLevel" INTEGER,
  "motivation" INTEGER,
  "availableMinutes" INTEGER,
  "notes" TEXT,
  "ruleSetVersion" TEXT NOT NULL,
  "ruleSnapshot" JSONB NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PreWorkoutCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PreWorkoutCheckInOperation" (
  "id" TEXT NOT NULL,
  "checkInId" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "payloadFingerprint" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "lifecycleEventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PreWorkoutCheckInOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PreWorkoutCheckIn_workoutDayId_key" ON "PreWorkoutCheckIn"("workoutDayId");
CREATE INDEX "PreWorkoutCheckIn_alunoId_createdAt_idx" ON "PreWorkoutCheckIn"("alunoId", "createdAt");
CREATE INDEX "PreWorkoutCheckIn_contractId_createdAt_idx" ON "PreWorkoutCheckIn"("contractId", "createdAt");
CREATE UNIQUE INDEX "PreWorkoutCheckInOperation_checkInId_operationKey_key" ON "PreWorkoutCheckInOperation"("checkInId", "operationKey");
CREATE INDEX "PreWorkoutCheckInOperation_createdAt_idx" ON "PreWorkoutCheckInOperation"("createdAt");

ALTER TABLE "PreWorkoutCheckIn" ADD CONSTRAINT "PreWorkoutCheckIn_workoutDayId_fkey" FOREIGN KEY ("workoutDayId") REFERENCES "WorkoutDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreWorkoutCheckIn" ADD CONSTRAINT "PreWorkoutCheckIn_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreWorkoutCheckIn" ADD CONSTRAINT "PreWorkoutCheckIn_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "GeneratedContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreWorkoutCheckInOperation" ADD CONSTRAINT "PreWorkoutCheckInOperation_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "PreWorkoutCheckIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PreWorkoutCheckIn"
  ADD CONSTRAINT "PreWorkoutCheckIn_psr_check" CHECK ("psr" IS NULL OR ("psr" BETWEEN 0 AND 10)),
  ADD CONSTRAINT "PreWorkoutCheckIn_sleepQuality_check" CHECK ("sleepQuality" IS NULL OR ("sleepQuality" BETWEEN 0 AND 10)),
  ADD CONSTRAINT "PreWorkoutCheckIn_fatigue_check" CHECK ("fatigue" IS NULL OR ("fatigue" BETWEEN 0 AND 10)),
  ADD CONSTRAINT "PreWorkoutCheckIn_motivation_check" CHECK ("motivation" IS NULL OR ("motivation" BETWEEN 0 AND 10)),
  ADD CONSTRAINT "PreWorkoutCheckIn_painLevel_check" CHECK ("painLevel" IS NULL OR "painLevel" >= 0),
  ADD CONSTRAINT "PreWorkoutCheckIn_availableMinutes_check" CHECK ("availableMinutes" IS NULL OR "availableMinutes" >= 0);
