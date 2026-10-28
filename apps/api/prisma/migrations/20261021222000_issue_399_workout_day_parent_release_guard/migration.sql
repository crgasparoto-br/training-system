-- Issue #399 / AUD-399-13: protect BOTH sides of a WorkoutDay reparent.
-- A BEFORE UPDATE trigger cannot infer the NEW parent from a SELECT of the
-- persisted WorkoutDay row: that row still contains the OLD templateId.
-- Existing deployed migration history remains unchanged.
CREATE OR REPLACE FUNCTION "guard_consolidated_released_workout_day"()
RETURNS TRIGGER AS $$
DECLARE
  old_locked BOOLEAN := FALSE;
  new_locked BOOLEAN := FALSE;
  planning_changed BOOLEAN;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT EXISTS (
      SELECT 1
      FROM "WorkoutTemplate" template
      WHERE template."id" = OLD."templateId"
        AND (
          template."released"
          OR EXISTS (
            SELECT 1 FROM "ConsolidatedPrescriptionOperationalRelease" rel
            WHERE rel."workoutTemplateId" = template."id"
          )
        )
    ) INTO old_locked;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT EXISTS (
      SELECT 1
      FROM "WorkoutTemplate" template
      WHERE template."id" = NEW."templateId"
        AND (
          template."released"
          OR EXISTS (
            SELECT 1 FROM "ConsolidatedPrescriptionOperationalRelease" rel
            WHERE rel."workoutTemplateId" = template."id"
          )
        )
    ) INTO new_locked;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF new_locked THEN
      RAISE EXCEPTION 'released workout cannot receive new planning days' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF old_locked THEN
      RAISE EXCEPTION 'released workout day is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF old_locked OR new_locked THEN
    planning_changed := (to_jsonb(NEW) - 'updatedAt' - 'status' - 'startedAt' - 'finishedAt' - 'psrResponse' - 'pseResponse')
      IS DISTINCT FROM
      (to_jsonb(OLD) - 'updatedAt' - 'status' - 'startedAt' - 'finishedAt' - 'psrResponse' - 'pseResponse');
    IF planning_changed THEN
      RAISE EXCEPTION 'released workout day planning is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
