-- Issue #399 / AUD-399-F2: terminal execution history is immutable through
-- every direct-SQL child table, not only through the public service.

CREATE OR REPLACE FUNCTION "issue399_guard_terminal_execution_row"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" IN ('completed', 'partial', 'not_performed') THEN
      RAISE EXCEPTION 'terminal workout execution is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" IN ('completed', 'partial', 'not_performed')
    AND (to_jsonb(NEW) - 'updatedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'updatedAt') THEN
    RAISE EXCEPTION 'terminal workout execution is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "issue399_guard_terminal_execution_child"()
RETURNS TRIGGER AS $$
DECLARE
  execution_status TEXT;
  execution_id TEXT;
BEGIN
  execution_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."executionId" ELSE NEW."executionId" END;
  SELECT e."status"::TEXT INTO execution_status
  FROM "WorkoutSessionExecution" e
  WHERE e."id" = execution_id
  FOR UPDATE;

  IF execution_status IN ('completed', 'partial', 'not_performed')
    AND NOT (
      TG_TABLE_NAME = 'WorkoutSessionExecutionOperation'
      AND TG_OP = 'UPDATE'
      AND (to_jsonb(OLD)->>'lifecycleEventId') IS NULL
      AND (to_jsonb(NEW)->>'lifecycleEventId') IS NOT NULL
      AND (to_jsonb(NEW) - 'updatedAt' - 'lifecycleEventId')
        IS NOT DISTINCT FROM
        (to_jsonb(OLD) - 'updatedAt' - 'lifecycleEventId')
    ) THEN
    RAISE EXCEPTION 'terminal workout execution history is immutable' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "issue399_terminal_execution_row_guard" ON "WorkoutSessionExecution";
CREATE TRIGGER "issue399_terminal_execution_row_guard"
BEFORE UPDATE OR DELETE ON "WorkoutSessionExecution"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_terminal_execution_row"();

DROP TRIGGER IF EXISTS "issue399_terminal_execution_operation_guard" ON "WorkoutSessionExecutionOperation";
CREATE TRIGGER "issue399_terminal_execution_operation_guard"
BEFORE UPDATE OR DELETE ON "WorkoutSessionExecutionOperation"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_terminal_execution_child"();

DROP TRIGGER IF EXISTS "issue399_terminal_execution_pause_guard" ON "WorkoutSessionPauseInterval";
CREATE TRIGGER "issue399_terminal_execution_pause_guard"
BEFORE UPDATE OR DELETE ON "WorkoutSessionPauseInterval"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_terminal_execution_child"();

DROP TRIGGER IF EXISTS "issue399_terminal_execution_item_guard" ON "WorkoutSessionExecutionItem";
CREATE TRIGGER "issue399_terminal_execution_item_guard"
BEFORE UPDATE OR DELETE ON "WorkoutSessionExecutionItem"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_terminal_execution_child"();
