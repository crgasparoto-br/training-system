-- Issue #400: independent remediation of A-003 (Unicode eligibility) and A-004 (release history).
-- Follow-up migration: the previously published #400 migration must keep its checksum.

-- Match the JS trim() -> NFD -> combining marks U+0300..U+036F -> lower-case contract.
-- No extension (such as unaccent) is required, and NFD/NFC values behave identically.
CREATE FUNCTION "issue400_is_cyclic_category"(category TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(
    normalize(btrim(coalesce(category, ''), U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), NFD),
    '[' || chr(768) || '-' || chr(879) || ']', '', 'g'
  )) = 'ciclico';
$$;

-- Replace existing trigger functions in place, preserving all other guards and cardinalities.
CREATE OR REPLACE FUNCTION "issue400_guard_resistance_group"()
RETURNS TRIGGER AS $$
DECLARE
  old_day_id TEXT;
  new_day_id TEXT;
  exercise_day_id TEXT;
  checked_day_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'WorkoutResistanceGroup' THEN
    IF TG_OP <> 'INSERT' THEN old_day_id := OLD."workoutDayId"; END IF;
    IF TG_OP <> 'DELETE' THEN new_day_id := NEW."workoutDayId"; END IF;
    IF TG_OP = 'UPDATE' AND OLD."workoutDayId" IS DISTINCT FROM NEW."workoutDayId"
      AND EXISTS (SELECT 1 FROM "WorkoutResistanceGroupMember" WHERE "groupId" = OLD."id") THEN
      RAISE EXCEPTION 'cannot reparent a group containing members' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      SELECT "workoutDayId" INTO old_day_id FROM "WorkoutResistanceGroup" WHERE "id" = OLD."groupId";
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT "workoutDayId" INTO new_day_id FROM "WorkoutResistanceGroup" WHERE "id" = NEW."groupId";
      SELECT "workoutDayId" INTO exercise_day_id FROM "WorkoutExercise" WHERE "id" = NEW."workoutExerciseId";
      IF new_day_id IS NULL OR exercise_day_id IS DISTINCT FROM new_day_id THEN
        RAISE EXCEPTION 'group member must reference an exercise of the same day' USING ERRCODE = '23514';
      END IF;
      IF EXISTS (
        SELECT 1 FROM "WorkoutExercise" e
        JOIN "ExerciseLibrary" library ON library."id" = e."exerciseId"
        WHERE e."id" = NEW."workoutExerciseId"
          AND "issue400_is_cyclic_category"(library."category")
      ) THEN
        RAISE EXCEPTION 'cyclic exercise cannot join a resistance group' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  FOR checked_day_id IN
    SELECT DISTINCT value FROM (VALUES (old_day_id), (new_day_id)) ids(value)
    WHERE value IS NOT NULL ORDER BY value
  LOOP
    PERFORM t."id" FROM "WorkoutDay" d
      JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
      WHERE d."id" = checked_day_id FOR SHARE OF d, t;
    IF NOT FOUND THEN
      -- Cascading a draft WorkoutDay/Template may delete the parent first.
      -- Parent-level released-history guards protect that deletion.
      IF TG_OP = 'DELETE' THEN CONTINUE; END IF;
      RAISE EXCEPTION 'group day not found' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM "WorkoutDay" d JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
      WHERE d."id" = checked_day_id AND (
        t."released"
        OR EXISTS (SELECT 1 FROM "ConsolidatedPrescriptionOperationalRelease" release
          WHERE release."workoutTemplateId" = t."id")
        OR EXISTS (SELECT 1 FROM "WorkoutSessionExecution" execution
          JOIN "WorkoutDay" sibling ON sibling."id" = execution."workoutDayId"
          WHERE sibling."templateId" = t."id" AND execution."status" <> 'not_started')
        OR EXISTS (SELECT 1 FROM "WorkoutExecution" history
          JOIN "WorkoutExercise" exercise ON exercise."id" = history."workoutExerciseId"
          JOIN "WorkoutDay" sibling ON sibling."id" = exercise."workoutDayId"
          WHERE sibling."templateId" = t."id")
        OR EXISTS (SELECT 1 FROM "WorkoutDay" sibling
          WHERE sibling."templateId" = t."id"
            AND (sibling."status" <> 'planned' OR sibling."startedAt" IS NOT NULL
              OR sibling."finishedAt" IS NOT NULL))
      )
    ) THEN
      RAISE EXCEPTION 'released or executed resistance grouping is immutable' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql

CREATE OR REPLACE FUNCTION "issue400_guard_grouped_exercise_day"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."workoutDayId" IS DISTINCT FROM OLD."workoutDayId"
    AND EXISTS (SELECT 1 FROM "WorkoutResistanceGroupMember" WHERE "workoutExerciseId" = OLD."id") THEN
    RAISE EXCEPTION 'grouped exercise cannot change day' USING ERRCODE = '23514';
  END IF;
  IF NEW."exerciseId" IS DISTINCT FROM OLD."exerciseId"
    AND EXISTS (SELECT 1 FROM "WorkoutResistanceGroupMember" WHERE "workoutExerciseId" = OLD."id")
    AND EXISTS (SELECT 1 FROM "ExerciseLibrary" library WHERE library."id" = NEW."exerciseId"
      AND "issue400_is_cyclic_category"(library."category")) THEN
    RAISE EXCEPTION 'grouped exercise cannot become cyclic' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql

