-- Issue #271: close the race between the public role pre-check and the claim
-- transaction. A minor can be claimed with role STUDENT only while an ACTIVE,
-- tenant-scoped guardian authorization exists. Returning NULL skips the
-- onboarding update; the service observes zero affected rows and rolls the
-- entire claim transaction back, including any preceding Aluno.userId update.
CREATE OR REPLACE FUNCTION enforce_minor_student_claim_authorization()
RETURNS TRIGGER AS $$
DECLARE
  is_minor BOOLEAN;
  has_active_guardian BOOLEAN;
BEGIN
  IF NEW."claimedByUserId" IS NULL OR NEW."claimRole" <> 'STUDENT' THEN
    RETURN NEW;
  END IF;

  SELECT student."birthDate" IS NOT NULL
         AND student."birthDate"::date > (CURRENT_DATE - INTERVAL '18 years')::date
  INTO is_minor
  FROM "Aluno" AS student
  WHERE student."id" = NEW."alunoId"
    AND student."contractId" = NEW."contractId";

  IF NOT COALESCE(is_minor, FALSE) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM "PreRegistrationGuardianAuthorization" AS guardian_auth
    WHERE guardian_auth."alunoId" = NEW."alunoId"
      AND guardian_auth."contractId" = NEW."contractId"
      AND guardian_auth."purpose" = 'PRE_REGISTRATION'
      AND guardian_auth."status" = 'ACTIVE'
  )
  INTO has_active_guardian;

  IF NOT has_active_guardian THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "StudentOnboardingProcess_minor_claim_guard"
  ON "StudentOnboardingProcess";

CREATE TRIGGER "StudentOnboardingProcess_minor_claim_guard"
BEFORE UPDATE OF "claimedByUserId", "claimRole"
ON "StudentOnboardingProcess"
FOR EACH ROW
EXECUTE FUNCTION enforce_minor_student_claim_authorization();
