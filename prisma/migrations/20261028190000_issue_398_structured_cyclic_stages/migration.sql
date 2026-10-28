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
    AND (
      ("kind" = 'repeat' AND "repeatCount" BETWEEN 2 AND 100
        AND "durationUnit" IS NULL AND "durationValue" IS NULL
        AND "targetKind" IS NULL AND "targetValue" IS NULL
        AND "targetMin" IS NULL AND "targetMax" IS NULL
        AND "inclinePercent" IS NULL AND "cadenceSpm" IS NULL)
      OR ("kind" <> 'repeat' AND "repeatCount" IS NULL
        AND "durationUnit" IN ('seconds','meters')
        AND "durationValue" > 0
        AND "durationValue" <= CASE WHEN "durationUnit"='seconds' THEN 86400 ELSE 1000000 END
        AND ("targetKind" IS NULL OR "targetKind" IN ('pace_min_per_km','speed_kmh','heart_rate_bpm','zone','pse'))
        AND (("targetKind" IS NULL AND "targetValue" IS NULL AND "targetMin" IS NULL AND "targetMax" IS NULL)
          OR ("targetKind" IS NOT NULL AND (
            "targetValue" IS NOT NULL OR "targetMin" IS NOT NULL OR "targetMax" IS NOT NULL
          )))
        AND ("targetMin" IS NULL OR "targetMax" IS NULL OR "targetMin" <= "targetMax")
        AND ("inclinePercent" IS NULL OR "inclinePercent" BETWEEN -30 AND 30)
        AND ("cadenceSpm" IS NULL OR "cadenceSpm" BETWEEN 1 AND 300))
    )
    AND ("notes" IS NULL OR char_length("notes") <= 500)
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
  parent_kind TEXT;
  parent_day_id TEXT;
  parent_parent_id TEXT;
BEGIN
  FOR checked_day_id IN
    SELECT DISTINCT day_id FROM (
      SELECT CASE WHEN TG_OP <> 'INSERT' THEN OLD."workoutDayId" END AS day_id
      UNION ALL
      SELECT CASE WHEN TG_OP <> 'DELETE' THEN NEW."workoutDayId" END
    ) affected WHERE day_id IS NOT NULL
  LOOP
    PERFORM 1 FROM "WorkoutDay" WHERE "id"=checked_day_id FOR SHARE;
    IF EXISTS (
      SELECT 1 FROM "WorkoutDay" d
      JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
      WHERE d."id" = checked_day_id AND (
        t."released"
        OR EXISTS (SELECT 1 FROM "ConsolidatedPrescriptionOperationalRelease" r WHERE r."workoutTemplateId"=t."id")
        OR EXISTS (SELECT 1 FROM "WorkoutSessionExecution" e
          WHERE e."workoutDayId"=d."id" AND e."status"<>'not_started')
        OR EXISTS (SELECT 1 FROM "WorkoutExecution" x JOIN "WorkoutExercise" e ON e."id"=x."workoutExerciseId"
          WHERE e."workoutDayId"=d."id")
      )
    ) THEN
      RAISE EXCEPTION 'released or executed cyclic planning is immutable' USING ERRCODE='23514';
    END IF;
  END LOOP;

  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NEW."parentStageId" IS NOT NULL THEN
    SELECT "kind", "workoutDayId", "parentStageId"
      INTO parent_kind, parent_day_id, parent_parent_id
      FROM "WorkoutCyclicStage" WHERE "id"=NEW."parentStageId";
    IF parent_kind IS DISTINCT FROM 'repeat'
       OR parent_day_id IS DISTINCT FROM NEW."workoutDayId"
       OR parent_parent_id IS NOT NULL OR NEW."kind"='repeat' THEN
      RAISE EXCEPTION 'invalid cyclic stage parent' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND NEW."kind"<>'repeat' AND EXISTS (
    SELECT 1 FROM "WorkoutCyclicStage" WHERE "parentStageId"=NEW."id"
  ) THEN
    RAISE EXCEPTION 'repeat group cannot be converted with children' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "issue398_cyclic_stage_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutCyclicStage"
FOR EACH ROW EXECUTE FUNCTION "issue398_guard_cyclic_stage"();
