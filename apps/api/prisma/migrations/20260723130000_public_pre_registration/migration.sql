-- Issue #271: authenticated, resumable public pre-registration.
-- Personal data remains canonical in StudentProfile; these columns store only process metadata.
ALTER TABLE "StudentOnboardingProcess"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "currentStep" TEXT NOT NULL DEFAULT 'IDENTIFICATION',
  ADD COLUMN "claimRole" TEXT NOT NULL DEFAULT 'STUDENT',
  ADD COLUMN "privacyAcceptedIp" TEXT,
  ADD COLUMN "privacyAcceptedUserAgent" TEXT;

ALTER TABLE "StudentOnboardingProcess"
  ADD CONSTRAINT "StudentOnboardingProcess_currentStep_check"
  CHECK ("currentStep" IN ('IDENTIFICATION', 'CONTACT', 'ADDRESS', 'GUARDIAN', 'PRIVACY')),
  ADD CONSTRAINT "StudentOnboardingProcess_claimRole_check"
  CHECK ("claimRole" IN ('STUDENT', 'GUARDIAN'));

-- Explicit authorization relationship for legal guardians. Textual guardian fields
-- remain cadastral data and never grant access by themselves.
CREATE TABLE "PreRegistrationGuardianAuthorization" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "guardianUserId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'PRE_REGISTRATION',
  "relationship" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "validatedAt" TIMESTAMP(3),
  "validatedByUserId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revokedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PreRegistrationGuardianAuthorization_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PreRegistrationGuardianAuthorization_status_check"
    CHECK ("status" IN ('PENDING', 'ACTIVE', 'REVOKED')),
  CONSTRAINT "PreRegistrationGuardianAuthorization_purpose_check"
    CHECK ("purpose" = 'PRE_REGISTRATION'),
  CONSTRAINT "PreRegistrationGuardianAuthorization_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PreRegistrationGuardianAuthorization_alunoId_fkey"
    FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PreRegistrationGuardianAuthorization_guardianUserId_fkey"
    FOREIGN KEY ("guardianUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PreRegistrationGuardianAuthorization_validatedByUserId_fkey"
    FOREIGN KEY ("validatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PreRegistrationGuardianAuthorization_revokedByUserId_fkey"
    FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PreRegistrationGuardianAuthorization_aluno_guardian_purpose_key"
  ON "PreRegistrationGuardianAuthorization"("alunoId", "guardianUserId", "purpose");

CREATE UNIQUE INDEX "PreRegistrationGuardianAuthorization_one_active_per_student"
  ON "PreRegistrationGuardianAuthorization"("alunoId", "purpose")
  WHERE "status" = 'ACTIVE';

CREATE INDEX "PreRegistrationGuardianAuthorization_guardian_contract_idx"
  ON "PreRegistrationGuardianAuthorization"("guardianUserId", "contractId", "status");

CREATE INDEX "PreRegistrationGuardianAuthorization_aluno_contract_idx"
  ON "PreRegistrationGuardianAuthorization"("alunoId", "contractId", "status");
