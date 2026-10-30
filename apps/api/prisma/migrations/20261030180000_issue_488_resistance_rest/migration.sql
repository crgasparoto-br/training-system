-- #488: a rest belongs to a completed canonical planned set, not to a planning row.
CREATE TYPE "WorkoutResistanceRestStatus" AS ENUM ('active', 'completed', 'skipped', 'interrupted');

CREATE TABLE "WorkoutSessionResistanceRest" (
  "id" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "afterPlannedSetId" TEXT NOT NULL,
  "plannedSeconds" INTEGER NOT NULL,
  "extensionSeconds" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "targetEndsAt" TIMESTAMP(3) NOT NULL,
  "pausedDurationMs" BIGINT NOT NULL DEFAULT 0,
  "endedAt" TIMESTAMP(3),
  "elapsedMs" BIGINT,
  "status" "WorkoutResistanceRestStatus" NOT NULL DEFAULT 'active',
  CONSTRAINT "WorkoutSessionResistanceRest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkoutSessionResistanceRest_executionId_fkey"
    FOREIGN KEY ("executionId") REFERENCES "WorkoutSessionExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkoutSessionResistanceRest_afterPlannedSetId_fkey"
    FOREIGN KEY ("afterPlannedSetId") REFERENCES "WorkoutExercisePlannedSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkoutSessionResistanceRest_values_check" CHECK (
    "plannedSeconds" > 0 AND "extensionSeconds" >= 0 AND "pausedDurationMs" >= 0
    AND "targetEndsAt" >= "startedAt" AND
    (("status" = 'active' AND "endedAt" IS NULL AND "elapsedMs" IS NULL)
    OR ("status" <> 'active' AND "endedAt" IS NOT NULL AND "elapsedMs" >= 0))
  )
);
CREATE UNIQUE INDEX "WorkoutSessionResistanceRest_executionId_afterPlannedSetId_key"
  ON "WorkoutSessionResistanceRest"("executionId", "afterPlannedSetId");
CREATE INDEX "WorkoutSessionResistanceRest_executionId_status_idx"
  ON "WorkoutSessionResistanceRest"("executionId", "status");
CREATE UNIQUE INDEX "WorkoutSessionResistanceRest_one_active_per_execution"
  ON "WorkoutSessionResistanceRest"("executionId") WHERE "status" = 'active';

-- A direct SQL write may not link a rest to a different session or
-- uncompleted planned set. Identity and original prescription are immutable.
CREATE OR REPLACE FUNCTION "issue488_guard_rest_identity"() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."executionId" IS DISTINCT FROM OLD."executionId"
    OR NEW."afterPlannedSetId" IS DISTINCT FROM OLD."afterPlannedSetId"
    OR NEW."plannedSeconds" IS DISTINCT FROM OLD."plannedSeconds"
    OR NEW."startedAt" IS DISTINCT FROM OLD."startedAt"
    OR OLD."status" <> 'active'
  ) THEN
    RAISE EXCEPTION 'rest history and planned identity are immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM "WorkoutSessionExecution" execution
    JOIN "WorkoutSessionExecutionItem" item
      ON item."executionId" = execution."id"
      AND item."plannedSetId" = NEW."afterPlannedSetId"
      AND item."completedAt" IS NOT NULL
    JOIN "WorkoutExercisePlannedSet" planned ON planned."id" = item."plannedSetId"
    JOIN "WorkoutExerciseBlock" block ON block."id" = planned."blockId"
    JOIN "WorkoutExercise" exercise ON exercise."id" = block."workoutExerciseId"
    WHERE execution."id" = NEW."executionId"
      AND exercise."workoutDayId" = execution."workoutDayId"
  ) THEN
    RAISE EXCEPTION 'rest requires a completed planned set in this execution' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "issue488_guard_rest_identity_trigger"
  BEFORE INSERT OR UPDATE ON "WorkoutSessionResistanceRest"
  FOR EACH ROW EXECUTE FUNCTION "issue488_guard_rest_identity"();
