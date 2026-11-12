-- #404: bind new resistant-exercise execution substitutions to the immutable ledger.
-- Old records remain readable without inventing a substitute or catalog revision.
ALTER TABLE "WorkoutSessionExecutionItem" ADD COLUMN "substitutionId" TEXT;
CREATE INDEX "WorkoutSessionExecutionItem_substitutionId_idx"
  ON "WorkoutSessionExecutionItem"("substitutionId");
ALTER TABLE "WorkoutSessionExecutionItem"
  ADD CONSTRAINT "WorkoutSessionExecutionItem_substitutionId_fkey"
  FOREIGN KEY ("substitutionId") REFERENCES "WorkoutSubstitution"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
-- NOT VALID preserves historical note-only recordings; it still checks new INSERTs and UPDATEs.
ALTER TABLE "WorkoutSessionExecutionItem"
  ADD CONSTRAINT "WorkoutSessionExecutionItem_substituted_link_required"
  CHECK (
    ("outcome" = 'substituted' AND "substitutionId" IS NOT NULL)
    OR ("outcome" IS DISTINCT FROM 'substituted' AND "substitutionId" IS NULL)
  ) NOT VALID;

-- Protect the relational identity even for direct SQL writers (the API also checks
-- the current status/permission and serializes with the WorkoutDay lock).
CREATE OR REPLACE FUNCTION "issue404_guard_executed_replacement"() RETURNS trigger AS $$
BEGIN
  IF NEW."substitutionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "WorkoutSubstitution" s
    JOIN "WorkoutSessionExecution" e ON e."id" = NEW."executionId"
    WHERE s."id" = NEW."substitutionId"
      AND s."kind" = 'exercise'
      AND s."workoutDayId" = e."workoutDayId"
      AND s."originalUnitId" = NEW."plannedUnitId"
      AND s."contractId" = e."contractId"
      AND s."alunoId" = e."alunoId"
  ) THEN
    RAISE EXCEPTION 'Execution substitution must match the original day, exercise, student and contract'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "issue404_execution_replacement_identity"
  BEFORE INSERT OR UPDATE OF "executionId", "plannedUnitId", "outcome", "substitutionId"
  ON "WorkoutSessionExecutionItem"
  FOR EACH ROW EXECUTE FUNCTION "issue404_guard_executed_replacement"();
