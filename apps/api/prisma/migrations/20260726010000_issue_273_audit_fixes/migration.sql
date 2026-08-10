-- Issue #273 audit remediation: consent lifecycle, session concurrency and legacy reconciliation.

ALTER TYPE "StudentLifecycleEventType" ADD VALUE IF NOT EXISTS 'PARQ_CONSENT_ACCEPTED';
ALTER TYPE "StudentLifecycleEventType" ADD VALUE IF NOT EXISTS 'PARQ_CONSENT_REVOKED';

ALTER TABLE "StudentOnboardingProcess"
  ADD COLUMN IF NOT EXISTS "parqConsentVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "parqConsentNoticeVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "parqConsentAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "parqConsentAcceptedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "parqConsentRevokedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "parqConsentRevokedByUserId" TEXT;

-- Preserve consent already evidenced by a resumable server-side draft. No
-- acceptance, actor or timestamp is inferred for completed submissions.
UPDATE "StudentOnboardingProcess" onboarding
SET "parqConsentNoticeVersion" = draft."consentNoticeVersion",
    "parqConsentAcceptedAt" = draft."consentAcceptedAt",
    "parqConsentAcceptedByUserId" = draft."consentAcceptedByUserId",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "StudentParqDraft" draft
WHERE draft."alunoId" = onboarding."alunoId"
  AND draft."contractId" = onboarding."contractId"
  AND onboarding."parqConsentAcceptedAt" IS NULL;

DO $$ BEGIN
  ALTER TABLE "StudentOnboardingProcess"
    ADD CONSTRAINT "StudentOnboardingProcess_parqConsentVersion_check"
    CHECK ("parqConsentVersion" >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StudentOnboardingProcess"
    ADD CONSTRAINT "StudentOnboardingProcess_parqConsentState_check"
    CHECK (
      (
        "parqConsentNoticeVersion" IS NULL
        AND "parqConsentAcceptedAt" IS NULL
        AND "parqConsentAcceptedByUserId" IS NULL
        AND "parqConsentRevokedAt" IS NULL
        AND "parqConsentRevokedByUserId" IS NULL
      )
      OR
      (
        "parqConsentNoticeVersion" IS NOT NULL
        AND "parqConsentAcceptedAt" IS NOT NULL
        AND "parqConsentAcceptedByUserId" IS NOT NULL
        AND (
          ("parqConsentRevokedAt" IS NULL AND "parqConsentRevokedByUserId" IS NULL)
          OR
          ("parqConsentRevokedAt" IS NOT NULL AND "parqConsentRevokedByUserId" IS NOT NULL)
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StudentOnboardingProcess"
    ADD CONSTRAINT "StudentOnboardingProcess_parqConsentAcceptedBy_fkey"
    FOREIGN KEY ("parqConsentAcceptedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StudentOnboardingProcess"
    ADD CONSTRAINT "StudentOnboardingProcess_parqConsentRevokedBy_fkey"
    FOREIGN KEY ("parqConsentRevokedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Any legacy row still marked importable must contain actual JSON booleans.
UPDATE "StudentParqLegacyRecord"
SET "migrationStatus" = 'INCOMPATIBLE',
    "migrationReason" = 'non_boolean_answer',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "migrationStatus" = 'IMPORTABLE'
  AND NOT (
    jsonb_typeof("rawResponses"->'q1') = 'boolean'
    AND jsonb_typeof("rawResponses"->'q2') = 'boolean'
    AND jsonb_typeof("rawResponses"->'q3') = 'boolean'
    AND jsonb_typeof("rawResponses"->'q4') = 'boolean'
    AND jsonb_typeof("rawResponses"->'q5') = 'boolean'
    AND jsonb_typeof("rawResponses"->'q6') = 'boolean'
    AND jsonb_typeof("rawResponses"->'q7') = 'boolean'
    AND jsonb_typeof("rawResponses"->'q8') = 'boolean'
  );

-- Handle disagreement between a legacy source and an existing canonical
-- submission at the same evidenced instant without selecting by updatedAt.
UPDATE "StudentParqLegacyRecord" legacy
SET "migrationStatus" = 'DIVERGENT',
    "migrationReason" = 'conflicts_with_canonical_submission_same_observed_at',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE legacy."migrationStatus" = 'IMPORTABLE'
  AND legacy."observedAt" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "StudentParqSubmission" submission
    WHERE submission."alunoId" = legacy."alunoId"
      AND submission."contractId" = legacy."contractId"
      AND submission."submittedAt" = legacy."observedAt"
      AND submission."catalogVersion" IN ('parq-2026-01', 'parq-legacy-8-declaration-v1')
      AND submission."declarationAccepted" = true
      AND submission."responses" <> (legacy."rawResponses" - 'q8')
  );
