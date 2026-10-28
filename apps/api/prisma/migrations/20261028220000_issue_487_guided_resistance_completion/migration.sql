-- Issue #487: a guided set is completed only when the canonical execution
-- transaction records a durable marker. Existing raw value writes remain drafts.
ALTER TABLE "WorkoutSessionExecutionItem"
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkoutSessionExecutionItem_plannedSet_unique"
  ON "WorkoutSessionExecutionItem" ("executionId", "plannedSetId")
  WHERE "plannedSetId" IS NOT NULL AND "completedAt" IS NOT NULL;

CREATE OR REPLACE FUNCTION "issue487_guard_completed_set"()
RETURNS trigger AS $$
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

  IF NEW."completedAt" IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM "WorkoutSessionExecution" execution
      WHERE execution."id" = NEW."executionId" AND execution."status" = 'in_progress'
    ) OR NEW."plannedSetId" IS NULL THEN
      RAISE EXCEPTION 'completed guided set requires active execution and planned set' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "issue487_guard_completed_set_trigger"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutSessionExecutionItem"
FOR EACH ROW EXECUTE FUNCTION "issue487_guard_completed_set"();

-- A direct SQL write must not move the cursor without the canonical operation,
-- resulting version and derived event. Deferred evaluation sees the final state.
CREATE OR REPLACE FUNCTION "issue487_require_completion_ledger"()
RETURNS trigger AS $$
BEGIN
  IF NEW."completedAt" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "WorkoutSessionExecution" execution
    JOIN "WorkoutSessionExecutionOperation" operation
      ON operation."executionId" = execution."id"
    WHERE execution."id" = NEW."executionId"
      AND execution."status" = 'in_progress'
      AND operation."action" = 'complete_resistance_set'
      AND operation."resultingVersion" = execution."version"
      AND operation."lifecycleEventId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'guided completion requires canonical execution operation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "issue487_require_completion_ledger_trigger"
AFTER INSERT OR UPDATE ON "WorkoutSessionExecutionItem"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW WHEN (NEW."completedAt" IS NOT NULL)
EXECUTE FUNCTION "issue487_require_completion_ledger"();
