-- Issue #398: an additive, optional structure under the existing WorkoutDay.
-- Old notes and scalar cyclic fields remain available without synthetic backfill.
CREATE TABLE "WorkoutCyclicStage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workoutDayId" TEXT NOT NULL,
  "parentStageId" TEXT,
  "position" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "durationUnit" TEXT,
  "durationValue" DOUBLE PRECISION,
  "targetKind" TEXT,
  "targetValue" DOUBLE PRECISION,
  "targetMin" DOUBLE PRECISION,
  "targetMax" DOUBLE PRECISION,
  "repeatCount" INTEGER,
  "inclinePercent" DOUBLE PRECISION,
  "cadenceSpm" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkoutCyclicStage_workoutDayId_fkey" FOREIGN KEY ("workoutDayId") REFERENCES "WorkoutDay"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkoutCyclicStage_parentStageId_fkey" FOREIGN KEY ("parentStageId") REFERENCES "WorkoutCyclicStage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkoutCyclicStage_shape_check" CHECK (
    "position" BETWEEN 1 AND 40
    AND "kind" IN ('warmup','work','recovery','cooldown','repeat')
    AND ("notes" IS NULL OR char_length("notes") <= 500)
    AND (
      ("kind" = 'repeat'
        AND "repeatCount" IS NOT NULL AND "repeatCount" BETWEEN 2 AND 100
        AND "durationUnit" IS NULL AND "durationValue" IS NULL
        AND "targetKind" IS NULL AND "targetValue" IS NULL
        AND "targetMin" IS NULL AND "targetMax" IS NULL
        AND "inclinePercent" IS NULL AND "cadenceSpm" IS NULL)
      OR
      ("kind" <> 'repeat'
        AND "repeatCount" IS NULL
        AND "durationUnit" IS NOT NULL AND "durationUnit" IN ('seconds','meters')
        AND "durationValue" IS NOT NULL AND "durationValue" > 0
        AND "durationValue" <= CASE WHEN "durationUnit" = 'seconds' THEN 86400 ELSE 1000000 END
        AND ("inclinePercent" IS NULL OR "inclinePercent" BETWEEN -30 AND 30)
        AND ("cadenceSpm" IS NULL OR ("cadenceSpm" BETWEEN 1 AND 300))
        AND (
          ("targetKind" IS NULL AND "targetValue" IS NULL AND "targetMin" IS NULL AND "targetMax" IS NULL)
          OR
          ("targetKind" IS NOT NULL
            AND "targetKind" IN ('pace_min_per_km','speed_kmh','heart_rate_bpm','zone','pse')
            AND ("targetValue" IS NOT NULL OR "targetMin" IS NOT NULL OR "targetMax" IS NOT NULL)
            AND ("targetValue" IS NULL OR ("targetMin" IS NULL AND "targetMax" IS NULL))
            AND ("targetMin" IS NULL OR "targetMax" IS NULL OR "targetMin" <= "targetMax")
            AND (
              "targetValue" IS NULL
              OR "targetValue" BETWEEN
                CASE "targetKind"
                  WHEN 'pace_min_per_km' THEN 0.01 WHEN 'speed_kmh' THEN 0.01
                  WHEN 'heart_rate_bpm' THEN 30 WHEN 'zone' THEN 1 ELSE 0 END
                AND CASE "targetKind"
                  WHEN 'pace_min_per_km' THEN 60 WHEN 'speed_kmh' THEN 100
                  WHEN 'heart_rate_bpm' THEN 250 WHEN 'zone' THEN 5 ELSE 10 END
            )
            AND (
              "targetMin" IS NULL
              OR "targetMin" BETWEEN
                CASE "targetKind"
                  WHEN 'pace_min_per_km' THEN 0.01 WHEN 'speed_kmh' THEN 0.01
                  WHEN 'heart_rate_bpm' THEN 30 WHEN 'zone' THEN 1 ELSE 0 END
                AND CASE "targetKind"
                  WHEN 'pace_min_per_km' THEN 60 WHEN 'speed_kmh' THEN 100
                  WHEN 'heart_rate_bpm' THEN 250 WHEN 'zone' THEN 5 ELSE 10 END
            )
            AND (
              "targetMax" IS NULL
              OR "targetMax" BETWEEN
                CASE "targetKind"
                  WHEN 'pace_min_per_km' THEN 0.01 WHEN 'speed_kmh' THEN 0.01
                  WHEN 'heart_rate_bpm' THEN 30 WHEN 'zone' THEN 1 ELSE 0 END
                AND CASE "targetKind"
                  WHEN 'pace_min_per_km' THEN 60 WHEN 'speed_kmh' THEN 100
                  WHEN 'heart_rate_bpm' THEN 250 WHEN 'zone' THEN 5 ELSE 10 END
            )
            AND ("targetKind" NOT IN ('zone','heart_rate_bpm')
              OR (("targetValue" IS NULL OR "targetValue" = floor("targetValue"))
                AND ("targetMin" IS NULL OR "targetMin" = floor("targetMin"))
                AND ("targetMax" IS NULL OR "targetMax" = floor("targetMax"))))
        )
      )
    )
  )

);
CREATE UNIQUE INDEX "WorkoutCyclicStage_parentStageId_position_key"
  ON "WorkoutCyclicStage"("parentStageId", "position");
