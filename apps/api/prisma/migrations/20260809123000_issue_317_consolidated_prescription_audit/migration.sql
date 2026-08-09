-- Issue #317 - authoritative workflow audit for consolidated prescriptions.
-- Additive and append-only: no historical consolidated prescription data is rewritten.

CREATE TABLE "ConsolidatedPrescriptionAuditEvent" (
  "id" TEXT NOT NULL,
  "assemblyId" TEXT NOT NULL,
  "assemblyVersionId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "actorProfessorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previousVersion" INTEGER,
  "newVersion" INTEGER NOT NULL,
  "previousStatus" TEXT,
  "newStatus" TEXT NOT NULL,
  "reason" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsolidatedPrescriptionAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsolidatedPrescriptionAuditEvent_action_check"
    CHECK ("action" IN ('created','composition_updated','sent_for_review','approved','blocked','blocked_by_conflict','unblocked','revision_created')),
  CONSTRAINT "ConsolidatedPrescriptionAuditEvent_previousVersion_check"
    CHECK ("previousVersion" IS NULL OR "previousVersion" >= 1),
  CONSTRAINT "ConsolidatedPrescriptionAuditEvent_newVersion_check" CHECK ("newVersion" >= 1),
  CONSTRAINT "ConsolidatedPrescriptionAuditEvent_previousStatus_check"
    CHECK ("previousStatus" IS NULL OR "previousStatus" IN ('draft','ready_for_review','approved','released','blocked','archived')),
  CONSTRAINT "ConsolidatedPrescriptionAuditEvent_newStatus_check"
    CHECK ("newStatus" IN ('draft','ready_for_review','approved','released','blocked','archived')),
  CONSTRAINT "ConsolidatedPrescriptionAuditEvent_assembly_fkey"
    FOREIGN KEY ("assemblyId") REFERENCES "ConsolidatedPrescription"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionAuditEvent_version_fkey"
    FOREIGN KEY ("assemblyVersionId") REFERENCES "ConsolidatedPrescriptionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionAuditEvent_contract_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionAuditEvent_aluno_fkey"
    FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsolidatedPrescriptionAuditEvent_actorProfessor_fkey"
    FOREIGN KEY ("actorProfessorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ConsolidatedPrescriptionAuditEvent_assembly_createdAt_idx"
  ON "ConsolidatedPrescriptionAuditEvent"("assemblyId", "createdAt");
CREATE INDEX "ConsolidatedPrescriptionAuditEvent_contract_aluno_createdAt_idx"
  ON "ConsolidatedPrescriptionAuditEvent"("contractId", "alunoId", "createdAt");
CREATE INDEX "ConsolidatedPrescriptionAuditEvent_actor_createdAt_idx"
  ON "ConsolidatedPrescriptionAuditEvent"("actorProfessorId", "createdAt");

CREATE OR REPLACE FUNCTION "validate_consolidated_prescription_audit_scope"()
RETURNS TRIGGER AS $$
DECLARE
  assembly_contract TEXT;
  assembly_aluno TEXT;
  version_assembly TEXT;
  version_number INTEGER;
BEGIN
  SELECT cp."contractId", cp."alunoId"
    INTO assembly_contract, assembly_aluno
  FROM "ConsolidatedPrescription" cp
  WHERE cp."id" = NEW."assemblyId";

  SELECT v."assemblyId", v."version"
    INTO version_assembly, version_number
  FROM "ConsolidatedPrescriptionVersion" v
  WHERE v."id" = NEW."assemblyVersionId";

  IF assembly_contract IS NULL
     OR NEW."contractId" <> assembly_contract
     OR NEW."alunoId" <> assembly_aluno
     OR version_assembly IS NULL
     OR version_assembly <> NEW."assemblyId"
     OR version_number <> NEW."newVersion" THEN
    RAISE EXCEPTION 'consolidated prescription audit outside aggregate scope' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "Professor" p
    WHERE p."id" = NEW."actorProfessorId" AND p."contractId" = NEW."contractId"
  ) THEN
    RAISE EXCEPTION 'consolidated prescription audit actor outside contract' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConsolidatedPrescriptionAuditEvent_scope_guard"
BEFORE INSERT ON "ConsolidatedPrescriptionAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "validate_consolidated_prescription_audit_scope"();
