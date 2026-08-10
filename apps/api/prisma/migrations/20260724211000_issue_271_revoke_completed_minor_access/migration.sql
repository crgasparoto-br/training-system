-- Issue #271 audit remediation: revoking a guardian authorization must remove
-- access to the minor's pre-registration even when the basic flow was already
-- completed. The authorization change and claim invalidation remain atomic.
CREATE OR REPLACE FUNCTION bump_pre_registration_version_on_guardian_authorization_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status"
     OR NEW."guardianUserId" IS DISTINCT FROM OLD."guardianUserId"
     OR NEW."contractId" IS DISTINCT FROM OLD."contractId" THEN
    UPDATE "StudentOnboardingProcess" AS onboarding
    SET "version" = onboarding."version" + 1,
        "claimedByUserId" = CASE
          WHEN onboarding."claimRole" = 'GUARDIAN'
               AND (
                 (
                   onboarding."claimedByUserId" = OLD."guardianUserId"
                   AND (
                     NEW."guardianUserId" IS DISTINCT FROM OLD."guardianUserId"
                     OR NEW."status" <> 'ACTIVE'
                   )
                 )
                 OR (
                   onboarding."claimedByUserId" = NEW."guardianUserId"
                   AND NEW."status" <> 'ACTIVE'
                 )
               ) THEN NULL
          WHEN onboarding."claimRole" = 'STUDENT'
               AND NOT EXISTS (
                 SELECT 1
                 FROM "PreRegistrationGuardianAuthorization" AS active_authorization
                 WHERE active_authorization."alunoId" = NEW."alunoId"
                   AND active_authorization."contractId" = NEW."contractId"
                   AND active_authorization."purpose" = 'PRE_REGISTRATION'
                   AND active_authorization."status" = 'ACTIVE'
               ) THEN NULL
          ELSE onboarding."claimedByUserId"
        END,
        "claimedAt" = CASE
          WHEN onboarding."claimRole" = 'GUARDIAN'
               AND (
                 (
                   onboarding."claimedByUserId" = OLD."guardianUserId"
                   AND (
                     NEW."guardianUserId" IS DISTINCT FROM OLD."guardianUserId"
                     OR NEW."status" <> 'ACTIVE'
                   )
                 )
                 OR (
                   onboarding."claimedByUserId" = NEW."guardianUserId"
                   AND NEW."status" <> 'ACTIVE'
                 )
               ) THEN NULL
          WHEN onboarding."claimRole" = 'STUDENT'
               AND NOT EXISTS (
                 SELECT 1
                 FROM "PreRegistrationGuardianAuthorization" AS active_authorization
                 WHERE active_authorization."alunoId" = NEW."alunoId"
                   AND active_authorization."contractId" = NEW."contractId"
                   AND active_authorization."purpose" = 'PRE_REGISTRATION'
                   AND active_authorization."status" = 'ACTIVE'
               ) THEN NULL
          ELSE onboarding."claimedAt"
        END,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE onboarding."alunoId" = NEW."alunoId"
      AND onboarding."contractId" = NEW."contractId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill only claims that are demonstrably stale because a related
-- authorization is REVOKED. Pending guardian declarations remain claimed so
-- the responsible account can keep the redacted process visible while waiting
-- for independent academy validation.
WITH revoked_minor_processes AS (
  SELECT onboarding."alunoId", onboarding."contractId"
  FROM "StudentOnboardingProcess" AS onboarding
  JOIN "Aluno" AS student
    ON student."id" = onboarding."alunoId"
   AND student."contractId" = onboarding."contractId"
  LEFT JOIN "StudentProfile" AS profile
    ON profile."alunoId" = student."id"
  WHERE onboarding."claimedByUserId" IS NOT NULL
    AND COALESCE(
      CASE
        WHEN COALESCE(profile."identificationData"->>'birthDate', '')
             ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          THEN LEFT(profile."identificationData"->>'birthDate', 10)::date
        ELSE NULL
      END,
      student."birthDate"::date
    ) > (CURRENT_DATE - INTERVAL '18 years')::date
    AND NOT EXISTS (
      SELECT 1
      FROM "PreRegistrationGuardianAuthorization" AS active_authorization
      WHERE active_authorization."alunoId" = onboarding."alunoId"
        AND active_authorization."contractId" = onboarding."contractId"
        AND active_authorization."purpose" = 'PRE_REGISTRATION'
        AND active_authorization."status" = 'ACTIVE'
    )
    AND (
      (
        onboarding."claimRole" = 'GUARDIAN'
        AND EXISTS (
          SELECT 1
          FROM "PreRegistrationGuardianAuthorization" AS revoked_authorization
          WHERE revoked_authorization."alunoId" = onboarding."alunoId"
            AND revoked_authorization."contractId" = onboarding."contractId"
            AND revoked_authorization."guardianUserId" = onboarding."claimedByUserId"
            AND revoked_authorization."purpose" = 'PRE_REGISTRATION'
            AND revoked_authorization."status" = 'REVOKED'
        )
      )
      OR (
        onboarding."claimRole" = 'STUDENT'
        AND EXISTS (
          SELECT 1
          FROM "PreRegistrationGuardianAuthorization" AS revoked_authorization
          WHERE revoked_authorization."alunoId" = onboarding."alunoId"
            AND revoked_authorization."contractId" = onboarding."contractId"
            AND revoked_authorization."purpose" = 'PRE_REGISTRATION'
            AND revoked_authorization."status" = 'REVOKED'
        )
      )
    )
)
UPDATE "StudentOnboardingProcess" AS onboarding
SET "version" = onboarding."version" + 1,
    "claimedByUserId" = NULL,
    "claimedAt" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
FROM revoked_minor_processes AS stale
WHERE onboarding."alunoId" = stale."alunoId"
  AND onboarding."contractId" = stale."contractId";
