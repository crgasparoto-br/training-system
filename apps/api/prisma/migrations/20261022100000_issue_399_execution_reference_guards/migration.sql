-- Issue #399 / AUD-399-16/17: plannedSetId must be part of the canonical
-- execution contract and direct SQL writes must remain inside one operational graph.

CREATE OR REPLACE FUNCTION "issue399_match_execution_set"() RETURNS trigger AS $$
DECLARE
  execution_day_id TEXT;
  execution_aluno_id TEXT;
  execution_contract_id TEXT;
  planned_unit_day_id TEXT;
  planned_set_unit_id TEXT;
  planned_set_day_id TEXT;
  graph_aluno_id TEXT;
  graph_contract_id TEXT;
BEGIN
  SELECT x."workoutDayId", x."alunoId", x."contractId"
    INTO execution_day_id, execution_aluno_id, execution_contract_id
  FROM "WorkoutSessionExecution" x
  WHERE x."id" = NEW."executionId";

  IF execution_day_id IS NULL THEN
    RAISE EXCEPTION 'execution item references an unknown execution' USING ERRCODE = '23514';
  END IF;

  SELECT e."workoutDayId" INTO planned_unit_day_id
  FROM "WorkoutExercise" e
  WHERE e."id" = NEW."plannedUnitId";

  IF planned_unit_day_id IS NULL OR planned_unit_day_id <> execution_day_id THEN
    RAISE EXCEPTION 'planned unit does not belong to execution day' USING ERRCODE = '23514';
  END IF;

  SELECT a."id", a."contractId"
    INTO graph_aluno_id, graph_contract_id
  FROM "WorkoutDay" d
  JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
  JOIN "TrainingPlan" p ON p."id" = t."planId"
  JOIN "Aluno" a ON a."id" = p."alunoId"
  WHERE d."id" = execution_day_id;

  IF graph_aluno_id IS NULL
    OR graph_aluno_id <> execution_aluno_id
    OR graph_contract_id <> execution_contract_id THEN
    RAISE EXCEPTION 'execution graph ownership does not match planned day' USING ERRCODE = '23514';
  END IF;

  IF NEW."plannedSetId" IS NULL
    AND EXISTS (
      SELECT 1
      FROM "WorkoutExerciseBlock" b
      WHERE b."workoutExerciseId" = NEW."plannedUnitId"
    ) THEN
    RAISE EXCEPTION 'structured planned unit requires a planned set reference' USING ERRCODE = '23514';
  END IF;

  IF NEW."plannedSetId" IS NOT NULL THEN
    SELECT b."workoutExerciseId", e."workoutDayId"
      INTO planned_set_unit_id, planned_set_day_id
    FROM "WorkoutExercisePlannedSet" s
    JOIN "WorkoutExerciseBlock" b ON b."id" = s."blockId"
    JOIN "WorkoutExercise" e ON e."id" = b."workoutExerciseId"
    WHERE s."id" = NEW."plannedSetId";

    IF planned_set_unit_id IS NULL
      OR planned_set_unit_id <> NEW."plannedUnitId"
      OR planned_set_day_id <> execution_day_id THEN
      RAISE EXCEPTION 'planned set does not belong to execution unit and day' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "issue399_match_execution_set_trigger"
  ON "WorkoutSessionExecutionItem";
CREATE TRIGGER "issue399_match_execution_set_trigger"
BEFORE INSERT OR UPDATE OF "executionId", "plannedSetId", "plannedUnitId"
ON "WorkoutSessionExecutionItem"
FOR EACH ROW EXECUTE FUNCTION "issue399_match_execution_set"();
