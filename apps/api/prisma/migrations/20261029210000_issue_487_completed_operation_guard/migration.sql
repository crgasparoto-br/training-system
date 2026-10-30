-- #487 / RISK-487-02: an operation referenced by a confirmed set is immutable,
-- even if the execution remains in_progress. Preserve the one canonical
-- lifecycleEventId null -> non-null link performed by the #389 transaction.
CREATE OR REPLACE FUNCTION "issue487_guard_completed_operation"()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "WorkoutSessionExecutionItem" item
    WHERE item."completedByOperationId" = OLD."id"
      AND item."completedAt" IS NOT NULL
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'completed guided operation is immutable' USING ERRCODE = '23514';
    END IF;
    IF NOT (
      OLD."lifecycleEventId" IS NULL
      AND NEW."lifecycleEventId" IS NOT NULL
      AND (to_jsonb(NEW) - 'lifecycleEventId')
        IS NOT DISTINCT FROM (to_jsonb(OLD) - 'lifecycleEventId')
    ) THEN
      RAISE EXCEPTION 'completed guided operation is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "issue487_guard_completed_operation_trigger"
BEFORE UPDATE OR DELETE ON "WorkoutSessionExecutionOperation"
FOR EACH ROW EXECUTE FUNCTION "issue487_guard_completed_operation"();
