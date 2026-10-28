-- Issue #399 / AUD-399-17/18: close direct-SQL bypasses around the
-- execution graph and serialize execution start against planning mutations.

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
BEFORE INSERT OR UPDATE OF "workoutDayId", "alunoId", "contractId", "originReleaseId",
  "originWorkoutTemplateId", "originTrainingPlanId", "status" OR DELETE
ON "WorkoutSessionExecution"
FOR EACH ROW EXECUTE FUNCTION "issue399_validate_execution_graph"();

CREATE OR REPLACE FUNCTION "issue399_guard_canonical_parent_identity"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'WorkoutTemplate'
    AND TG_OP = 'UPDATE'
    AND NEW."planId" <> OLD."planId" THEN
    RAISE EXCEPTION 'workout template parent is immutable' USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'WorkoutDay'
    AND TG_OP = 'UPDATE'
    AND NEW."templateId" <> OLD."templateId" THEN
    RAISE EXCEPTION 'workout day parent is immutable' USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'WorkoutExercise'
    AND TG_OP = 'UPDATE'
    AND NEW."workoutDayId" <> OLD."workoutDayId" THEN
    RAISE EXCEPTION 'workout exercise parent is immutable' USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'WorkoutExercise' AND TG_OP <> 'DELETE' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM "WorkoutDay" d
      JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
      JOIN "TrainingPlan" p ON p."id" = t."planId"
      JOIN "Aluno" a ON a."id" = p."alunoId"
      JOIN "ExerciseLibrary" library ON library."id" = NEW."exerciseId"
      WHERE d."id" = NEW."workoutDayId"
        AND library."contractId" = a."contractId"
    ) THEN
      RAISE EXCEPTION 'workout exercise crosses contract ownership' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "issue399_template_parent_identity" ON "WorkoutTemplate";
CREATE TRIGGER "issue399_template_parent_identity"
BEFORE UPDATE OF "planId" ON "WorkoutTemplate"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_canonical_parent_identity"();

DROP TRIGGER IF EXISTS "issue399_day_parent_identity" ON "WorkoutDay";
CREATE TRIGGER "issue399_day_parent_identity"
BEFORE UPDATE OF "templateId" ON "WorkoutDay"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_canonical_parent_identity"();

DROP TRIGGER IF EXISTS "issue399_exercise_graph_identity" ON "WorkoutExercise";
CREATE TRIGGER "issue399_exercise_graph_identity"
BEFORE INSERT OR UPDATE OF "workoutDayId", "exerciseId"
ON "WorkoutExercise"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_canonical_parent_identity"();

-- Both planning and execution-start paths lock the canonical day before
-- inspecting status. This closes the READ COMMITTED race between the two.
CREATE OR REPLACE FUNCTION "issue399_guard_planning_after_execution_start"()
RETURNS TRIGGER AS $$
DECLARE
  old_locked BOOLEAN := FALSE;
  new_locked BOOLEAN := FALSE;
  planning_changed BOOLEAN := FALSE;
  old_template_id TEXT;
  new_template_id TEXT;
  old_day_id TEXT;
  new_day_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'WorkoutTemplate' THEN
    old_template_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD."id" ELSE NULL END;
    new_template_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW."id" ELSE NULL END;
  ELSIF TG_TABLE_NAME = 'WorkoutDay' THEN
    old_template_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD."templateId" ELSE NULL END;
    new_template_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW."templateId" ELSE NULL END;
  ELSE
    old_day_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD."workoutDayId" ELSE NULL END;
    new_day_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW."workoutDayId" ELSE NULL END;
  END IF;

  IF old_template_id IS NOT NULL THEN
    PERFORM d."id" FROM "WorkoutDay" d WHERE d."templateId" = old_template_id ORDER BY d."id" FOR UPDATE;
  END IF;
  IF new_template_id IS NOT NULL AND new_template_id IS DISTINCT FROM old_template_id THEN
    PERFORM d."id" FROM "WorkoutDay" d WHERE d."templateId" = new_template_id ORDER BY d."id" FOR UPDATE;
  END IF;
  IF old_day_id IS NOT NULL THEN
    PERFORM d."id" FROM "WorkoutDay" d WHERE d."id" = old_day_id FOR UPDATE;
  END IF;
  IF new_day_id IS NOT NULL AND new_day_id IS DISTINCT FROM old_day_id THEN
    PERFORM d."id" FROM "WorkoutDay" d WHERE d."id" = new_day_id FOR UPDATE;
  END IF;

  IF old_template_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM "WorkoutSessionExecution" x
      JOIN "WorkoutDay" d ON d."id" = x."workoutDayId"
      WHERE d."templateId" = old_template_id AND x."status" <> 'not_started'
    ) INTO old_locked;
  END IF;
  IF new_template_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM "WorkoutSessionExecution" x
      JOIN "WorkoutDay" d ON d."id" = x."workoutDayId"
      WHERE d."templateId" = new_template_id AND x."status" <> 'not_started'
    ) INTO new_locked;
  END IF;
  IF old_day_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM "WorkoutSessionExecution"
      WHERE "workoutDayId" = old_day_id AND "status" <> 'not_started'
    ) INTO old_locked;
  END IF;
  IF new_day_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM "WorkoutSessionExecution"
      WHERE "workoutDayId" = new_day_id AND "status" <> 'not_started'
    ) INTO new_locked;
  END IF;

  IF TG_OP IN ('INSERT', 'DELETE') THEN
    IF old_locked OR new_locked THEN
      RAISE EXCEPTION 'workout planning is immutable after execution start' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'WorkoutTemplate' THEN
    planning_changed := (to_jsonb(NEW) - 'updatedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'updatedAt');
  ELSIF TG_TABLE_NAME = 'WorkoutDay' THEN
    planning_changed := (to_jsonb(NEW) - 'updatedAt' - 'status' - 'startedAt' - 'finishedAt' - 'psrResponse' - 'pseResponse')
      IS DISTINCT FROM
      (to_jsonb(OLD) - 'updatedAt' - 'status' - 'startedAt' - 'finishedAt' - 'psrResponse' - 'pseResponse');
  ELSE
    planning_changed := (to_jsonb(NEW) - 'updatedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'updatedAt');
  END IF;

  IF (old_locked OR new_locked) AND planning_changed THEN
    RAISE EXCEPTION 'workout planning is immutable after execution start' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
