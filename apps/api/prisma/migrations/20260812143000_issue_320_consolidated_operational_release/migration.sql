-- Issue #320 - controlled release from an exact approved consolidated prescription version
-- to the existing Workout Builder graph. Additive and reversible by application rollback:
-- existing plans/templates/days/exercises/executions are never deleted by this migration.

CREATE TABLE "ConsolidatedPrescriptionOperationalRelease" (
  "id" TEXT NOT NULL,
  "assemblyId" TEXT NOT NULL,
  "sourceAssemblyVersionId" TEXT NOT NULL,
  "sourceAssemblyVersion" INTEGER NOT NULL,
  "releasedAssemblyVersionId" TEXT NOT NULL,
  "releasedAssemblyVersion" INTEGER NOT NULL,
  "contractId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "trainingPlanId" TEXT NOT NULL,
  "workoutTemplateId" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "releasedByProfessorId" TEXT NOT NULL,
  "releasedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsolidatedPrescriptionOperationalRelease_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsolidatedPrescriptionOperationalRelease_sourceVersion_check"
    CHECK ("sourceAssemblyVersion" >= 1),
  CONSTRAINT "ConsolidatedPrescriptionOperationalRelease_releasedVersion_check"
    CHECK ("releasedAssemblyVersion" > "sourceAssemblyVersion"),
  CONSTRAINT "ConsolidatedPrescriptionOperationalRelease_assembly_fkey"
    FOREIGN KEY ("assemblyId") REFERENCES "ConsolidatedPrescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionOperationalRelease_sourceVersion_fkey"
    FOREIGN KEY ("sourceAssemblyVersionId") REFERENCES "ConsolidatedPrescriptionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionOperationalRelease_releasedVersion_fkey"
    FOREIGN KEY ("releasedAssemblyVersionId") REFERENCES "ConsolidatedPrescriptionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionOperationalRelease_contract_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionOperationalRelease_aluno_fkey"
    FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionOperationalRelease_plan_fkey"
    FOREIGN KEY ("trainingPlanId") REFERENCES "TrainingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionOperationalRelease_template_fkey"
    FOREIGN KEY ("workoutTemplateId") REFERENCES "WorkoutTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionOperationalRelease_professor_fkey"
    FOREIGN KEY ("releasedByProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Natural idempotency key: one operational release for one exact approved version.
CREATE UNIQUE INDEX "ConsolidatedPrescriptionOperationalRelease_sourceVersion_key"
  ON "ConsolidatedPrescriptionOperationalRelease"("sourceAssemblyVersionId");
-- A released template cannot be silently reassigned to another consolidated version.
CREATE UNIQUE INDEX "ConsolidatedPrescriptionOperationalRelease_template_key"
  ON "ConsolidatedPrescriptionOperationalRelease"("workoutTemplateId");
CREATE INDEX "ConsolidatedPrescriptionOperationalRelease_contract_aluno_idx"
  ON "ConsolidatedPrescriptionOperationalRelease"("contractId", "alunoId", "releasedAt" DESC);
CREATE INDEX "ConsolidatedPrescriptionOperationalRelease_plan_idx"
  ON "ConsolidatedPrescriptionOperationalRelease"("trainingPlanId");

CREATE OR REPLACE FUNCTION "validate_consolidated_operational_release_scope"()
RETURNS TRIGGER AS $$
DECLARE
  source_row RECORD;
  released_row RECORD;
  plan_aluno TEXT;
  template_plan TEXT;
BEGIN
  SELECT "assemblyId", "contractId", "alunoId", "version", "status"
    INTO source_row
  FROM "ConsolidatedPrescriptionVersion"
  WHERE "id" = NEW."sourceAssemblyVersionId";

  SELECT "assemblyId", "contractId", "alunoId", "version", "status", "previousVersionId"
    INTO released_row
  FROM "ConsolidatedPrescriptionVersion"
  WHERE "id" = NEW."releasedAssemblyVersionId";

  IF source_row."assemblyId" IS NULL OR released_row."assemblyId" IS NULL
     OR source_row."assemblyId" <> NEW."assemblyId"
     OR released_row."assemblyId" <> NEW."assemblyId"
     OR source_row."contractId" <> NEW."contractId"
     OR released_row."contractId" <> NEW."contractId"
     OR source_row."alunoId" <> NEW."alunoId"
     OR released_row."alunoId" <> NEW."alunoId"
     OR source_row."version" <> NEW."sourceAssemblyVersion"
     OR released_row."version" <> NEW."releasedAssemblyVersion"
     OR source_row."status" <> 'approved'
     OR released_row."status" <> 'released'
     OR released_row."previousVersionId" <> NEW."sourceAssemblyVersionId" THEN
    RAISE EXCEPTION 'invalid consolidated operational release version chain' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "ConsolidatedPrescription" cp
    WHERE cp."id" = NEW."assemblyId"
      AND cp."contractId" = NEW."contractId"
      AND cp."alunoId" = NEW."alunoId"
  ) THEN
    RAISE EXCEPTION 'operational release outside consolidated assembly scope' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "Aluno" a
    WHERE a."id" = NEW."alunoId" AND a."contractId" = NEW."contractId"
  ) OR NOT EXISTS (
    SELECT 1 FROM "Professor" p
    WHERE p."id" = NEW."releasedByProfessorId" AND p."contractId" = NEW."contractId"
  ) THEN
    RAISE EXCEPTION 'operational release actor or aluno outside contract' USING ERRCODE = '23514';
  END IF;

  SELECT tp."alunoId" INTO plan_aluno
  FROM "TrainingPlan" tp
  JOIN "Aluno" a ON a."id" = tp."alunoId"
  JOIN "Professor" p ON p."id" = tp."professorId"
  WHERE tp."id" = NEW."trainingPlanId"
    AND a."contractId" = NEW."contractId"
    AND p."contractId" = NEW."contractId";
  IF plan_aluno IS NULL OR plan_aluno <> NEW."alunoId" THEN
    RAISE EXCEPTION 'operational release plan outside aluno scope' USING ERRCODE = '23514';
  END IF;

  SELECT wt."planId" INTO template_plan
  FROM "WorkoutTemplate" wt
  WHERE wt."id" = NEW."workoutTemplateId";
  IF template_plan IS NULL OR template_plan <> NEW."trainingPlanId" THEN
    RAISE EXCEPTION 'operational release template outside plan scope' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConsolidatedPrescriptionOperationalRelease_scope_guard"
BEFORE INSERT OR UPDATE ON "ConsolidatedPrescriptionOperationalRelease"
FOR EACH ROW EXECUTE FUNCTION "validate_consolidated_operational_release_scope"();

-- Release records are append-only audit evidence. Runtime must create a new release for a new
-- consolidated version instead of rewriting actor, target or timestamps in place.
CREATE OR REPLACE FUNCTION "prevent_consolidated_operational_release_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'consolidated operational release is immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConsolidatedPrescriptionOperationalRelease_immutable_guard"
BEFORE UPDATE OR DELETE ON "ConsolidatedPrescriptionOperationalRelease"
FOR EACH ROW EXECUTE FUNCTION "prevent_consolidated_operational_release_mutation"();
