-- Issue #399 / AUD-399-30/31: reparenting of planned resistance structure must
-- remain inside one student/contract graph and serialize with execution start.

CREATE OR REPLACE FUNCTION "issue399_guard_planned_structure_integrity"() RETURNS trigger AS $$
DECLARE
  old_exercise_id TEXT;
  new_exercise_id TEXT;
  old_aluno_id TEXT;
  new_aluno_id TEXT;
  old_contract_id TEXT;
  new_contract_id TEXT;
  lock_row RECORD;
BEGIN
  IF TG_TABLE_NAME = 'WorkoutExerciseBlock' THEN
    IF TG_OP <> 'INSERT' THEN old_exercise_id := OLD."workoutExerciseId"; END IF;
    IF TG_OP <> 'DELETE' THEN new_exercise_id := NEW."workoutExerciseId"; END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      SELECT b."workoutExerciseId"
        INTO old_exercise_id
      FROM "WorkoutExerciseBlock" b
      WHERE b."id" = OLD."blockId";
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT b."workoutExerciseId"
        INTO new_exercise_id
      FROM "WorkoutExerciseBlock" b
      WHERE b."id" = NEW."blockId";
    END IF;
  END IF;

  -- The execution-start guards lock WorkoutDay in the same canonical order.
  -- Acquiring these locks before reading release/history state prevents a
  -- direct SQL writer from committing after a concurrent execution starts.
  FOR lock_row IN
    SELECT d."id"
    FROM "WorkoutDay" d
    WHERE EXISTS (
      SELECT 1
      FROM "WorkoutExercise" e
      WHERE e."workoutDayId" = d."id"
        AND (e."id" = old_exercise_id OR e."id" = new_exercise_id)
    )
    ORDER BY d."id"
    FOR UPDATE
  LOOP
    NULL;
  END LOOP;

  SELECT a."id", a."contractId"
    INTO old_aluno_id, old_contract_id
  FROM "WorkoutExercise" e
  JOIN "WorkoutDay" d ON d."id" = e."workoutDayId"
  JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
  JOIN "TrainingPlan" p ON p."id" = t."planId"
  JOIN "Aluno" a ON a."id" = p."alunoId"
  WHERE e."id" = old_exercise_id;

  SELECT a."id", a."contractId"
    INTO new_aluno_id, new_contract_id
  FROM "WorkoutExercise" e
  JOIN "WorkoutDay" d ON d."id" = e."workoutDayId"
  JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
  JOIN "TrainingPlan" p ON p."id" = t."planId"
  JOIN "Aluno" a ON a."id" = p."alunoId"
  WHERE e."id" = new_exercise_id;

  IF old_exercise_id IS NOT NULL
    AND new_exercise_id IS NOT NULL
    AND (
      old_aluno_id IS DISTINCT FROM new_aluno_id
      OR old_contract_id IS DISTINCT FROM new_contract_id
    ) THEN
    RAISE EXCEPTION 'planned resistance structure cannot cross student or contract graph'
      USING ERRCODE = '23514';
  END IF;

  -- An exercise must also agree with the contract of the plan that owns it.
  IF EXISTS (
    SELECT 1
    FROM "WorkoutExercise" e
    JOIN "ExerciseLibrary" l ON l."id" = e."exerciseId"
    JOIN "WorkoutDay" d ON d."id" = e."workoutDayId"
    JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
    JOIN "TrainingPlan" p ON p."id" = t."planId"
    JOIN "Aluno" a ON a."id" = p."alunoId"
    WHERE (e."id" = old_exercise_id OR e."id" = new_exercise_id)
      AND l."contractId" IS DISTINCT FROM a."contractId"
  ) THEN
    RAISE EXCEPTION 'planned exercise library does not belong to workout contract'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "WorkoutExercise" e
    JOIN "WorkoutDay" d ON d."id" = e."workoutDayId"
    JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
    LEFT JOIN "WorkoutSessionExecution" x ON x."workoutDayId" = d."id"
    WHERE (e."id" = old_exercise_id OR e."id" = new_exercise_id)
      AND (
        t."released"
        OR (x."id" IS NOT NULL AND x."status" <> 'not_started')
        OR EXISTS (
          SELECT 1 FROM "WorkoutExecution" legacy
          WHERE legacy."workoutExerciseId" = e."id"
        )
        OR EXISTS (
          SELECT 1 FROM "WorkoutSessionExecutionItem" item
          WHERE item."plannedUnitId" = e."id"
        )
      )
  ) THEN
    RAISE EXCEPTION 'planned resistance structure is frozen'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "issue399_freeze_blocks" ON "WorkoutExerciseBlock";
CREATE TRIGGER "issue399_freeze_blocks"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutExerciseBlock"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_planned_structure_integrity"();

DROP TRIGGER IF EXISTS "issue399_freeze_sets" ON "WorkoutExercisePlannedSet";
CREATE TRIGGER "issue399_freeze_sets"
BEFORE INSERT OR UPDATE OR DELETE ON "WorkoutExercisePlannedSet"
FOR EACH ROW EXECUTE FUNCTION "issue399_guard_planned_structure_integrity"();