CREATE OR REPLACE FUNCTION "issue400_guard_grouped_library_category"() RETURNS TRIGGER AS $$
BEGIN
  IF "issue400_is_cyclic_category"(NEW."category")
    AND EXISTS (
      SELECT 1 FROM "WorkoutExercise" e
      JOIN "WorkoutResistanceGroupMember" member ON member."workoutExerciseId" = e."id"
      WHERE e."exerciseId" = OLD."id"
    ) THEN
    RAISE EXCEPTION 'grouped library exercise cannot become cyclic' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql

-- The snapshot is per canonical WorkoutExercise: a group remains just an arrangement.
-- JSON captures only catalog fields that can affect the displayed prescription.
CREATE TABLE "WorkoutReleasedExerciseSnapshot" (
  "workoutExerciseId" TEXT NOT NULL PRIMARY KEY REFERENCES "WorkoutExercise"("id") ON DELETE CASCADE,
  "catalog" JSONB NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkoutReleasedExerciseSnapshot_name_check" CHECK (jsonb_typeof("catalog"->'name') = 'string')
);

-- Historical rows already released can only be frozen at their CURRENT catalog value.
-- Names from before this migration are not reconstructable and are not fabricated.
INSERT INTO "WorkoutReleasedExerciseSnapshot" ("workoutExerciseId", "catalog")
SELECT e."id", jsonb_build_object(
    'name', library."name", 'videoUrl', library."videoUrl",
    'category', library."category", 'muscleGroup', library."muscleGroup",
    'loadType', library."loadType", 'movementType', library."movementType",
    'countingType', library."countingType", 'notes', library."notes"
  )
  FROM "WorkoutExercise" e
  JOIN "WorkoutDay" d ON d."id" = e."workoutDayId"
  JOIN "ExerciseLibrary" library ON library."id" = e."exerciseId"
  JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
  WHERE t."released" OR EXISTS (
    SELECT 1 FROM "ConsolidatedPrescriptionOperationalRelease" rel
    WHERE rel."workoutTemplateId" = t."id"
  )
ON CONFLICT ("workoutExerciseId") DO NOTHING;

-- Executes during both legacy and consolidated release, including direct SQL transitions.
-- BEFORE UPDATE observes the old mutable template, even after a consolidated ledger is inserted.
CREATE FUNCTION "issue400_capture_released_exercise_catalog"() RETURNS TRIGGER AS $$
BEGIN
  IF OLD."released" = FALSE AND NEW."released" = TRUE THEN
    INSERT INTO "WorkoutReleasedExerciseSnapshot" ("workoutExerciseId", "catalog")
    SELECT e."id", jsonb_build_object(
        'name', library."name", 'videoUrl', library."videoUrl",
        'category', library."category", 'muscleGroup', library."muscleGroup",
        'loadType', library."loadType", 'movementType', library."movementType",
        'countingType', library."countingType", 'notes', library."notes"
      )
      FROM "WorkoutExercise" e
      JOIN "WorkoutDay" d ON d."id" = e."workoutDayId"
      JOIN "ExerciseLibrary" library ON library."id" = e."exerciseId"
    WHERE d."templateId" = OLD."id"
    ON CONFLICT ("workoutExerciseId") DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "issue400_capture_released_exercise_catalog"
BEFORE UPDATE OF "released" ON "WorkoutTemplate"
FOR EACH ROW EXECUTE FUNCTION "issue400_capture_released_exercise_catalog"();

-- A released snapshot cannot be changed, inserted late, or erased via direct SQL.
CREATE FUNCTION "issue400_guard_released_exercise_catalog"() RETURNS TRIGGER AS $$
DECLARE
  locked BOOLEAN;
  exercise_key TEXT;
BEGIN
  exercise_key := CASE WHEN TG_OP = 'DELETE' THEN OLD."workoutExerciseId" ELSE NEW."workoutExerciseId" END;
  SELECT t."released" INTO locked
  FROM "WorkoutExercise" e
  JOIN "WorkoutDay" d ON d."id" = e."workoutDayId"
  JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
  WHERE e."id" = exercise_key FOR SHARE OF t;
  IF TG_OP = 'UPDATE' AND NEW."workoutExerciseId" IS DISTINCT FROM OLD."workoutExerciseId" THEN
    RAISE EXCEPTION 'release snapshot identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF locked THEN
    RAISE EXCEPTION 'released exercise catalog snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "issue400_released_exercise_catalog_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutReleasedExerciseSnapshot"
FOR EACH ROW EXECUTE FUNCTION "issue400_guard_released_exercise_catalog"();
