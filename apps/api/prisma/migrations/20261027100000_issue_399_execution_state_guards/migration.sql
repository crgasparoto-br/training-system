-- Issue #399 / AUD-399-32/33: terminal execution history and the execution
-- root are immutable and state-complete even when written through direct SQL.
-- This migration is additive; previously published migrations remain unchanged.

CREATE OR REPLACE FUNCTION "issue399_validate_execution_graph"()
RETURNS TRIGGER AS $$
DECLARE
  graph_template_id TEXT;
  graph_plan_id TEXT;
  graph_aluno_id TEXT;
  graph_contract_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'not_started'
      OR EXISTS (SELECT 1 FROM "WorkoutSessionExecutionItem" i WHERE i."executionId" = OLD."id")
      OR EXISTS (SELECT 1 FROM "WorkoutSessionExecutionOperation" o WHERE o."executionId" = OLD."id") THEN
      RAISE EXCEPTION 'started workout execution is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  -- A root execution is created only as the canonical not_started shell. The
  -- service then records the operation while the shell is non-terminal and
  -- performs the state transition in the same serializable transaction.
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'not_started'
      OR NEW."version" <> 0
      OR NEW."startedAt" IS NOT NULL
      OR NEW."finishedAt" IS NOT NULL
      OR NEW."currentPauseStartedAt" IS NOT NULL
      OR NEW."interruptionReason" IS NOT NULL
      OR NEW."pausedDurationMs" <> 0 THEN
      RAISE EXCEPTION 'new workout execution must start as not_started' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW."version" <> OLD."version" + 1
      OR NEW."pausedDurationMs" < 0 THEN
      RAISE EXCEPTION 'workout execution version or pause duration is invalid' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Discriminant checks keep each visible state complete. They deliberately
  -- reject a status-only SQL update with missing lifecycle timestamps/reason.
  IF NEW."status" = 'not_started' THEN
    IF NEW."startedAt" IS NOT NULL
      OR NEW."finishedAt" IS NOT NULL
      OR NEW."currentPauseStartedAt" IS NOT NULL
      OR NEW."interruptionReason" IS NOT NULL THEN
      RAISE EXCEPTION 'not_started workout execution has lifecycle fields' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."status" = 'in_progress' THEN
    IF NEW."startedAt" IS NULL
      OR NEW."finishedAt" IS NOT NULL
      OR NEW."currentPauseStartedAt" IS NOT NULL
      OR NEW."interruptionReason" IS NOT NULL THEN
      RAISE EXCEPTION 'in_progress workout execution has incomplete lifecycle fields' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."status" = 'paused' THEN
    IF NEW."startedAt" IS NULL
      OR NEW."finishedAt" IS NOT NULL
      OR NEW."currentPauseStartedAt" IS NULL
      OR NEW."interruptionReason" IS NOT NULL THEN
      RAISE EXCEPTION 'paused workout execution has incomplete lifecycle fields' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."status" = 'completed' THEN
    IF NEW."startedAt" IS NULL
      OR NEW."finishedAt" IS NULL
      OR NEW."currentPauseStartedAt" IS NOT NULL
      OR NEW."interruptionReason" IS NOT NULL THEN
      RAISE EXCEPTION 'completed workout execution has incomplete lifecycle fields' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."status" = 'partial' THEN
    IF NEW."startedAt" IS NULL
      OR NEW."finishedAt" IS NULL
      OR NEW."currentPauseStartedAt" IS NOT NULL
      OR NULLIF(BTRIM(NEW."interruptionReason"), '') IS NULL THEN
      RAISE EXCEPTION 'partial workout execution has incomplete lifecycle fields' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."status" = 'not_performed' THEN
    IF NEW."finishedAt" IS NULL
      OR NEW."currentPauseStartedAt" IS NOT NULL
      OR NULLIF(BTRIM(NEW."interruptionReason"), '') IS NULL THEN
      RAISE EXCEPTION 'not_performed workout execution has incomplete lifecycle fields' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown workout execution status' USING ERRCODE = '23514';
  END IF;

  SELECT d."templateId", t."planId", p."alunoId", a."contractId"
    INTO graph_template_id, graph_plan_id, graph_aluno_id, graph_contract_id
  FROM "WorkoutDay" d
  JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
  JOIN "TrainingPlan" p ON p."id" = t."planId"
  JOIN "Aluno" a ON a."id" = p."alunoId"
  WHERE d."id" = NEW."workoutDayId"
  FOR UPDATE OF d;

  IF graph_template_id IS NULL
    OR NEW."alunoId" <> graph_aluno_id
    OR NEW."contractId" <> graph_contract_id
    OR NEW."originWorkoutTemplateId" <> graph_template_id
    OR NEW."originTrainingPlanId" <> graph_plan_id THEN
    RAISE EXCEPTION 'execution graph ownership or origin does not match planned day' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "ConsolidatedPrescriptionOperationalRelease" rel
    WHERE rel."id" = NEW."originReleaseId"
      AND rel."workoutTemplateId" = graph_template_id
      AND rel."trainingPlanId" = graph_plan_id
      AND rel."alunoId" = graph_aluno_id
      AND rel."contractId" = graph_contract_id
  ) THEN
    RAISE EXCEPTION 'execution release does not match planned graph' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."workoutDayId" <> NEW."workoutDayId"
      OR OLD."alunoId" <> NEW."alunoId"
      OR OLD."contractId" <> NEW."contractId"
      OR OLD."originReleaseId" <> NEW."originReleaseId"
      OR OLD."originWorkoutTemplateId" <> NEW."originWorkoutTemplateId"
      OR OLD."originTrainingPlanId" <> NEW."originTrainingPlanId" THEN
      RAISE EXCEPTION 'execution identity and origin are immutable' USING ERRCODE = '23514';
    END IF;

    IF (OLD."status" = 'not_started' AND NEW."status" NOT IN ('not_started', 'in_progress', 'not_performed'))
      OR (OLD."status" = 'in_progress' AND NEW."status" NOT IN ('in_progress', 'paused', 'completed', 'partial'))
      OR (OLD."status" = 'paused' AND NEW."status" NOT IN ('paused', 'in_progress', 'partial'))
      OR (OLD."status" IN ('completed', 'partial', 'not_performed') AND NEW."status" <> OLD."status") THEN
      RAISE EXCEPTION 'invalid workout execution status transition' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "issue399_execution_graph_integrity" ON "WorkoutSessionExecution";
CREATE TRIGGER "issue399_execution_graph_integrity"
BEFORE INSERT OR UPDATE OR DELETE
ON "WorkoutSessionExecution"
FOR EACH ROW EXECUTE FUNCTION "issue399_validate_execution_graph"();

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

DROP TRIGGER IF EXISTS "issue399_terminal_execution_operation_guard" ON "WorkoutSessionExecutionOperation";
CREATE TRIGGER "issue399_terminal_execution_operation_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutSessionExecutionOperation"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_terminal_execution_child"();

DROP TRIGGER IF EXISTS "issue399_terminal_execution_pause_guard" ON "WorkoutSessionPauseInterval";
CREATE TRIGGER "issue399_terminal_execution_pause_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutSessionPauseInterval"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_terminal_execution_child"();

DROP TRIGGER IF EXISTS "issue399_terminal_execution_item_guard" ON "WorkoutSessionExecutionItem";
CREATE TRIGGER "issue399_terminal_execution_item_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutSessionExecutionItem"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_terminal_execution_child"();
