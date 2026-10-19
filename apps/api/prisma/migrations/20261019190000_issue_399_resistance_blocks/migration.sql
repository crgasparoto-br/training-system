-- #399: additive planned resistance structure, without backfill or invented defaults.
CREATE TABLE "WorkoutExerciseBlock" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workoutExerciseId" TEXT NOT NULL REFERENCES "WorkoutExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "position" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkoutExerciseBlock_position_check" CHECK ("position" > 0),
  CONSTRAINT "WorkoutExerciseBlock_kind_check" CHECK ("kind" IN ('aquecimento','principal','tecnica','complementar','finalizacao'))
);
CREATE UNIQUE INDEX "WorkoutExerciseBlock_workoutExerciseId_position_key" ON "WorkoutExerciseBlock"("workoutExerciseId","position");

CREATE TABLE "WorkoutExercisePlannedSet" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "blockId" TEXT NOT NULL REFERENCES "WorkoutExerciseBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "position" INTEGER NOT NULL,
  "repsMin" INTEGER,
  "repsMax" INTEGER,
  "loadKg" DOUBLE PRECISION,
  "loadPercent" DOUBLE PRECISION,
  "rir" DOUBLE PRECISION,
  "rpe" DOUBLE PRECISION,
  "tempo" TEXT,
  "restSec" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkoutExercisePlannedSet_position_check" CHECK ("position" > 0),
  CONSTRAINT "WorkoutExercisePlannedSet_reps_check" CHECK (("repsMin" IS NULL OR "repsMin" >= 0) AND ("repsMax" IS NULL OR "repsMax" >= 0) AND ("repsMin" IS NULL OR "repsMax" IS NULL OR "repsMin" <= "repsMax")),
  CONSTRAINT "WorkoutExercisePlannedSet_load_check" CHECK (("loadKg" IS NULL OR ("loadKg" >= 0 AND "loadKg" <= 99999)) AND ("loadPercent" IS NULL OR ("loadPercent" >= 0 AND "loadPercent" <= 999))),
  CONSTRAINT "WorkoutExercisePlannedSet_effort_check" CHECK (("rir" IS NULL OR ("rir" >= 0 AND "rir" <= 10)) AND ("rpe" IS NULL OR ("rpe" >= 0 AND "rpe" <= 10))),
  CONSTRAINT "WorkoutExercisePlannedSet_rest_check" CHECK ("restSec" IS NULL OR ("restSec" >= 0 AND "restSec" <= 86400))
);
CREATE UNIQUE INDEX "WorkoutExercisePlannedSet_blockId_position_key" ON "WorkoutExercisePlannedSet"("blockId","position");

ALTER TABLE "WorkoutSessionExecutionItem" ADD COLUMN "plannedSetId" TEXT;
ALTER TABLE "WorkoutSessionExecutionItem"
  ADD CONSTRAINT "WorkoutSessionExecutionItem_plannedSetId_fkey"
  FOREIGN KEY ("plannedSetId") REFERENCES "WorkoutExercisePlannedSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "WorkoutSessionExecutionItem_plannedSetId_idx" ON "WorkoutSessionExecutionItem"("plannedSetId");

CREATE FUNCTION "issue399_match_execution_set"() RETURNS trigger AS $$
BEGIN
  IF NEW."plannedSetId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "WorkoutExercisePlannedSet" s
    JOIN "WorkoutExerciseBlock" b ON b."id" = s."blockId"
    WHERE s."id" = NEW."plannedSetId" AND b."workoutExerciseId" = NEW."plannedUnitId"
  ) THEN
    RAISE EXCEPTION 'planned set does not belong to planned exercise' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "issue399_match_execution_set_trigger"
BEFORE INSERT OR UPDATE OF "plannedSetId", "plannedUnitId" ON "WorkoutSessionExecutionItem"
FOR EACH ROW EXECUTE FUNCTION "issue399_match_execution_set"();

CREATE FUNCTION "issue399_guard_planned_structure"() RETURNS trigger AS $$
DECLARE exercise_id TEXT;
DECLARE block_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'WorkoutExerciseBlock' THEN
    IF TG_OP = 'DELETE' THEN exercise_id := OLD."workoutExerciseId";
    ELSE exercise_id := NEW."workoutExerciseId"; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN block_id := OLD."blockId";
    ELSE block_id := NEW."blockId"; END IF;
    SELECT b."workoutExerciseId" INTO exercise_id FROM "WorkoutExerciseBlock" b WHERE b."id" = block_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "WorkoutExercise" e
    JOIN "WorkoutDay" d ON d."id" = e."workoutDayId"
    JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
    LEFT JOIN "WorkoutSessionExecution" x ON x."workoutDayId" = d."id"
    WHERE e."id" = exercise_id AND (
      t."released"
      OR (x."id" IS NOT NULL AND x."status" <> 'not_started')
      OR EXISTS (SELECT 1 FROM "WorkoutExecution" legacy WHERE legacy."workoutExerciseId" = e."id")
    )
  ) THEN
    RAISE EXCEPTION 'planned resistance structure is frozen' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "issue399_freeze_blocks"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutExerciseBlock"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_planned_structure"();
CREATE TRIGGER "issue399_freeze_sets"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutExercisePlannedSet"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_planned_structure"();
