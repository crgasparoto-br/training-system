-- Issue #320 audit remediation A-003: once a WorkoutTemplate is linked to a
-- ConsolidatedPrescriptionOperationalRelease, its published planning content becomes
-- historical evidence. Legacy Workout Builder writers may continue to record execution
-- state on WorkoutDay, but they cannot rewrite the released plan in place.

CREATE OR REPLACE FUNCTION "guard_consolidated_released_workout_template"()
RETURNS TRIGGER AS $$
DECLARE
  linked_release BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM "ConsolidatedPrescriptionOperationalRelease" rel
    WHERE rel."workoutTemplateId" = OLD."id"
  ) INTO linked_release;

  IF NOT linked_release THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'consolidated released workout template is immutable' USING ERRCODE = '23514';
  END IF;

  IF (to_jsonb(NEW) - 'updatedAt' - 'released' - 'releasedAt')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'updatedAt' - 'released' - 'releasedAt') THEN
    RAISE EXCEPTION 'consolidated released workout template planning is immutable' USING ERRCODE = '23514';
  END IF;

  IF NEW."released" IS DISTINCT FROM OLD."released"
     OR NEW."releasedAt" IS DISTINCT FROM OLD."releasedAt" THEN
    -- The release transaction inserts the immutable ledger first and only then flips
    -- WorkoutTemplate.released/releasedAt. Permit exactly that one-way publication edge.
    IF NOT (
      OLD."released" = FALSE
      AND NEW."released" = TRUE
      AND OLD."releasedAt" IS NULL
      AND NEW."releasedAt" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'consolidated released workout publication metadata is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WorkoutTemplate_consolidated_release_immutable_guard"
BEFORE UPDATE OR DELETE ON "WorkoutTemplate"
FOR EACH ROW EXECUTE FUNCTION "guard_consolidated_released_workout_template"();

CREATE OR REPLACE FUNCTION "guard_consolidated_released_workout_day"()
RETURNS TRIGGER AS $$
DECLARE
  old_linked_release BOOLEAN := FALSE;
  new_linked_release BOOLEAN := FALSE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT EXISTS (
      SELECT 1
      FROM "ConsolidatedPrescriptionOperationalRelease" rel
      WHERE rel."workoutTemplateId" = OLD."templateId"
    ) INTO old_linked_release;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT EXISTS (
      SELECT 1
      FROM "ConsolidatedPrescriptionOperationalRelease" rel
      WHERE rel."workoutTemplateId" = NEW."templateId"
    ) INTO new_linked_release;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF new_linked_release THEN
      RAISE EXCEPTION 'consolidated released workout cannot receive new planning days' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF old_linked_release THEN
      RAISE EXCEPTION 'consolidated released workout day is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF old_linked_release OR new_linked_release THEN
    -- Execution lifecycle and subjective feedback remain mutable. Every other field is
    -- planning content and therefore belongs to the released historical snapshot.
    IF (to_jsonb(NEW) - 'updatedAt' - 'status' - 'startedAt' - 'finishedAt' - 'psrResponse' - 'pseResponse')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'updatedAt' - 'status' - 'startedAt' - 'finishedAt' - 'psrResponse' - 'pseResponse') THEN
      RAISE EXCEPTION 'consolidated released workout day planning is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WorkoutDay_consolidated_release_immutable_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutDay"
FOR EACH ROW EXECUTE FUNCTION "guard_consolidated_released_workout_day"();

CREATE OR REPLACE FUNCTION "guard_consolidated_released_workout_exercise"()
RETURNS TRIGGER AS $$
DECLARE
  old_linked_release BOOLEAN := FALSE;
  new_linked_release BOOLEAN := FALSE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT EXISTS (
      SELECT 1
      FROM "WorkoutDay" day
      JOIN "ConsolidatedPrescriptionOperationalRelease" rel
        ON rel."workoutTemplateId" = day."templateId"
      WHERE day."id" = OLD."workoutDayId"
    ) INTO old_linked_release;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT EXISTS (
      SELECT 1
      FROM "WorkoutDay" day
      JOIN "ConsolidatedPrescriptionOperationalRelease" rel
        ON rel."workoutTemplateId" = day."templateId"
      WHERE day."id" = NEW."workoutDayId"
    ) INTO new_linked_release;
  END IF;

  IF TG_OP = 'INSERT' AND new_linked_release THEN
    RAISE EXCEPTION 'consolidated released workout cannot receive new exercises' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' AND old_linked_release THEN
    RAISE EXCEPTION 'consolidated released workout exercise is immutable' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND (old_linked_release OR new_linked_release) THEN
    RAISE EXCEPTION 'consolidated released workout exercise is immutable' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WorkoutExercise_consolidated_release_immutable_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutExercise"
FOR EACH ROW EXECUTE FUNCTION "guard_consolidated_released_workout_exercise"();
