-- Issue #399 / AUD-399-17/18: the legacy WorkoutExecution surface must obey
-- the same ownership, release and planning immutability rules as the canonical
-- WorkoutSessionExecution graph. Keep trigger functions table-specific so no
-- heterogeneous NEW/OLD record field can be evaluated on the wrong table.

CREATE OR REPLACE FUNCTION "issue399_template_has_any_execution"(template_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "WorkoutSessionExecution" x
    JOIN "WorkoutDay" d ON d."id" = x."workoutDayId"
    WHERE d."templateId" = template_id
      AND x."status" <> 'not_started'
  ) OR EXISTS (
    SELECT 1
    FROM "WorkoutExecution" x
    JOIN "WorkoutExercise" e ON e."id" = x."workoutExerciseId"
    JOIN "WorkoutDay" d ON d."id" = e."workoutDayId"
    WHERE d."templateId" = template_id
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION "issue399_day_has_any_execution"(day_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "WorkoutSessionExecution" x
    WHERE x."workoutDayId" = day_id
      AND x."status" <> 'not_started'
  ) OR EXISTS (
    SELECT 1
    FROM "WorkoutExecution" x
    JOIN "WorkoutExercise" e ON e."id" = x."workoutExerciseId"
    WHERE e."workoutDayId" = day_id
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION "issue399_exercise_has_any_execution"(exercise_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "WorkoutSessionExecutionItem" x
    WHERE x."plannedUnitId" = exercise_id
  ) OR EXISTS (
    SELECT 1
    FROM "WorkoutExecution" x
    WHERE x."workoutExerciseId" = exercise_id
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION "issue399_guard_template_legacy_execution_lock"()
RETURNS TRIGGER AS $$
DECLARE
  old_locked BOOLEAN := FALSE;
  new_locked BOOLEAN := FALSE;
  planning_changed BOOLEAN := FALSE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_locked := "issue399_template_has_any_execution"(OLD."id");
  END IF;
  IF TG_OP <> 'DELETE' THEN
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
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_locked := "issue399_day_has_any_execution"(OLD."id");
  END IF;
  IF TG_OP <> 'DELETE' THEN
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
    old_locked := "issue399_day_has_any_execution"(OLD."workoutDayId")
      OR "issue399_exercise_has_any_execution"(OLD."id");
  END IF;
  IF TG_OP <> 'DELETE' THEN
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

CREATE OR REPLACE FUNCTION "issue399_guard_legacy_execution_row"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'legacy workout execution history is immutable' USING ERRCODE = '23514';
  END IF;

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
