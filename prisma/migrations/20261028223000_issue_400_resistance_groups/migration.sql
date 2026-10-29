-- #400: optional, canonical resistance execution groupings under WorkoutDay.
-- Exercises and planned sets remain unique canonical rows; there is no synthetic backfill.
CREATE TABLE "WorkoutResistanceGroup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workoutDayId" TEXT NOT NULL REFERENCES "WorkoutDay"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "position" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "rounds" INTEGER,
  "restBetweenExercisesSec" INTEGER,
  "restBetweenRoundsSec" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkoutResistanceGroup_shape_check" CHECK (
    "position" BETWEEN 1 AND 30
    AND "kind" IN ('superserie','bi_set','tri_set','circuito','bloco_tecnico','mobilidade','finalizacao')
    AND ("rounds" IS NULL OR "rounds" BETWEEN 1 AND 100)
    AND ("restBetweenExercisesSec" IS NULL OR "restBetweenExercisesSec" BETWEEN 0 AND 86400)
    AND ("restBetweenRoundsSec" IS NULL OR "restBetweenRoundsSec" BETWEEN 0 AND 86400)
    AND ("notes" IS NULL OR char_length("notes") <= 500)
  )
);
CREATE UNIQUE INDEX "WorkoutResistanceGroup_day_position_key" ON "WorkoutResistanceGroup"("workoutDayId","position");

CREATE TABLE "WorkoutResistanceGroupMember" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL REFERENCES "WorkoutResistanceGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "workoutExerciseId" TEXT NOT NULL REFERENCES "WorkoutExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "position" INTEGER NOT NULL,
  CONSTRAINT "WorkoutResistanceGroupMember_position_check" CHECK ("position" BETWEEN 1 AND 20)
);
CREATE UNIQUE INDEX "WorkoutResistanceGroupMember_group_position_key"
  ON "WorkoutResistanceGroupMember"("groupId","position");
CREATE UNIQUE INDEX "WorkoutResistanceGroupMember_exercise_key"
  ON "WorkoutResistanceGroupMember"("workoutExerciseId");
CREATE INDEX "WorkoutResistanceGroupMember_group_idx"
  ON "WorkoutResistanceGroupMember"("groupId");

-- Enforce tenant/day consistency and released-history immutability also for direct SQL.
CREATE FUNCTION "issue400_guard_resistance_group"()
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER "issue400_group_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutResistanceGroup"
FOR EACH ROW EXECUTE FUNCTION "issue400_guard_resistance_group"();
CREATE TRIGGER "issue400_group_member_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutResistanceGroupMember"
FOR EACH ROW EXECUTE FUNCTION "issue400_guard_resistance_group"();

-- A previously valid membership cannot become cross-day through an exercise update.
CREATE FUNCTION "issue400_guard_grouped_exercise_day"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."workoutDayId" IS DISTINCT FROM OLD."workoutDayId"
    AND EXISTS (SELECT 1 FROM "WorkoutResistanceGroupMember" WHERE "workoutExerciseId" = OLD."id") THEN
    RAISE EXCEPTION 'grouped exercise cannot change day' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "issue400_grouped_exercise_day_guard"
BEFORE UPDATE OF "workoutDayId" ON "WorkoutExercise"
FOR EACH ROW EXECUTE FUNCTION "issue400_guard_grouped_exercise_day"();

-- Check the final transaction state (nested Prisma writes create group before members).
CREATE FUNCTION "issue400_validate_group_graph"() RETURNS TRIGGER AS $$
DECLARE
  check_day_id TEXT;
  old_day_id TEXT;
  new_day_id TEXT;
  check_group RECORD;
  group_count INTEGER;
  last_position INTEGER;
  member_count INTEGER;
  last_member_position INTEGER;
  min_members INTEGER;
  max_members INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'WorkoutResistanceGroup' THEN
    IF TG_OP <> 'INSERT' THEN old_day_id := OLD."workoutDayId"; END IF;
    IF TG_OP <> 'DELETE' THEN new_day_id := NEW."workoutDayId"; END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      SELECT "workoutDayId" INTO old_day_id FROM "WorkoutResistanceGroup" WHERE "id" = OLD."groupId";
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT "workoutDayId" INTO new_day_id FROM "WorkoutResistanceGroup" WHERE "id" = NEW."groupId";
    END IF;
  END IF;

  FOR check_day_id IN
    SELECT DISTINCT value FROM (VALUES (old_day_id), (new_day_id)) ids(value) WHERE value IS NOT NULL
  LOOP
    IF NOT EXISTS (SELECT 1 FROM "WorkoutDay" WHERE "id" = check_day_id) THEN CONTINUE; END IF;
    SELECT count(*)::int, coalesce(max("position"), 0)::int
      INTO group_count, last_position
      FROM "WorkoutResistanceGroup" WHERE "workoutDayId" = check_day_id;
    IF group_count <> last_position THEN
      RAISE EXCEPTION 'non-contiguous group positions' USING ERRCODE = '23514';
    END IF;
    FOR check_group IN SELECT "id", "kind" FROM "WorkoutResistanceGroup"
      WHERE "workoutDayId" = check_day_id
    LOOP
      SELECT count(*)::int, coalesce(max("position"), 0)::int
        INTO member_count, last_member_position FROM "WorkoutResistanceGroupMember"
        WHERE "groupId" = check_group."id";
      min_members := CASE check_group."kind"
        WHEN 'superserie' THEN 2 WHEN 'bi_set' THEN 2 WHEN 'tri_set' THEN 3
        WHEN 'circuito' THEN 2 ELSE 1 END;
      max_members := CASE check_group."kind"
        WHEN 'superserie' THEN 4 WHEN 'bi_set' THEN 2 WHEN 'tri_set' THEN 3 ELSE 20 END;
      IF member_count NOT BETWEEN min_members AND max_members OR member_count <> last_member_position THEN
        RAISE EXCEPTION 'invalid group cardinality or member order' USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "issue400_group_shape_at_commit"
AFTER INSERT OR UPDATE OR DELETE ON "WorkoutResistanceGroup"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "issue400_validate_group_graph"();
CREATE CONSTRAINT TRIGGER "issue400_member_shape_at_commit"
AFTER INSERT OR UPDATE OR DELETE ON "WorkoutResistanceGroupMember"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "issue400_validate_group_graph"();
