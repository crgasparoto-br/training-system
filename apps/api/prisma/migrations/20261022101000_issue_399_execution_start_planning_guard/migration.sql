-- Issue #399 / AUD-399-18: the database must enforce the same planning
-- immutability as the service when a session has started, even for draft
-- templates that were never published.

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

  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
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

DROP TRIGGER IF EXISTS "issue399_execution_start_template_guard" ON "WorkoutTemplate";
CREATE TRIGGER "issue399_execution_start_template_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutTemplate"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_planning_after_execution_start"();

DROP TRIGGER IF EXISTS "issue399_execution_start_day_guard" ON "WorkoutDay";
CREATE TRIGGER "issue399_execution_start_day_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutDay"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_planning_after_execution_start"();

DROP TRIGGER IF EXISTS "issue399_execution_start_exercise_guard" ON "WorkoutExercise";
CREATE TRIGGER "issue399_execution_start_exercise_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutExercise"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_planning_after_execution_start"();
