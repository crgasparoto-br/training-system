-- Issue #399 / independent audit remediation:
-- serialize planning mutations with execution start and protect the
-- canonical execution ledger from direct SQL deletion/reparenting.

CREATE OR REPLACE FUNCTION "issue399_lock_template_days"(p_template_id TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM d."id"
  FROM "WorkoutDay" d
  WHERE d."templateId" = p_template_id
  ORDER BY d."id"
  FOR UPDATE;
END;
$$ LANGUAGE plpgsql VOLATILE;

CREATE OR REPLACE FUNCTION "issue399_lock_day"(p_day_id TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM d."id"
  FROM "WorkoutDay" d
  WHERE d."id" = p_day_id
  FOR UPDATE;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- The previous migration installed the correct table-specific functions but
-- checked the graph without taking the same canonical-day lock used by the
-- execution-start trigger. Redefine the final functions so a planning write
-- cannot observe "no execution" while a concurrent start is committing.
CREATE OR REPLACE FUNCTION "issue399_guard_template_legacy_execution_lock"()
RETURNS TRIGGER AS $$
DECLARE
  old_locked BOOLEAN := FALSE;
  new_locked BOOLEAN := FALSE;
  planning_changed BOOLEAN := FALSE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM "issue399_lock_template_days"(OLD."id");
    old_locked := "issue399_template_has_any_execution"(OLD."id");
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
      PERFORM "issue399_lock_template_days"(NEW."id");
    END IF;
    new_locked := "issue399_template_has_any_execution"(NEW."id");
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
    IF old_locked OR new_locked THEN
      RAISE EXCEPTION 'workout planning is immutable after execution history' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  planning_changed := (to_jsonb(NEW) - 'updatedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'updatedAt');
  IF (old_locked OR new_locked) AND planning_changed THEN
    RAISE EXCEPTION 'workout planning is immutable after execution history' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "issue399_guard_day_legacy_execution_lock"()
RETURNS TRIGGER AS $$
DECLARE
  old_locked BOOLEAN := FALSE;
  new_locked BOOLEAN := FALSE;
  planning_changed BOOLEAN := FALSE;
  old_template_id TEXT;
  new_template_id TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_template_id := OLD."templateId";
    PERFORM "issue399_lock_template_days"(old_template_id);
    old_locked := "issue399_day_has_any_execution"(OLD."id");
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_template_id := NEW."templateId";
    IF new_template_id IS NOT NULL
      AND new_template_id IS DISTINCT FROM old_template_id THEN
      PERFORM "issue399_lock_template_days"(new_template_id);
    END IF;
    new_locked := "issue399_day_has_any_execution"(NEW."id");
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
    IF old_locked OR new_locked THEN
      RAISE EXCEPTION 'workout planning is immutable after execution history' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  planning_changed := (to_jsonb(NEW) - 'updatedAt' - 'status' - 'startedAt' - 'finishedAt' - 'psrResponse' - 'pseResponse')
    IS DISTINCT FROM
    (to_jsonb(OLD) - 'updatedAt' - 'status' - 'startedAt' - 'finishedAt' - 'psrResponse' - 'pseResponse');
  IF (old_locked OR new_locked) AND planning_changed THEN
    RAISE EXCEPTION 'workout planning is immutable after execution history' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "issue399_guard_exercise_legacy_execution_lock"()
RETURNS TRIGGER AS $$
DECLARE
  old_locked BOOLEAN := FALSE;
  new_locked BOOLEAN := FALSE;
  planning_changed BOOLEAN := FALSE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM "issue399_lock_day"(OLD."workoutDayId");
    old_locked := "issue399_day_has_any_execution"(OLD."workoutDayId")
      OR "issue399_exercise_has_any_execution"(OLD."id");
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM "issue399_lock_day"(NEW."workoutDayId");
    ELSIF NEW."workoutDayId" IS DISTINCT FROM OLD."workoutDayId" THEN
      PERFORM "issue399_lock_day"(NEW."workoutDayId");
    END IF;
    new_locked := "issue399_day_has_any_execution"(NEW."workoutDayId")
      OR "issue399_exercise_has_any_execution"(NEW."id");
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
    IF old_locked OR new_locked THEN
      RAISE EXCEPTION 'workout planning is immutable after execution history' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  planning_changed := (to_jsonb(NEW) - 'updatedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'updatedAt');
  IF (old_locked OR new_locked) AND planning_changed THEN
    RAISE EXCEPTION 'workout planning is immutable after execution history' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- WorkoutExecution is also an execution-start boundary. Lock its canonical
-- day before validating ownership so it participates in the same ordering.
CREATE OR REPLACE FUNCTION "issue399_guard_legacy_execution_row"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'legacy workout execution history is immutable' USING ERRCODE = '23514';
  END IF;

  PERFORM d."id"
  FROM "WorkoutDay" d
  JOIN "WorkoutExercise" e ON e."workoutDayId" = d."id"
  WHERE e."id" = NEW."workoutExerciseId"
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1
    FROM "WorkoutExercise" e
    JOIN "WorkoutDay" d ON d."id" = e."workoutDayId"
    JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
    JOIN "TrainingPlan" p ON p."id" = t."planId"
    WHERE e."id" = NEW."workoutExerciseId"
      AND p."alunoId" = NEW."alunoId"
  ) THEN
    RAISE EXCEPTION 'legacy workout execution crosses ownership boundary' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Actual execution measurements may be updated while a session is running,
-- but their canonical identity and planned reference cannot be moved. A
-- started item can never be deleted, including by direct SQL.
CREATE OR REPLACE FUNCTION "issue399_guard_execution_item_immutability"()
RETURNS TRIGGER AS $$
DECLARE
  old_status TEXT;
  new_status TEXT;
BEGIN
  SELECT e."status"::TEXT INTO old_status
  FROM "WorkoutSessionExecution" e
  WHERE e."id" = OLD."executionId"
  FOR UPDATE;

  IF TG_OP = 'DELETE' THEN
    IF old_status IS DISTINCT FROM 'not_started' THEN
      RAISE EXCEPTION 'started workout execution ledger is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."executionId" IS DISTINCT FROM OLD."executionId" THEN
    SELECT e."status"::TEXT INTO new_status
    FROM "WorkoutSessionExecution" e
    WHERE e."id" = NEW."executionId"
    FOR UPDATE;
  END IF;

  IF old_status IS DISTINCT FROM 'not_started'
    AND (NEW."executionId" IS DISTINCT FROM OLD."executionId"
      OR NEW."plannedUnitId" IS DISTINCT FROM OLD."plannedUnitId"
      OR NEW."plannedSetId" IS DISTINCT FROM OLD."plannedSetId"
      OR NEW."setNumber" IS DISTINCT FROM OLD."setNumber") THEN
    RAISE EXCEPTION 'started workout execution ledger identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW."executionId" IS DISTINCT FROM OLD."executionId" AND new_status IS DISTINCT FROM 'not_started' THEN
    RAISE EXCEPTION 'started workout execution ledger identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "issue399_execution_item_immutability" ON "WorkoutSessionExecutionItem";
CREATE TRIGGER "issue399_execution_item_immutability"
BEFORE UPDATE OR DELETE ON "WorkoutSessionExecutionItem"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_execution_item_immutability"();

DROP TRIGGER IF EXISTS "issue399_execution_start_template_guard" ON "WorkoutTemplate";
CREATE TRIGGER "issue399_execution_start_template_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutTemplate"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_template_legacy_execution_lock"();

DROP TRIGGER IF EXISTS "issue399_execution_start_day_guard" ON "WorkoutDay";
CREATE TRIGGER "issue399_execution_start_day_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutDay"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_day_legacy_execution_lock"();

DROP TRIGGER IF EXISTS "issue399_execution_start_exercise_guard" ON "WorkoutExercise";
CREATE TRIGGER "issue399_execution_start_exercise_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutExercise"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_exercise_legacy_execution_lock"();

DROP TRIGGER IF EXISTS "issue399_legacy_execution_row_guard" ON "WorkoutExecution";
CREATE TRIGGER "issue399_legacy_execution_row_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutExecution"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_legacy_execution_row"();
