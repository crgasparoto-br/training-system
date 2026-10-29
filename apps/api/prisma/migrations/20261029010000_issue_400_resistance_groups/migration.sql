-- Issues #400/#487: explicit persisted resistance grouping.
DO $$
BEGIN
  CREATE TYPE "WorkoutExerciseGroupType" AS ENUM (
    'superset', 'biset', 'triset', 'circuit', 'technical_block', 'mobility', 'finisher'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "WorkoutExercise"
  ADD COLUMN "groupId" TEXT,
  ADD COLUMN "groupType" "WorkoutExerciseGroupType",
  ADD COLUMN "groupPosition" INTEGER,
  ADD COLUMN "groupRounds" INTEGER;

ALTER TABLE "WorkoutExercise"
  ADD CONSTRAINT "WorkoutExercise_group_shape_check" CHECK (
    ("groupId" IS NULL AND "groupType" IS NULL AND "groupPosition" IS NULL AND "groupRounds" IS NULL)
    OR
    ("groupId" IS NOT NULL AND "groupType" IS NOT NULL
      AND "groupPosition" IS NOT NULL AND "groupPosition" > 0
      AND "groupRounds" IS NOT NULL AND "groupRounds" > 0 AND "groupRounds" <= 30)
  );

CREATE INDEX "WorkoutExercise_groupId_idx" ON "WorkoutExercise"("groupId");
CREATE UNIQUE INDEX "WorkoutExercise_groupId_groupPosition_key"
  ON "WorkoutExercise"("groupId", "groupPosition")
  WHERE "groupId" IS NOT NULL;

CREATE OR REPLACE FUNCTION "issue400_validate_group_member"()
RETURNS trigger AS $$
DECLARE planned_set_count INTEGER;
BEGIN
  IF NEW."groupId" IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*)::INTEGER INTO planned_set_count
  FROM "WorkoutExerciseBlock" block
  JOIN "WorkoutExercisePlannedSet" planned_set ON planned_set."blockId" = block."id"
  WHERE block."workoutExerciseId" = NEW."id";
  IF planned_set_count <> NEW."groupRounds" THEN
    RAISE EXCEPTION 'group rounds must match structured planned sets' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "WorkoutExercise" sibling
    WHERE sibling."groupId" = NEW."groupId" AND sibling."id" <> NEW."id"
      AND (sibling."workoutDayId" <> NEW."workoutDayId"
        OR sibling."groupType" IS DISTINCT FROM NEW."groupType"
        OR sibling."groupRounds" IS DISTINCT FROM NEW."groupRounds")
  ) THEN
    RAISE EXCEPTION 'group members must share day, type and rounds' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    OLD."groupId" IS DISTINCT FROM NEW."groupId" OR OLD."groupType" IS DISTINCT FROM NEW."groupType"
    OR OLD."groupPosition" IS DISTINCT FROM NEW."groupPosition" OR OLD."groupRounds" IS DISTINCT FROM NEW."groupRounds"
  ) THEN
    PERFORM 1 FROM "WorkoutDay" day WHERE day."id" = NEW."workoutDayId" FOR UPDATE;
    IF EXISTS (
      SELECT 1 FROM "WorkoutDay" day
      JOIN "WorkoutTemplate" template ON template."id" = day."templateId"
      LEFT JOIN "WorkoutSessionExecution" execution ON execution."workoutDayId" = day."id"
      WHERE day."id" = NEW."workoutDayId" AND (
        template."released" OR (execution."id" IS NOT NULL AND execution."status" <> 'not_started')
        OR EXISTS (SELECT 1 FROM "WorkoutExecution" legacy
          JOIN "WorkoutExercise" legacy_exercise ON legacy_exercise."id" = legacy."workoutExerciseId"
          WHERE legacy_exercise."workoutDayId" = day."id")
        OR EXISTS (SELECT 1 FROM "WorkoutSessionExecutionItem" item
          JOIN "WorkoutExercise" item_exercise ON item_exercise."id" = item."plannedUnitId"
          WHERE item_exercise."workoutDayId" = day."id")
      )
    ) THEN RAISE EXCEPTION 'planned resistance grouping is frozen' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "issue400_validate_group_member_trigger"
BEFORE INSERT OR UPDATE OF "groupId", "groupType", "groupPosition", "groupRounds" ON "WorkoutExercise"
FOR EACH ROW EXECUTE FUNCTION "issue400_validate_group_member"();

CREATE OR REPLACE FUNCTION "issue400_require_complete_group"()
RETURNS trigger AS $$
DECLARE candidate_group_id TEXT; member_count INTEGER; position_count INTEGER;
  min_position INTEGER; max_position INTEGER; group_type TEXT;
BEGIN
  candidate_group_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."groupId" ELSE NEW."groupId" END;
  IF candidate_group_id IS NULL AND TG_OP = 'UPDATE' THEN candidate_group_id := OLD."groupId"; END IF;
  IF candidate_group_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM "WorkoutExercise" e WHERE e."groupId" = candidate_group_id
  ) THEN RETURN NULL; END IF;
  SELECT COUNT(*), COUNT(DISTINCT e."groupPosition"), MIN(e."groupPosition"), MAX(e."groupPosition"),
         MIN(e."groupType"::TEXT)
    INTO member_count, position_count, min_position, max_position, group_type
  FROM "WorkoutExercise" e WHERE e."groupId" = candidate_group_id;
  IF position_count <> member_count OR min_position <> 1 OR max_position <> member_count THEN
    RAISE EXCEPTION 'group positions must be contiguous' USING ERRCODE = '23514';
  END IF;
  IF (group_type IN ('superset','biset') AND member_count <> 2)
    OR (group_type = 'triset' AND member_count <> 3)
    OR (group_type = 'circuit' AND member_count < 2) THEN
    RAISE EXCEPTION 'group participant count does not match group type' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "issue400_require_complete_group_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "WorkoutExercise"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "issue400_require_complete_group"();
