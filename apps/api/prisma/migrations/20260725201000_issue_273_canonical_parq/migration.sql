-- Issue #273: canonical, versioned and resumable PAR-Q.

ALTER TABLE "StudentParqSubmission"
  ADD COLUMN IF NOT EXISTS "catalogVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "positiveCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "legacySourceType" TEXT,
  ADD COLUMN IF NOT EXISTS "legacySourceId" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

UPDATE "StudentParqSubmission"
SET "catalogVersion" = COALESCE("catalogVersion", 'legacy-unknown'),
    "positiveCount" = COALESCE("positiveCount", jsonb_array_length(COALESCE("positiveItems", '[]'::jsonb)))
WHERE "catalogVersion" IS NULL OR "positiveCount" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "StudentParqSubmission_alunoId_idempotencyKey_key"
  ON "StudentParqSubmission"("alunoId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "StudentParqSubmission_legacyOrigin_key"
  ON "StudentParqSubmission"("legacySourceType", "legacySourceId")
  WHERE "legacySourceType" IS NOT NULL AND "legacySourceId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "StudentParqDraft" (
  "id" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "catalogVersion" TEXT NOT NULL,
  "responses" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "version" INTEGER NOT NULL DEFAULT 1,
  "consentNoticeVersion" TEXT NOT NULL,
  "consentAcceptedAt" TIMESTAMP(3) NOT NULL,
  "consentAcceptedByUserId" TEXT NOT NULL,
  "lastSavedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentParqDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentParqDraft_alunoId_key" UNIQUE ("alunoId"),
  CONSTRAINT "StudentParqDraft_version_check" CHECK ("version" >= 1),
  CONSTRAINT "StudentParqDraft_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentParqDraft_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentParqDraft_consentUser_fkey" FOREIGN KEY ("consentAcceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "StudentParqDraft_contractId_lastSavedAt_idx"
  ON "StudentParqDraft"("contractId", "lastSavedAt");

CREATE TABLE IF NOT EXISTS "StudentParqProfessionalReview" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "positiveCount" INTEGER NOT NULL,
  "positiveItems" JSONB NOT NULL,
  "reviewedByProfessorId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentParqProfessionalReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentParqProfessionalReview_submissionId_key" UNIQUE ("submissionId"),
  CONSTRAINT "StudentParqProfessionalReview_status_check" CHECK ("status" IN ('PENDING', 'REVIEWED')),
  CONSTRAINT "StudentParqProfessionalReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "StudentParqSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentParqProfessionalReview_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentParqProfessionalReview_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentParqProfessionalReview_professorId_fkey" FOREIGN KEY ("reviewedByProfessorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "StudentParqProfessionalReview_contract_status_idx"
  ON "StudentParqProfessionalReview"("contractId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "StudentParqProfessionalReview_aluno_created_idx"
  ON "StudentParqProfessionalReview"("alunoId", "createdAt");
