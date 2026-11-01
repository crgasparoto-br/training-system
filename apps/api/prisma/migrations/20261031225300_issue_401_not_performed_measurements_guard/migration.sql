-- A-401-025: a negative unit outcome must not coexist with actual measurements.
-- NOT VALID preserves preexisting historical rows without inventing corrections;
-- new INSERT/UPDATE rows are always checked.
ALTER TABLE "WorkoutSessionExecutionItem"
  ADD CONSTRAINT "Issue401_item_negative_measurement_check"
  CHECK (
    "outcome" IS DISTINCT FROM 'not_performed'
    OR (
      "rir" IS NULL AND "rpe" IS NULL AND "tempo" IS NULL
      AND "restSec" IS NULL AND "loadKg" IS NULL
      AND "repetitions" IS NULL AND "durationSec" IS NULL
      AND "distanceKm" IS NULL AND "pace" IS NULL
      AND "heartRateBpm" IS NULL AND "heartRateZone" IS NULL
    )
  ) NOT VALID;

-- These units are stored in the canonical sessionValues JSONB, not child tables.
-- JSON null is an explicit clear; 0 and nonempty strings remain actual values.
CREATE FUNCTION "issue401_guard_negative_structured_measurements"() RETURNS TRIGGER AS $$
DECLARE
  entry JSONB;
BEGIN
  IF jsonb_typeof(NEW."sessionValues" -> 'cyclicStages') = 'array' THEN
    FOR entry IN SELECT value FROM jsonb_array_elements(NEW."sessionValues" -> 'cyclicStages') AS stage(value)
    LOOP
      IF entry ->> 'outcome' = 'not_performed'
         AND jsonb_strip_nulls(entry) ?| ARRAY[
           'durationSec', 'distanceMeters', 'paceMinPerKm', 'speedKmh',
           'heartRateBpm', 'heartRateZone', 'pse'
         ] THEN
        RAISE EXCEPTION 'non-performed cyclic stage cannot contain execution measurements'
          USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END IF;

  IF jsonb_typeof(NEW."sessionValues" -> 'resistanceGroups') = 'array' THEN
    FOR entry IN SELECT value FROM jsonb_array_elements(NEW."sessionValues" -> 'resistanceGroups') AS grp(value)
    LOOP
      IF entry ->> 'outcome' = 'not_performed'
         AND jsonb_strip_nulls(entry) ?| ARRAY[
           'roundsCompleted', 'restBetweenExercisesSec', 'restBetweenRoundsSec'
         ] THEN
        RAISE EXCEPTION 'non-performed resistance group cannot contain execution measurements'
          USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "issue401_negative_structured_measurement_guard"
BEFORE INSERT OR UPDATE OF "sessionValues" ON "WorkoutSessionExecution"
FOR EACH ROW EXECUTE FUNCTION "issue401_guard_negative_structured_measurements"();
