-- Issue #382: lifecycle, explicit completion requirements and correction audit for Anthropometry.
--
-- This migration deliberately does NOT infer completion requirements from segment type,
-- import flags or legacy spreadsheet presence. Existing assessments are preserved as
-- completed legacy history so configuration changes cannot invalidate them retroactively.

CREATE TABLE "AnthropometrySegmentCompletionRequirement" (
    "segmentId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "configuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnthropometrySegmentCompletionRequirement_pkey" PRIMARY KEY ("segmentId"),
    CONSTRAINT "AnthropometrySegmentCompletionRequirement_version_check" CHECK ("version" > 0),
    CONSTRAINT "AnthropometrySegmentCompletionRequirement_segment_fkey"
      FOREIGN KEY ("segmentId") REFERENCES "AnthropometrySegment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnthropometrySegmentCompletionRequirement_contract_fkey"
      FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AnthropometrySegmentCompletionRequirement_contract_required_idx"
  ON "AnthropometrySegmentCompletionRequirement"("contractId", "isRequired");

CREATE TABLE "AnthropometryAssessmentLifecycle" (
    "assessmentId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "requirementsSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnthropometryAssessmentLifecycle_pkey" PRIMARY KEY ("assessmentId"),
    CONSTRAINT "AnthropometryAssessmentLifecycle_status_check" CHECK ("status" IN ('DRAFT', 'COMPLETED')),
    CONSTRAINT "AnthropometryAssessmentLifecycle_assessment_fkey"
      FOREIGN KEY ("assessmentId") REFERENCES "AnthropometryAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnthropometryAssessmentLifecycle_contract_fkey"
      FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnthropometryAssessmentLifecycle_aluno_fkey"
      FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AnthropometryAssessmentLifecycle_contract_aluno_status_idx"
  ON "AnthropometryAssessmentLifecycle"("contractId", "alunoId", "status");

-- Before #382 an AnthropometryAssessment represented a saved historical record and there
-- was no draft/completed state. Preserve those records as immutable completed history.
INSERT INTO "AnthropometryAssessmentLifecycle" (
  "assessmentId", "contractId", "alunoId", "status", "completedAt", "requirementsSnapshot"
)
SELECT
  a."id",
  a."contractId",
  a."alunoId",
  'COMPLETED',
  a."updatedAt",
  jsonb_build_object(
    'legacy', true,
    'configurationDefined', false,
    'requiredSegments', '[]'::jsonb,
    'capturedAt', a."updatedAt"
  )
FROM "AnthropometryAssessment" a
ON CONFLICT ("assessmentId") DO NOTHING;

CREATE TABLE "AnthropometryAssessmentCorrection" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorProfessorId" TEXT,
    "reason" TEXT NOT NULL,
    "beforeSnapshot" JSONB NOT NULL,
    "afterSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnthropometryAssessmentCorrection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AnthropometryAssessmentCorrection_reason_check" CHECK (length(btrim("reason")) > 0),
    CONSTRAINT "AnthropometryAssessmentCorrection_assessment_fkey"
      FOREIGN KEY ("assessmentId") REFERENCES "AnthropometryAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnthropometryAssessmentCorrection_contract_fkey"
      FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnthropometryAssessmentCorrection_aluno_fkey"
      FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnthropometryAssessmentCorrection_actor_user_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AnthropometryAssessmentCorrection_actor_professor_fkey"
      FOREIGN KEY ("actorProfessorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AnthropometryAssessmentCorrection_assessment_created_idx"
  ON "AnthropometryAssessmentCorrection"("assessmentId", "createdAt");
CREATE INDEX "AnthropometryAssessmentCorrection_contract_aluno_created_idx"
  ON "AnthropometryAssessmentCorrection"("contractId", "alunoId", "createdAt");
