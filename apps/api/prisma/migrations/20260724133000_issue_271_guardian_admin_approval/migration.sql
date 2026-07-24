-- Issue #271 audit remediation: a guardian declaration is not authorization.
-- Existing ACTIVE rows validated by the guardian account itself are demoted to
-- PENDING so personal data remains blocked until an independent academy user
-- validates the relationship.
UPDATE "PreRegistrationGuardianAuthorization"
SET "status" = 'PENDING',
    "validatedAt" = NULL,
    "validatedByUserId" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'ACTIVE'
  AND (
    "validatedByUserId" IS NULL
    OR "validatedByUserId" = "guardianUserId"
  );

ALTER TABLE "PreRegistrationGuardianAuthorization"
  ADD CONSTRAINT "PreRegistrationGuardianAuthorization_independent_validation_check"
  CHECK (
    "status" <> 'ACTIVE'
    OR (
      "relationship" IS NOT NULL
      AND btrim("relationship") <> ''
      AND "validatedAt" IS NOT NULL
      AND "validatedByUserId" IS NOT NULL
      AND "validatedByUserId" <> "guardianUserId"
    )
  );
