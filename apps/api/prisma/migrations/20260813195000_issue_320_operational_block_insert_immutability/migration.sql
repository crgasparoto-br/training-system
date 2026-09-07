-- Issue #320 audit remediation A-007: prevent adding structured capacity blocks after publication.

CREATE OR REPLACE FUNCTION "guard_consolidated_released_workout_capacity_block_insert"()
RETURNS TRIGGER AS $$
DECLARE
  linked_release BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM "WorkoutDay" day
    JOIN "ConsolidatedPrescriptionOperationalRelease" rel
      ON rel."workoutTemplateId" = day."templateId"
    WHERE day."id" = NEW."workoutDayId"
  ) INTO linked_release;

  IF linked_release THEN
    RAISE EXCEPTION 'consolidated released workout cannot receive new structured capacity blocks'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WorkoutDayCapacityOperationalBlock_consolidated_release_insert_guard"
BEFORE INSERT ON "WorkoutDayCapacityOperationalBlock"
FOR EACH ROW EXECUTE FUNCTION "guard_consolidated_released_workout_capacity_block_insert"();