CREATE UNIQUE INDEX "WorkoutCyclicStage_top_level_position_key"
  ON "WorkoutCyclicStage"("workoutDayId", "position") WHERE "parentStageId" IS NULL;
CREATE INDEX "WorkoutCyclicStage_workoutDayId_parentStageId_position_idx"
  ON "WorkoutCyclicStage"("workoutDayId", "parentStageId", "position");

-- Independently enforce historical immutability for all writers, including
-- direct SQL, FK reparenting and concurrent requests.
CREATE FUNCTION "issue398_guard_cyclic_stage"()
RETURNS TRIGGER AS $$
DECLARE
  checked_day_id TEXT;
  old_day_id TEXT;
  new_day_id TEXT;
  parent_kind TEXT;
  parent_day_id TEXT;
  parent_parent_id TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_day_id := OLD."workoutDayId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_day_id := NEW."workoutDayId"; END IF;

  -- Share-lock both the operational day and its release owner. A concurrent
  -- release cannot pass through a stage write on a different connection.
  FOR checked_day_id IN
    SELECT DISTINCT value FROM (VALUES (old_day_id), (new_day_id)) ids(value)
    WHERE value IS NOT NULL
  LOOP
    PERFORM t."id" FROM "WorkoutDay" d
      JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
      WHERE d."id" = checked_day_id
      FOR SHARE OF d, t;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'cyclic stage day does not exist' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM "WorkoutDay" d
      JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
      WHERE d."id" = checked_day_id AND (
        t."released"
        OR EXISTS (
          SELECT 1 FROM "ConsolidatedPrescriptionOperationalRelease" r
          WHERE r."workoutTemplateId" = t."id"
        )
        OR EXISTS (
          SELECT 1 FROM "WorkoutSessionExecution" execution
          JOIN "WorkoutDay" sibling ON sibling."id" = execution."workoutDayId"
          WHERE sibling."templateId" = t."id" AND execution."status" <> 'not_started'
        )
        OR EXISTS (
          SELECT 1 FROM "WorkoutExecution" history
          JOIN "WorkoutExercise" exercise ON exercise."id" = history."workoutExerciseId"
          JOIN "WorkoutDay" sibling ON sibling."id" = exercise."workoutDayId"
          WHERE sibling."templateId" = t."id"
        )
        OR EXISTS (
          SELECT 1 FROM "WorkoutDay" sibling
          WHERE sibling."templateId" = t."id"
            AND (sibling."status" <> 'planned' OR sibling."startedAt" IS NOT NULL
              OR sibling."finishedAt" IS NOT NULL)
        )
      )
    ) THEN
      RAISE EXCEPTION 'released or executed cyclic planning is immutable' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW."parentStageId" IS NOT NULL THEN
    SELECT "kind", "workoutDayId", "parentStageId"
      INTO parent_kind, parent_day_id, parent_parent_id
      FROM "WorkoutCyclicStage" WHERE "id" = NEW."parentStageId";
    IF parent_kind IS DISTINCT FROM 'repeat'
      OR parent_day_id IS DISTINCT FROM NEW."workoutDayId"
      OR parent_parent_id IS NOT NULL OR NEW."kind" = 'repeat' THEN
      RAISE EXCEPTION 'invalid cyclic stage parent' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM "WorkoutCyclicStage" WHERE "parentStageId" = NEW."id"
  ) AND (NEW."kind" <> 'repeat' OR NEW."workoutDayId" IS DISTINCT FROM OLD."workoutDayId") THEN
    RAISE EXCEPTION 'repeat group with children cannot be reparented or converted' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "issue398_cyclic_stage_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutCyclicStage"
FOR EACH ROW EXECUTE FUNCTION "issue398_guard_cyclic_stage"();

-- Validate complete repeat groups at commit so nested Prisma creates can
-- insert their parent before its children without exposing incomplete groups.
CREATE FUNCTION "issue398_assert_complete_repeat_group"()
RETURNS TRIGGER AS $$
DECLARE
  old_parent TEXT;
  new_parent TEXT;
  old_self TEXT;
  new_self TEXT;
  group_id TEXT;
  total INTEGER;
  work_count INTEGER;
  recovery_count INTEGER;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_parent := OLD."parentStageId";
    old_self := OLD."id";
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_parent := NEW."parentStageId";
    new_self := NEW."id";
  END IF;

  FOR group_id IN
    SELECT DISTINCT value FROM (VALUES (old_parent), (new_parent), (old_self), (new_self)) ids(value)
    WHERE value IS NOT NULL
  LOOP
    IF EXISTS (
      SELECT 1 FROM "WorkoutCyclicStage" WHERE "id" = group_id AND "kind" = 'repeat'
    ) THEN
      SELECT count(*)::integer,
        count(*) FILTER (WHERE "kind" = 'work')::integer,
        count(*) FILTER (WHERE "kind" = 'recovery')::integer
      INTO total, work_count, recovery_count
      FROM "WorkoutCyclicStage" WHERE "parentStageId" = group_id;
      IF total NOT BETWEEN 2 AND 20 OR work_count < 1 OR recovery_count < 1 THEN
        RAISE EXCEPTION 'repeat group requires work and recovery stages' USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "issue398_complete_repeat_group_guard"
AFTER INSERT OR UPDATE OR DELETE ON "WorkoutCyclicStage"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "issue398_assert_complete_repeat_group"();
