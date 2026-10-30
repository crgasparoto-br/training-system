-- #487 / A-487-API-001: canonical ordinal is the persisted rank across blocks.
-- Historic drafts are not rewritten blindly; the API repairs only safe drafts.
CREATE OR REPLACE FUNCTION "issue487_check_execution_set_ordinal"()
RETURNS TRIGGER AS $$
DECLARE
  expected_ordinal BIGINT;
BEGIN
  IF NEW."plannedSetId" IS NULL THEN RETURN NEW; END IF;
  SELECT ordered.ordinal INTO expected_ordinal
  FROM (
    SELECT s."id", b."workoutExerciseId",
      row_number() OVER (
        PARTITION BY b."workoutExerciseId"
        ORDER BY b."position", s."position", s."id"
      ) AS ordinal
    FROM "WorkoutExercisePlannedSet" s
    JOIN "WorkoutExerciseBlock" b ON b."id" = s."blockId"
    WHERE b."workoutExerciseId" = NEW."plannedUnitId"
  ) ordered
  WHERE ordered."id" = NEW."plannedSetId";
  IF expected_ordinal IS NULL OR expected_ordinal <> NEW."setNumber" THEN
    RAISE EXCEPTION 'planned set ordinal does not match its canonical workout order'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "issue487_check_execution_set_ordinal_trigger"
BEFORE INSERT OR UPDATE OF "executionId", "plannedUnitId", "plannedSetId", "setNumber"
ON "WorkoutSessionExecutionItem"
FOR EACH ROW EXECUTE FUNCTION "issue487_check_execution_set_ordinal"();

-- #487 / A-487-DB-002: reject orphan/foreign lifecycle events, not merely null IDs.
-- Validation intentionally fails closed if legacy references are corrupt.
ALTER TABLE "WorkoutSessionExecutionOperation"
  ADD CONSTRAINT "WorkoutSessionExecutionOperation_lifecycleEventId_fkey"
  FOREIGN KEY ("lifecycleEventId") REFERENCES "StudentLifecycleEvent"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "WorkoutSessionExecutionOperation"
  VALIDATE CONSTRAINT "WorkoutSessionExecutionOperation_lifecycleEventId_fkey";

CREATE OR REPLACE FUNCTION "issue487_require_completion_ledger"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."completedAt" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "WorkoutSessionExecution" execution
    JOIN "WorkoutSessionExecutionOperation" operation
      ON operation."id" = NEW."completedByOperationId"
      AND operation."executionId" = execution."id"
    JOIN "StudentLifecycleEvent" event
      ON event."id" = operation."lifecycleEventId"
      AND event."alunoId" = execution."alunoId"
      AND event."contractId" = execution."contractId"
      AND event."eventType" = 'STATUS_CHANGED'
      AND event."metadata"->>'domain' = 'workout_session_execution'
      AND event."metadata"->>'action' = 'complete_resistance_set'
      AND event."metadata"->>'workoutDayId' = execution."workoutDayId"
      AND event."metadata"->>'executionId' = execution."id"
      AND event."metadata"->>'operationId' = operation."id"
      AND event."metadata"->>'eventKey' =
        'workout-session-execution:' || execution."id" || ':' || operation."id"
      AND event."metadata"->>'previousVersion' = operation."expectedVersion"::TEXT
      AND event."metadata"->>'version' = operation."resultingVersion"::TEXT
      AND event."metadata"->>'previousStatus' = 'in_progress'
      AND event."metadata"->>'status' = 'in_progress'
    WHERE execution."id" = NEW."executionId"
      AND execution."status" = 'in_progress'
      AND operation."action" = 'complete_resistance_set'
      AND operation."resultingVersion" = execution."version"
      AND operation."expectedVersion" + 1 = operation."resultingVersion"
  ) THEN
    RAISE EXCEPTION 'guided completion requires its own verified lifecycle event'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Once used by a completed guided set, the event's identity and metadata
-- cannot be rewritten after the deferred check.
CREATE OR REPLACE FUNCTION "issue487_guard_linked_lifecycle_event"()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "WorkoutSessionExecutionOperation" operation
    JOIN "WorkoutSessionExecutionItem" item
      ON item."completedByOperationId" = operation."id"
      AND item."completedAt" IS NOT NULL
    WHERE operation."lifecycleEventId" = OLD."id"
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'completed guided lifecycle event is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW."alunoId" IS DISTINCT FROM OLD."alunoId"
      OR NEW."contractId" IS DISTINCT FROM OLD."contractId"
      OR NEW."eventType" IS DISTINCT FROM OLD."eventType"
      OR NEW."metadata" IS DISTINCT FROM OLD."metadata" THEN
      RAISE EXCEPTION 'completed guided lifecycle event is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "issue487_guard_linked_lifecycle_event_trigger"
BEFORE UPDATE OR DELETE ON "StudentLifecycleEvent"
FOR EACH ROW EXECUTE FUNCTION "issue487_guard_linked_lifecycle_event"();
