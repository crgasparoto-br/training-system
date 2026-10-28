-- Issue #399 / AUD-399-01: a liberacao legada do Workout Builder usa
-- WorkoutTemplate.released=true sem necessariamente criar o ledger consolidado.
-- Os guards anteriores cobriam somente templates vinculados ao ledger; estes
-- guards preservam a compatibilidade de execucao, mas tornam o grafo planejado
-- imutavel tambem nesse caminho legado.

CREATE OR REPLACE FUNCTION "guard_consolidated_released_workout_template"()
RETURNS TRIGGER AS $$
DECLARE
  linked_release BOOLEAN;
  planning_changed BOOLEAN;
  publication_metadata_changed BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM "ConsolidatedPrescriptionOperationalRelease" rel
    WHERE rel."workoutTemplateId" = OLD."id"
  ) INTO linked_release;

  IF TG_OP = 'DELETE' THEN
    IF OLD."released" OR linked_release THEN
      RAISE EXCEPTION 'released workout template is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."released" THEN
    RAISE EXCEPTION 'released workout template planning is immutable' USING ERRCODE = '23514';
  END IF;

  planning_changed := (to_jsonb(NEW) - 'updatedAt' - 'released' - 'releasedAt')
    IS DISTINCT FROM
    (to_jsonb(OLD) - 'updatedAt' - 'released' - 'releasedAt');
  publication_metadata_changed := NEW."released" IS DISTINCT FROM OLD."released"
    OR NEW."releasedAt" IS DISTINCT FROM OLD."releasedAt";

  IF linked_release OR publication_metadata_changed THEN
    IF planning_changed THEN
      RAISE EXCEPTION 'released workout template planning is immutable' USING ERRCODE = '23514';
    END IF;
    IF publication_metadata_changed AND NOT (
      OLD."released" = FALSE
      AND NEW."released" = TRUE
      AND OLD."releasedAt" IS NULL
      AND NEW."releasedAt" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'released workout publication metadata is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
      FROM "WorkoutDay" day
      JOIN "WorkoutTemplate" template ON template."id" = day."templateId"
      WHERE day."id" = OLD."id"
        AND (
          template."released"
          OR EXISTS (
            SELECT 1
            FROM "ConsolidatedPrescriptionOperationalRelease" rel
            WHERE rel."workoutTemplateId" = day."templateId"
          )
        )
    ) INTO old_locked;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT EXISTS (
      SELECT 1
      FROM "WorkoutDay" day
      JOIN "WorkoutTemplate" template ON template."id" = day."templateId"
      WHERE day."id" = NEW."id"
        AND (
          template."released"
          OR EXISTS (
            SELECT 1
            FROM "ConsolidatedPrescriptionOperationalRelease" rel
            WHERE rel."workoutTemplateId" = day."templateId"
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

CREATE OR REPLACE FUNCTION "guard_consolidated_released_workout_exercise"()
RETURNS TRIGGER AS $$
DECLARE
  old_locked_release BOOLEAN := FALSE;
  new_locked_release BOOLEAN := FALSE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT EXISTS (
      SELECT 1
      FROM "WorkoutDay" day
      JOIN "WorkoutTemplate" template ON template."id" = day."templateId"
      WHERE day."id" = OLD."workoutDayId"
        AND (
          template."released"
          OR EXISTS (
            SELECT 1
            FROM "ConsolidatedPrescriptionOperationalRelease" rel
            WHERE rel."workoutTemplateId" = day."templateId"
          )
        )
    ) INTO old_locked_release;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT EXISTS (
      SELECT 1
      FROM "WorkoutDay" day
      JOIN "WorkoutTemplate" template ON template."id" = day."templateId"
      WHERE day."id" = NEW."workoutDayId"
        AND (
          template."released"
          OR EXISTS (
            SELECT 1
            FROM "ConsolidatedPrescriptionOperationalRelease" rel
            WHERE rel."workoutTemplateId" = day."templateId"
          )
        )
    ) INTO new_locked_release;
  END IF;

  IF TG_OP = 'INSERT' AND new_locked_release THEN
    RAISE EXCEPTION 'released workout cannot receive new exercises' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' AND old_locked_release THEN
    RAISE EXCEPTION 'released workout exercise is immutable' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND (old_locked_release OR new_locked_release) THEN
    RAISE EXCEPTION 'released workout exercise is immutable' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
