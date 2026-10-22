-- Issue #399 / AUD-399-27: enforce the application invariant at the database
-- boundary too. Deferred triggers allow nested replacement writes to settle
-- before contiguity is checked at transaction commit.

ALTER TABLE "WorkoutExerciseBlock"
  DROP CONSTRAINT IF EXISTS "WorkoutExerciseBlock_position_check",
  ADD CONSTRAINT "WorkoutExerciseBlock_position_check"
    CHECK ("position" > 0 AND "position" <= 12);

ALTER TABLE "WorkoutExercisePlannedSet"
  DROP CONSTRAINT IF EXISTS "WorkoutExercisePlannedSet_position_check",
  ADD CONSTRAINT "WorkoutExercisePlannedSet_position_check"
    CHECK ("position" > 0 AND "position" <= 30);

CREATE OR REPLACE FUNCTION "issue399_assert_block_positions_contiguous"(p_exercise_id TEXT)
RETURNS VOID AS $$
DECLARE
  total_count INTEGER;
  max_position INTEGER;
  min_position INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER, MAX("position"), MIN("position")
    INTO total_count, max_position, min_position
  FROM "WorkoutExerciseBlock"
  WHERE "workoutExerciseId" = p_exercise_id;
  IF total_count > 0 AND (min_position <> 1 OR max_position <> total_count) THEN
    RAISE EXCEPTION 'workout exercise block positions must be contiguous' USING ERRCODE = '23514';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "issue399_assert_set_positions_contiguous"(p_block_id TEXT)
RETURNS VOID AS $$
DECLARE
  total_count INTEGER;
  max_position INTEGER;
  min_position INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER, MAX("position"), MIN("position")
    INTO total_count, max_position, min_position
  FROM "WorkoutExercisePlannedSet"
  WHERE "blockId" = p_block_id;
  IF total_count > 0 AND (min_position <> 1 OR max_position <> total_count) THEN
    RAISE EXCEPTION 'planned set positions must be contiguous' USING ERRCODE = '23514';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "issue399_guard_block_positions"() RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM "issue399_assert_block_positions_contiguous"(OLD."workoutExerciseId");
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM "issue399_assert_block_positions_contiguous"(NEW."workoutExerciseId");
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "issue399_guard_set_positions"() RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM "issue399_assert_set_positions_contiguous"(OLD."blockId");
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM "issue399_assert_set_positions_contiguous"(NEW."blockId");
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "issue399_block_positions_contiguous" ON "WorkoutExerciseBlock";
CREATE CONSTRAINT TRIGGER "issue399_block_positions_contiguous"
AFTER INSERT OR UPDATE OR DELETE ON "WorkoutExerciseBlock"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_block_positions"();

DROP TRIGGER IF EXISTS "issue399_set_positions_contiguous" ON "WorkoutExercisePlannedSet";
CREATE CONSTRAINT TRIGGER "issue399_set_positions_contiguous"
AFTER INSERT OR UPDATE OR DELETE ON "WorkoutExercisePlannedSet"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_set_positions"();
