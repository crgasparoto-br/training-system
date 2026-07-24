-- Issue #271 audit remediation: revoking a guardian authorization must remove
-- access to the minor's pre-registration even when the basic flow was already
-- completed. The authorization change and claim invalidation remain atomic.
CREATE OR REPLACE FUNCTION bump_pre_registration_version_on_guardian_authorization_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status"
     OR NEW."guardianUserId" IS DISTINCT FROM OLD."guardianUserId"
     OR NEW."contractId" IS DISTINCT FROM OLD."contractId" THEN
    UPDATE "StudentOnboardingProcess"
    SET "version" = "version" + 1,
        "claimedByUserId" = CASE
          WHEN NEW."status" <> 'ACTIVE' THEN NULL
          WHEN NEW."guardianUserId" IS DISTINCT FROM OLD."guardianUserId"
               AND "claimRole" = 'GUARDIAN' THEN NULL
          ELSE "claimedByUserId"
        END,
        "claimedAt" = CASE
          WHEN NEW."status" <> 'ACTIVE' THEN NULL
          WHEN NEW."guardianUserId" IS DISTINCT FROM OLD."guardianUserId"
               AND "claimRole" = 'GUARDIAN' THEN NULL
          ELSE "claimedAt"
        END,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "alunoId" = NEW."alunoId"
      AND "contractId" = NEW."contractId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill rows that may have been completed and retained a claim after a
-- guardian authorization had already been revoked before this migration.
WITH minor_processes_without_active_guardian AS (
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
             ~ '^\d{4}-\d{2}-\d{2}'
          THEN LEFT(profile."identificationData"->>'birthDate', 10)::date
        ELSE NULL
      END,
      student."birthDate"::date
    ) > (CURRENT_DATE - INTERVAL '18 years')::date
    AND NOT EXISTS (
      SELECT 1
      FROM "PreRegistrationGuardianAuthorization" AS authorization
      WHERE authorization."alunoId" = onboarding."alunoId"
        AND authorization."contractId" = onboarding."contractId"
        AND authorization."purpose" = 'PRE_REGISTRATION'
        AND authorization."status" = 'ACTIVE'
    )
)
UPDATE "StudentOnboardingProcess" AS onboarding
SET "version" = onboarding."version" + 1,
    "claimedByUserId" = NULL,
    "claimedAt" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
FROM minor_processes_without_active_guardian AS stale
WHERE onboarding."alunoId" = stale."alunoId"
  AND onboarding."contractId" = stale."contractId";
