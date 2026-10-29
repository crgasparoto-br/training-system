-- #487: each completed planned set is bound to ONE canonical operation.
-- A raw value remains a draft until a completion timestamp and operation exist.
ALTER TABLE "WorkoutSessionExecutionItem"
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completedByOperationId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "WorkoutSessionExecutionItem_completedByOperationId_key"
  ON "WorkoutSessionExecutionItem"("completedByOperationId");

CREATE UNIQUE INDEX IF NOT EXISTS "WorkoutSessionExecutionItem_plannedSet_unique"
  ON "WorkoutSessionExecutionItem"("executionId", "plannedSetId")
  WHERE "plannedSetId" IS NOT NULL AND "completedAt" IS NOT NULL;

ALTER TABLE "WorkoutSessionExecutionItem"
  ADD CONSTRAINT "WorkoutSessionExecutionItem_completedByOperationId_fkey"
  FOREIGN KEY ("completedByOperationId")
  REFERENCES "WorkoutSessionExecutionOperation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "issue487_guard_completed_set"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."completedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'completed guided set is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."completedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'completed guided set is immutable' USING ERRCODE = '23514';
  END IF;

  IF (NEW."completedAt" IS NULL) <> (NEW."completedByOperationId" IS NULL) THEN
    RAISE EXCEPTION 'guided completion marker requires its operation' USING ERRCODE = '23514';
  END IF;
  IF NEW."completedAt" IS NOT NULL THEN
    IF NEW."plannedSetId" IS NULL OR NOT EXISTS (
      SELECT 1 FROM "WorkoutSessionExecution" execution
      JOIN "WorkoutSessionExecutionOperation" operation
        ON operation."executionId" = execution."id"
      WHERE execution."id" = NEW."executionId"
        AND execution."status" = 'in_progress'
        AND operation."id" = NEW."completedByOperationId"
        AND operation."action" = 'complete_resistance_set'
    ) THEN
      RAISE EXCEPTION 'completed guided set requires its active canonical operation' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "issue487_guard_completed_set_trigger"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutSessionExecutionItem"
FOR EACH ROW EXECUTE FUNCTION "issue487_guard_completed_set"();

-- The operation, resulting version and derived lifecycle event must all belong
-- to this exact set, not merely another completed set from the same session.
CREATE OR REPLACE FUNCTION "issue487_require_completion_ledger"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."completedAt" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "WorkoutSessionExecution" execution
    JOIN "WorkoutSessionExecutionOperation" operation
      ON operation."id" = NEW."completedByOperationId"
      AND operation."executionId" = execution."id"
    WHERE execution."id" = NEW."executionId"
      AND execution."status" = 'in_progress'
      AND operation."action" = 'complete_resistance_set'
      AND operation."resultingVersion" = execution."version"
      AND operation."lifecycleEventId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'guided completion requires its own canonical execution operation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "issue487_require_completion_ledger_trigger"
AFTER INSERT OR UPDATE ON "WorkoutSessionExecutionItem"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW WHEN (NEW."completedAt" IS NOT NULL)
EXECUTE FUNCTION "issue487_require_completion_ledger"();
