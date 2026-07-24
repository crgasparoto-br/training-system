-- Issue #271: close the race between the public role pre-check and the claim
-- transaction. A minor can be claimed with role STUDENT only while an ACTIVE,
-- tenant-scoped guardian authorization exists. Returning NULL skips the
-- onboarding update; the service observes zero affected rows and rolls the
-- entire claim transaction back, including any preceding Aluno.userId update.
CREATE OR REPLACE FUNCTION enforce_minor_student_claim_authorization()
RETURNS TRIGGER AS $$
DECLARE
  canonical_birth_date DATE;
  has_active_guardian BOOLEAN;
BEGIN
  IF NEW."claimedByUserId" IS NULL OR NEW."claimRole" <> 'STUDENT' THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(profile."identificationData"->>'birthDate', '')::timestamptz::date
  INTO canonical_birth_date
  FROM "StudentProfile" AS profile
  WHERE profile."alunoId" = NEW."alunoId"
    AND profile."contractId" = NEW."contractId";

  IF canonical_birth_date IS NULL
     OR date_part('year', age(CURRENT_DATE, canonical_birth_date)) >= 18 THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM "PreRegistrationGuardianAuthorization" AS authorization
    WHERE authorization."alunoId" = NEW."alunoId"
      AND authorization."contractId" = NEW."contractId"
      AND authorization."purpose" = 'PRE_REGISTRATION'
      AND authorization."status" = 'ACTIVE'
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