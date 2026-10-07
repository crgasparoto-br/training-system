DO $$ BEGIN
  CREATE TYPE "WorkoutSessionExecutionStatus" AS ENUM ('not_started', 'in_progress', 'paused', 'completed', 'partial', 'not_performed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE "WorkoutSessionExecution" (
  "id" TEXT NOT NULL,
  "workoutDayId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "originReleaseId" TEXT NOT NULL,
  "originWorkoutTemplateId" TEXT NOT NULL,
  "originTrainingPlanId" TEXT NOT NULL,
  "status" "WorkoutSessionExecutionStatus" NOT NULL DEFAULT 'not_started',
  "version" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "interruptionReason" TEXT,
  "currentPauseStartedAt" TIMESTAMP(3),
  "pausedDurationMs" BIGINT NOT NULL DEFAULT 0,
  "sessionValues" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkoutSessionExecution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkoutSessionExecution_workoutDayId_fkey" FOREIGN KEY ("workoutDayId") REFERENCES "WorkoutDay"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkoutSessionExecution_workoutDayId_key" ON "WorkoutSessionExecution"("workoutDayId");
CREATE INDEX "WorkoutSessionExecution_alunoId_contractId_status_idx" ON "WorkoutSessionExecution"("alunoId", "contractId", "status");
CREATE INDEX "WorkoutSessionExecution_originReleaseId_idx" ON "WorkoutSessionExecution"("originReleaseId");
CREATE INDEX "WorkoutSessionExecution_updatedAt_idx" ON "WorkoutSessionExecution"("updatedAt");

CREATE TABLE "WorkoutSessionExecutionOperation" (
  "id" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "payloadFingerprint" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetStatus" "WorkoutSessionExecutionStatus",
  "expectedVersion" INTEGER NOT NULL,
  "resultingVersion" INTEGER NOT NULL,
  "lifecycleEventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkoutSessionExecutionOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkoutSessionExecutionOperation_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "WorkoutSessionExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkoutSessionExecutionOperation_executionId_operationKey_key" ON "WorkoutSessionExecutionOperation"("executionId", "operationKey");
CREATE INDEX "WorkoutSessionExecutionOperation_createdAt_idx" ON "WorkoutSessionExecutionOperation"("createdAt");

CREATE TABLE "WorkoutSessionPauseInterval" (
  "id" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkoutSessionPauseInterval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkoutSessionPauseInterval_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "WorkoutSessionExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WorkoutSessionPauseInterval_executionId_startedAt_idx" ON "WorkoutSessionPauseInterval"("executionId", "startedAt");

CREATE TABLE "WorkoutSessionExecutionItem" (
  "id" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "plannedUnitId" TEXT NOT NULL,
  "setNumber" INTEGER NOT NULL DEFAULT 0,
  "loadKg" DOUBLE PRECISION,
  "repetitions" INTEGER,
  "durationSec" INTEGER,
  "distanceKm" DOUBLE PRECISION,
  "pace" TEXT,
  "heartRateBpm" INTEGER,
  "heartRateZone" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkoutSessionExecutionItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkoutSessionExecutionItem_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "WorkoutSessionExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkoutSessionExecutionItem_plannedUnitId_fkey" FOREIGN KEY ("plannedUnitId") REFERENCES "WorkoutExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkoutSessionExecutionItem_setNumber_check" CHECK ("setNumber" >= 0),
  CONSTRAINT "WorkoutSessionExecutionItem_repetitions_check" CHECK ("repetitions" IS NULL OR "repetitions" >= 0),
  CONSTRAINT "WorkoutSessionExecutionItem_durationSec_check" CHECK ("durationSec" IS NULL OR "durationSec" >= 0),
  CONSTRAINT "WorkoutSessionExecutionItem_distanceKm_check" CHECK ("distanceKm" IS NULL OR "distanceKm" >= 0),
  CONSTRAINT "WorkoutSessionExecutionItem_loadKg_check" CHECK ("loadKg" IS NULL OR "loadKg" >= 0),
  CONSTRAINT "WorkoutSessionExecutionItem_heartRateBpm_check" CHECK ("heartRateBpm" IS NULL OR ("heartRateBpm" >= 0 AND "heartRateBpm" <= 260))
);
CREATE UNIQUE INDEX "WorkoutSessionExecutionItem_executionId_plannedUnitId_setNumber_key" ON "WorkoutSessionExecutionItem"("executionId", "plannedUnitId", "setNumber");
CREATE INDEX "WorkoutSessionExecutionItem_plannedUnitId_idx" ON "WorkoutSessionExecutionItem"("plannedUnitId");
