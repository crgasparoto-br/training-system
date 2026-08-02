-- Issue #246: historical and auditable ADPT foundation.
-- Clinical protocols are intentionally not enabled by this migration.

CREATE TABLE "AdipometryProtocol" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "definitionSnapshot" JSONB NOT NULL,
    "reference" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdipometryProtocol_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdipometryProtocol_status_check" CHECK ("status" IN ('DRAFT', 'APPROVED', 'DISABLED')),
    CONSTRAINT "AdipometryProtocol_approval_check" CHECK (
      ("status" <> 'APPROVED') OR ("approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL AND "reference" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "AdipometryProtocol_code_version_key"
  ON "AdipometryProtocol"("code", "version");
CREATE INDEX "AdipometryProtocol_status_idx"
  ON "AdipometryProtocol"("status");

CREATE TABLE "AdipometrySequence" (
    "contractId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdipometrySequence_pkey" PRIMARY KEY ("contractId", "alunoId"),
    CONSTRAINT "AdipometrySequence_lastValue_check" CHECK ("lastValue" >= 0)
);

CREATE TABLE "AdipometryAssessment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "assessmentDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "weightKg" DECIMAL(8,2),
    "tricepsMm" DECIMAL(8,2),
    "subscapularMm" DECIMAL(8,2),
    "suprailiacMm" DECIMAL(8,2),
    "abdominalMm" DECIMAL(8,2),
    "thighMm" DECIMAL(8,2),
    "skinfoldTotalMm" DECIMAL(8,4),
    "bodyFatPercentage" DECIMAL(8,4),
    "fatMassKg" DECIMAL(8,4),
    "leanMassKg" DECIMAL(8,4),
    "protocolId" TEXT,
    "protocolCode" TEXT,
    "protocolVersion" INTEGER,
    "calculationSnapshot" JSONB,
    "anthropometryAssessmentId" TEXT,
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "correctsAssessmentId" TEXT,
    "correctedByAssessmentId" TEXT,
    "correctionReason" TEXT,
    "correctionAuthorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdipometryAssessment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdipometryAssessment_status_check" CHECK ("status" IN ('DRAFT', 'COMPLETED')),
    CONSTRAINT "AdipometryAssessment_sequence_check" CHECK ("sequenceNumber" > 0),
    CONSTRAINT "AdipometryAssessment_completion_check" CHECK (
      ("status" = 'DRAFT' AND "completedAt" IS NULL)
      OR
      ("status" = 'COMPLETED'
       AND "completedAt" IS NOT NULL
       AND "protocolId" IS NOT NULL
       AND "protocolCode" IS NOT NULL
       AND "protocolVersion" IS NOT NULL
       AND "calculationSnapshot" IS NOT NULL
       AND "weightKg" IS NOT NULL
       AND "tricepsMm" IS NOT NULL
       AND "subscapularMm" IS NOT NULL
       AND "suprailiacMm" IS NOT NULL
       AND "abdominalMm" IS NOT NULL
       AND "thighMm" IS NOT NULL
       AND "skinfoldTotalMm" IS NOT NULL
       AND "bodyFatPercentage" IS NOT NULL
       AND "fatMassKg" IS NOT NULL
       AND "leanMassKg" IS NOT NULL)
    ),
    CONSTRAINT "AdipometryAssessment_correction_check" CHECK (
      ("correctsAssessmentId" IS NULL AND "correctionReason" IS NULL AND "correctionAuthorUserId" IS NULL)
      OR
      ("correctsAssessmentId" IS NOT NULL AND length(trim("correctionReason")) > 0 AND "correctionAuthorUserId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "AdipometryAssessment_contractId_alunoId_sequenceNumber_key"
  ON "AdipometryAssessment"("contractId", "alunoId", "sequenceNumber");
CREATE UNIQUE INDEX "AdipometryAssessment_contractId_alunoId_code_key"
  ON "AdipometryAssessment"("contractId", "alunoId", "code");
CREATE UNIQUE INDEX "AdipometryAssessment_correctsAssessmentId_key"
  ON "AdipometryAssessment"("correctsAssessmentId") WHERE "correctsAssessmentId" IS NOT NULL;
CREATE UNIQUE INDEX "AdipometryAssessment_correctedByAssessmentId_key"
  ON "AdipometryAssessment"("correctedByAssessmentId") WHERE "correctedByAssessmentId" IS NOT NULL;
CREATE INDEX "AdipometryAssessment_contractId_alunoId_assessmentDate_idx"
  ON "AdipometryAssessment"("contractId", "alunoId", "assessmentDate" DESC);
CREATE INDEX "AdipometryAssessment_professorId_idx"
  ON "AdipometryAssessment"("professorId");
CREATE INDEX "AdipometryAssessment_contractId_status_idx"
  ON "AdipometryAssessment"("contractId", "status");
CREATE INDEX "AdipometryAssessment_protocolCode_protocolVersion_idx"
  ON "AdipometryAssessment"("protocolCode", "protocolVersion");

CREATE TABLE "AdipometryAuditEvent" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "beforeSnapshot" JSONB,
    "afterSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdipometryAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdipometryAuditEvent_contractId_assessmentId_createdAt_idx"
  ON "AdipometryAuditEvent"("contractId", "assessmentId", "createdAt" DESC);
CREATE INDEX "AdipometryAuditEvent_actorUserId_idx"
  ON "AdipometryAuditEvent"("actorUserId");

ALTER TABLE "AdipometryProtocol"
  ADD CONSTRAINT "AdipometryProtocol_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometrySequence"
  ADD CONSTRAINT "AdipometrySequence_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdipometrySequence"
  ADD CONSTRAINT "AdipometrySequence_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_professorId_fkey"
  FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_protocolId_fkey"
  FOREIGN KEY ("protocolId") REFERENCES "AdipometryProtocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_anthropometryAssessmentId_fkey"
  FOREIGN KEY ("anthropometryAssessmentId") REFERENCES "AnthropometryAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_correctsAssessmentId_fkey"
  FOREIGN KEY ("correctsAssessmentId") REFERENCES "AdipometryAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_correctedByAssessmentId_fkey"
  FOREIGN KEY ("correctedByAssessmentId") REFERENCES "AdipometryAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_correctionAuthorUserId_fkey"
  FOREIGN KEY ("correctionAuthorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryAuditEvent"
  ADD CONSTRAINT "AdipometryAuditEvent_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryAuditEvent"
  ADD CONSTRAINT "AdipometryAuditEvent_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "AdipometryAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryAuditEvent"
  ADD CONSTRAINT "AdipometryAuditEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed only unavailable protocols. No clinical calculation is enabled.
INSERT INTO "AdipometryProtocol" (
  "id", "code", "version", "name", "status", "definitionSnapshot", "createdAt", "updatedAt"
) VALUES
  ('adpt_protocol_guedes_adult_v1', 'GUEDES_ADULT', 1, 'Guedes — adultos', 'DRAFT',
   '{"availability":"blocked","reason":"Clinical formula, population, limits, rounding, reference and test vectors are pending approval"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('adpt_protocol_slaughter_v1', 'SLAUGHTER', 1, 'Slaughter', 'DISABLED',
   '{"availability":"blocked","reason":"Variants and applicability criteria are incomplete"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
