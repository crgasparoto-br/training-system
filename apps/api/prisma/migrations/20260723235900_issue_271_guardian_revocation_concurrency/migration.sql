-- Issue #271 audit hardening: a guardian authorization status change must
-- invalidate any form version read before the change. The row-level trigger
-- updates the related onboarding process in the same transaction as the
-- authorization mutation, so a save that starts after revocation cannot commit
-- using a stale version.
CREATE OR REPLACE FUNCTION bump_pre_registration_version_on_guardian_authorization_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status"
     OR NEW."guardianUserId" IS DISTINCT FROM OLD."guardianUserId"
     OR NEW."contractId" IS DISTINCT FROM OLD."contractId" THEN
    UPDATE "StudentOnboardingProcess"
    SET "version" = "version" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "alunoId" = NEW."alunoId"
      AND "contractId" = NEW."contractId"
      AND "completedAt" IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "GuardianAuthorization_bump_pre_registration_version"
  ON "PreRegistrationGuardianAuthorization";

CREATE TRIGGER "GuardianAuthorization_bump_pre_registration_version"
AFTER UPDATE OF "status", "guardianUserId", "contractId"
ON "PreRegistrationGuardianAuthorization"
FOR EACH ROW
EXECUTE FUNCTION bump_pre_registration_version_on_guardian_authorization_change();