-- Issue #316 - persistent, versioned consolidated prescription assembly.
-- Additive migration: existing workout, plan and execution tables are not modified.

CREATE TABLE "ConsolidatedPrescription" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "currentVersion" INTEGER NOT NULL DEFAULT 1,
  "currentStatus" TEXT NOT NULL DEFAULT 'draft',
  "createdByProfessorId" TEXT NOT NULL,
  "updatedByProfessorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsolidatedPrescription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsolidatedPrescription_status_check"
    CHECK ("currentStatus" IN ('draft','ready_for_review','approved','released','blocked','archived')),
  CONSTRAINT "ConsolidatedPrescription_currentVersion_check" CHECK ("currentVersion" >= 1),
  CONSTRAINT "ConsolidatedPrescription_contract_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescription_aluno_fkey"
    FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescription_createdByProfessor_fkey"
    FOREIGN KEY ("createdByProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescription_updatedByProfessor_fkey"
    FOREIGN KEY ("updatedByProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ConsolidatedPrescription_contract_aluno_key"
  ON "ConsolidatedPrescription"("contractId", "alunoId");
CREATE INDEX "ConsolidatedPrescription_contract_aluno_status_idx"
  ON "ConsolidatedPrescription"("contractId", "alunoId", "currentStatus");
CREATE INDEX "ConsolidatedPrescription_updatedAt_idx"
  ON "ConsolidatedPrescription"("updatedAt");

CREATE TABLE "ConsolidatedPrescriptionVersion" (
  "id" TEXT NOT NULL,
  "assemblyId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "previousVersionId" TEXT,
  "status" TEXT NOT NULL,
  "responsibleProfessorId" TEXT NOT NULL,
  "technicalObservation" TEXT,
  "professorJustification" TEXT NOT NULL,
  "studentInstruction" TEXT,
  "reviewedByProfessorId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "approvedByProfessorId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "blockedByProfessorId" TEXT,
  "blockedAt" TIMESTAMP(3),
  "blockReason" TEXT,
  "createdByProfessorId" TEXT NOT NULL,
  "conflicts" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsolidatedPrescriptionVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsolidatedPrescriptionVersion_status_check"
    CHECK ("status" IN ('draft','ready_for_review','approved','released','blocked','archived')),
  CONSTRAINT "ConsolidatedPrescriptionVersion_version_check" CHECK ("version" >= 1),
  CONSTRAINT "ConsolidatedPrescriptionVersion_assembly_fkey"
    FOREIGN KEY ("assemblyId") REFERENCES "ConsolidatedPrescription"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionVersion_previous_fkey"
    FOREIGN KEY ("previousVersionId") REFERENCES "ConsolidatedPrescriptionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionVersion_contract_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionVersion_aluno_fkey"
    FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionVersion_responsibleProfessor_fkey"
    FOREIGN KEY ("responsibleProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionVersion_reviewedByProfessor_fkey"
    FOREIGN KEY ("reviewedByProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionVersion_approvedByProfessor_fkey"
    FOREIGN KEY ("approvedByProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionVersion_blockedByProfessor_fkey"
    FOREIGN KEY ("blockedByProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionVersion_createdByProfessor_fkey"
    FOREIGN KEY ("createdByProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ConsolidatedPrescriptionVersion_assembly_version_key"
  ON "ConsolidatedPrescriptionVersion"("assemblyId", "version");
CREATE INDEX "ConsolidatedPrescriptionVersion_contract_aluno_createdAt_idx"
  ON "ConsolidatedPrescriptionVersion"("contractId", "alunoId", "createdAt");
CREATE INDEX "ConsolidatedPrescriptionVersion_contract_aluno_status_idx"
  ON "ConsolidatedPrescriptionVersion"("contractId", "alunoId", "status");
CREATE INDEX "ConsolidatedPrescriptionVersion_previousVersion_idx"
  ON "ConsolidatedPrescriptionVersion"("previousVersionId");
CREATE INDEX "ConsolidatedPrescriptionVersion_responsibleProfessor_idx"
  ON "ConsolidatedPrescriptionVersion"("responsibleProfessorId");

CREATE TABLE "ConsolidatedPrescriptionCapacityBlock" (
  "id" TEXT NOT NULL,
  "assemblyVersionId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "capacityPrescriptionVersionId" TEXT NOT NULL,
  "capacity" TEXT NOT NULL,
  "capacityVersion" INTEGER NOT NULL,
  "capacityStatus" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsolidatedPrescriptionCapacityBlock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsolidatedPrescriptionCapacityBlock_capacity_check"
    CHECK ("capacity" IN ('resisted','flexibility','cyclic','balance')),
  CONSTRAINT "ConsolidatedPrescriptionCapacityBlock_status_check"
    CHECK ("capacityStatus" IN ('planned','active','adjusting','suspended','finished')),
  CONSTRAINT "ConsolidatedPrescriptionCapacityBlock_version_check" CHECK ("capacityVersion" >= 1),
  CONSTRAINT "ConsolidatedPrescriptionCapacityBlock_position_check" CHECK ("position" >= 0),
  CONSTRAINT "ConsolidatedPrescriptionCapacityBlock_assemblyVersion_fkey"
    FOREIGN KEY ("assemblyVersionId") REFERENCES "ConsolidatedPrescriptionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionCapacityBlock_capacityVersion_fkey"
    FOREIGN KEY ("capacityPrescriptionVersionId") REFERENCES "CapacityPrescriptionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ConsolidatedPrescriptionCapacityBlock_version_capacity_key"
  ON "ConsolidatedPrescriptionCapacityBlock"("assemblyVersionId", "capacity");
CREATE INDEX "ConsolidatedPrescriptionCapacityBlock_capacityVersion_idx"
  ON "ConsolidatedPrescriptionCapacityBlock"("capacityPrescriptionVersionId");
CREATE INDEX "ConsolidatedPrescriptionCapacityBlock_contract_aluno_idx"
  ON "ConsolidatedPrescriptionCapacityBlock"("contractId", "alunoId");

CREATE TABLE "ConsolidatedPrescriptionDataRef" (
  "id" TEXT NOT NULL,
  "assemblyVersionId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "label" TEXT,
  "assessedAt" TIMESTAMP(3),
  "origin" TEXT,
  "sourceVersion" TEXT,
  "responsibleProfessorId" TEXT,
  "context" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsolidatedPrescriptionDataRef_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsolidatedPrescriptionDataRef_role_check"
    CHECK ("role" IN ('capacity_source','assessment','routine','manual_observation','exercise_substitution')),
  CONSTRAINT "ConsolidatedPrescriptionDataRef_assemblyVersion_fkey"
    FOREIGN KEY ("assemblyVersionId") REFERENCES "ConsolidatedPrescriptionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionDataRef_responsibleProfessor_fkey"
    FOREIGN KEY ("responsibleProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ConsolidatedPrescriptionDataRef_version_idx"
  ON "ConsolidatedPrescriptionDataRef"("assemblyVersionId");
CREATE INDEX "ConsolidatedPrescriptionDataRef_source_idx"
  ON "ConsolidatedPrescriptionDataRef"("sourceType", "sourceId");

-- Database-level tenant/student guards complement service filtering and close direct-write races.
CREATE OR REPLACE FUNCTION "validate_consolidated_prescription_scope"()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Aluno" a
    WHERE a."id" = NEW."alunoId" AND a."contractId" = NEW."contractId"
  ) THEN
    RAISE EXCEPTION 'consolidated prescription aluno outside contract' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "Professor" p
    WHERE p."id" = NEW."createdByProfessorId" AND p."contractId" = NEW."contractId"
  ) OR NOT EXISTS (
    SELECT 1 FROM "Professor" p
    WHERE p."id" = NEW."updatedByProfessorId" AND p."contractId" = NEW."contractId"
  ) THEN
    RAISE EXCEPTION 'consolidated prescription professor outside contract' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConsolidatedPrescription_scope_guard"
BEFORE INSERT OR UPDATE ON "ConsolidatedPrescription"
FOR EACH ROW EXECUTE FUNCTION "validate_consolidated_prescription_scope"();

CREATE OR REPLACE FUNCTION "validate_consolidated_prescription_version_scope"()
RETURNS TRIGGER AS $$
DECLARE
  parent_contract TEXT;
  parent_aluno TEXT;
BEGIN
  SELECT cp."contractId", cp."alunoId"
    INTO parent_contract, parent_aluno
  FROM "ConsolidatedPrescription" cp
  WHERE cp."id" = NEW."assemblyId";

  IF parent_contract IS NULL OR parent_contract <> NEW."contractId" OR parent_aluno <> NEW."alunoId" THEN
    RAISE EXCEPTION 'consolidated prescription version outside assembly scope' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "Professor" p
    WHERE p."id" = NEW."responsibleProfessorId" AND p."contractId" = NEW."contractId"
  ) OR NOT EXISTS (
    SELECT 1 FROM "Professor" p
    WHERE p."id" = NEW."createdByProfessorId" AND p."contractId" = NEW."contractId"
  ) THEN
    RAISE EXCEPTION 'consolidated prescription version professor outside contract' USING ERRCODE = '23514';
  END IF;

  IF NEW."reviewedByProfessorId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Professor" p WHERE p."id" = NEW."reviewedByProfessorId" AND p."contractId" = NEW."contractId"
  ) THEN
    RAISE EXCEPTION 'review professor outside contract' USING ERRCODE = '23514';
  END IF;

  IF NEW."approvedByProfessorId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Professor" p WHERE p."id" = NEW."approvedByProfessorId" AND p."contractId" = NEW."contractId"
  ) THEN
    RAISE EXCEPTION 'approval professor outside contract' USING ERRCODE = '23514';
  END IF;

  IF NEW."blockedByProfessorId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Professor" p WHERE p."id" = NEW."blockedByProfessorId" AND p."contractId" = NEW."contractId"
  ) THEN
    RAISE EXCEPTION 'blocking professor outside contract' USING ERRCODE = '23514';
  END IF;

  IF NEW."previousVersionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ConsolidatedPrescriptionVersion" pv
    WHERE pv."id" = NEW."previousVersionId" AND pv."assemblyId" = NEW."assemblyId"
  ) THEN
    RAISE EXCEPTION 'previous consolidated version outside assembly' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConsolidatedPrescriptionVersion_scope_guard"
BEFORE INSERT OR UPDATE ON "ConsolidatedPrescriptionVersion"
FOR EACH ROW EXECUTE FUNCTION "validate_consolidated_prescription_version_scope"();

CREATE OR REPLACE FUNCTION "validate_consolidated_capacity_block_scope"()
RETURNS TRIGGER AS $$
DECLARE
  assembly_contract TEXT;
  assembly_aluno TEXT;
  capacity_contract TEXT;
  capacity_aluno TEXT;
  resolved_capacity TEXT;
  resolved_version INTEGER;
  resolved_status TEXT;
BEGIN
  SELECT v."contractId", v."alunoId"
    INTO assembly_contract, assembly_aluno
  FROM "ConsolidatedPrescriptionVersion" v
  WHERE v."id" = NEW."assemblyVersionId";

  SELECT cv."contractId", cv."alunoId", cv."capacity", cv."version", cv."status"
    INTO capacity_contract, capacity_aluno, resolved_capacity, resolved_version, resolved_status
  FROM "CapacityPrescriptionVersion" cv
  WHERE cv."id" = NEW."capacityPrescriptionVersionId";

  IF assembly_contract IS NULL OR capacity_contract IS NULL
     OR NEW."contractId" <> assembly_contract OR NEW."alunoId" <> assembly_aluno
     OR capacity_contract <> assembly_contract OR capacity_aluno <> assembly_aluno THEN
    RAISE EXCEPTION 'capacity version outside consolidated assembly scope' USING ERRCODE = '23514';
  END IF;

  IF NEW."capacity" <> resolved_capacity
     OR NEW."capacityVersion" <> resolved_version
     OR NEW."capacityStatus" <> resolved_status THEN
    RAISE EXCEPTION 'capacity snapshot does not match canonical version' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConsolidatedPrescriptionCapacityBlock_scope_guard"
BEFORE INSERT OR UPDATE ON "ConsolidatedPrescriptionCapacityBlock"
FOR EACH ROW EXECUTE FUNCTION "validate_consolidated_capacity_block_scope"();

CREATE OR REPLACE FUNCTION "validate_consolidated_data_ref_scope"()
RETURNS TRIGGER AS $$
DECLARE
  assembly_contract TEXT;
BEGIN
  IF NEW."responsibleProfessorId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT v."contractId" INTO assembly_contract
  FROM "ConsolidatedPrescriptionVersion" v
  WHERE v."id" = NEW."assemblyVersionId";

  IF assembly_contract IS NULL OR NOT EXISTS (
    SELECT 1 FROM "Professor" p
    WHERE p."id" = NEW."responsibleProfessorId" AND p."contractId" = assembly_contract
  ) THEN
    RAISE EXCEPTION 'data reference professor outside contract' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConsolidatedPrescriptionDataRef_scope_guard"
BEFORE INSERT OR UPDATE ON "ConsolidatedPrescriptionDataRef"
FOR EACH ROW EXECUTE FUNCTION "validate_consolidated_data_ref_scope"();
