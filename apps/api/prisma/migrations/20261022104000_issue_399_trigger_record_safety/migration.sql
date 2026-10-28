-- Issue #399 / CI regression: a trigger function shared by tables with
-- different row shapes cannot safely reference NEW/OLD fields behind an
-- SQL boolean guard. PostgreSQL may evaluate those field references even
-- when TG_TABLE_NAME does not match, yielding "record new has no field ...".
-- Keep one trigger function per table so every NEW/OLD field is valid.

CREATE OR REPLACE FUNCTION "issue399_guard_template_parent_identity"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."planId" IS DISTINCT FROM OLD."planId" THEN
    RAISE EXCEPTION 'workout template parent is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "issue399_guard_day_parent_identity"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."templateId" IS DISTINCT FROM OLD."templateId" THEN
    RAISE EXCEPTION 'workout day parent is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "issue399_guard_exercise_graph_identity"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."workoutDayId" IS DISTINCT FROM OLD."workoutDayId" THEN
    RAISE EXCEPTION 'workout exercise parent is immutable' USING ERRCODE = '23514';
  END IF;

  IF TG_OP <> 'DELETE' AND NOT EXISTS (
    SELECT 1
    FROM "WorkoutDay" d
    JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
    JOIN "TrainingPlan" p ON p."id" = t."planId"
    JOIN "Aluno" a ON a."id" = p."alunoId"
    JOIN "ExerciseLibrary" library ON library."id" = NEW."exerciseId"
    WHERE d."id" = NEW."workoutDayId"
      AND library."contractId" = a."contractId"
  ) THEN
    RAISE EXCEPTION 'workout exercise crosses contract ownership' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "issue399_template_parent_identity" ON "WorkoutTemplate";
CREATE TRIGGER "issue399_template_parent_identity"
BEFORE UPDATE OF "planId" ON "WorkoutTemplate"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_template_parent_identity"();

DROP TRIGGER IF EXISTS "issue399_day_parent_identity" ON "WorkoutDay";
CREATE TRIGGER "issue399_day_parent_identity"
BEFORE UPDATE OF "templateId" ON "WorkoutDay"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_day_parent_identity"();

DROP TRIGGER IF EXISTS "issue399_exercise_graph_identity" ON "WorkoutExercise";
CREATE TRIGGER "issue399_exercise_graph_identity"
BEFORE INSERT OR UPDATE OF "workoutDayId", "exerciseId"
ON "WorkoutExercise"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_exercise_graph_identity"();
