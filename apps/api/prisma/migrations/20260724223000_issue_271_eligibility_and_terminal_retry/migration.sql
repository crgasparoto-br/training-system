-- Issue #271 audit remediation (AUD-271-004 and AUD-271-005).
-- Canonical eligibility changes must suspend or restore a student's authenticated
-- pre-registration claim in every lifecycle state. Authorization changes must do
-- the same atomically, including completed processes.

CREATE OR REPLACE FUNCTION bump_pre_registration_version_on_identity_change()
RETURNS TRIGGER AS $$
DECLARE
  new_birth_date DATE;
  new_is_minor BOOLEAN;
  has_active_guardian BOOLEAN;
  linked_student_user_id TEXT;
  locked_onboarding_id TEXT;
BEGIN
  IF NEW."identificationData" IS NOT DISTINCT FROM OLD."identificationData" THEN
    RETURN NEW;
  END IF;

  -- Administrative identity writes hold Aluno before reaching this trigger,
  -- while public writes hold onboarding first. Preserve the established NOWAIT
  -- guard so the inverse order fails fast instead of waiting or deadlocking.
  IF COALESCE(NEW."sourceType"::text, '') <> 'student' THEN
    BEGIN
      SELECT "id"
      INTO locked_onboarding_id
      FROM "StudentOnboardingProcess"
      WHERE "alunoId" = NEW."alunoId"
        AND "contractId" = NEW."contractId"
      FOR UPDATE NOWAIT;
    EXCEPTION
      WHEN lock_not_available THEN
        RAISE EXCEPTION 'O pré-cadastro está sendo alterado em outro acesso.'
          USING ERRCODE = '40001';
    END;
  END IF;

  IF COALESCE(NEW."identificationData"->>'birthDate', '')
       ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
    new_birth_date := LEFT(NEW."identificationData"->>'birthDate', 10)::date;
  END IF;

  new_is_minor := new_birth_date IS NOT NULL
    AND new_birth_date > (CURRENT_DATE - INTERVAL '18 years')::date;

  SELECT student."userId"
  INTO linked_student_user_id
  FROM "Aluno" AS student
  WHERE student."id" = NEW."alunoId"
    AND student."contractId" = NEW."contractId";

  SELECT EXISTS (
    SELECT 1
    FROM "PreRegistrationGuardianAuthorization" AS guardian_auth
    WHERE guardian_auth."alunoId" = NEW."alunoId"
      AND guardian_auth."contractId" = NEW."contractId"
      AND guardian_auth."purpose" = 'PRE_REGISTRATION'
      AND guardian_auth."status" = 'ACTIVE'
  )
  INTO has_active_guardian;

  UPDATE "StudentOnboardingProcess" AS onboarding
  SET "version" = onboarding."version" + CASE
        WHEN COALESCE(NEW."sourceType"::text, '') <> 'student' THEN 1
        ELSE 0
      END,
      "claimedByUserId" = CASE
        WHEN onboarding."claimRole" = 'STUDENT'
             AND COALESCE(new_is_minor, FALSE)
             AND NOT COALESCE(has_active_guardian, FALSE)
          THEN NULL
        WHEN onboarding."claimRole" = 'STUDENT'
             AND NOT COALESCE(new_is_minor, FALSE)
             AND onboarding."claimedByUserId" IS NULL
             AND linked_student_user_id IS NOT NULL
          THEN linked_student_user_id
        ELSE onboarding."claimedByUserId"
      END,
      "claimedAt" = CASE
        WHEN onboarding."claimRole" = 'STUDENT'
             AND COALESCE(new_is_minor, FALSE)
             AND NOT COALESCE(has_active_guardian, FALSE)
          THEN NULL
        WHEN onboarding."claimRole" = 'STUDENT'
             AND NOT COALESCE(new_is_minor, FALSE)
             AND onboarding."claimedByUserId" IS NULL
             AND linked_student_user_id IS NOT NULL
          THEN CURRENT_TIMESTAMP
        ELSE onboarding."claimedAt"
      END,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE (
      COALESCE(NEW."sourceType"::text, '') <> 'student'
      AND onboarding."id" = locked_onboarding_id
    ) OR (
      COALESCE(NEW."sourceType"::text, '') = 'student'
      AND onboarding."alunoId" = NEW."alunoId"
      AND onboarding."contractId" = NEW."contractId"
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION bump_pre_registration_version_on_guardian_authorization_change()
RETURNS TRIGGER AS $$
DECLARE
  canonical_birth_date DATE;
  is_minor BOOLEAN;
  has_active_guardian BOOLEAN;
  linked_student_user_id TEXT;
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status"
     OR NEW."guardianUserId" IS DISTINCT FROM OLD."guardianUserId"
     OR NEW."contractId" IS DISTINCT FROM OLD."contractId" THEN
    SELECT
      COALESCE(
        CASE
          WHEN COALESCE(profile."identificationData"->>'birthDate', '')
               ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
            THEN LEFT(profile."identificationData"->>'birthDate', 10)::date
          ELSE NULL
        END,
        student."birthDate"::date
      ),
      student."userId"
    INTO canonical_birth_date, linked_student_user_id
    FROM "Aluno" AS student
    LEFT JOIN "StudentProfile" AS profile ON profile."alunoId" = student."id"
    WHERE student."id" = NEW."alunoId"
      AND student."contractId" = NEW."contractId";

    is_minor := canonical_birth_date IS NOT NULL
      AND canonical_birth_date > (CURRENT_DATE - INTERVAL '18 years')::date;

    SELECT EXISTS (
      SELECT 1
      FROM "PreRegistrationGuardianAuthorization" AS active_authorization
      WHERE active_authorization."alunoId" = NEW."alunoId"
        AND active_authorization."contractId" = NEW."contractId"
        AND active_authorization."purpose" = 'PRE_REGISTRATION'
        AND active_authorization."status" = 'ACTIVE'
    )
    INTO has_active_guardian;

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
               AND COALESCE(is_minor, FALSE)
               AND NOT COALESCE(has_active_guardian, FALSE) THEN NULL
          WHEN onboarding."claimRole" = 'STUDENT'
               AND COALESCE(is_minor, FALSE)
               AND COALESCE(has_active_guardian, FALSE)
               AND onboarding."claimedByUserId" IS NULL THEN linked_student_user_id
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
               AND COALESCE(is_minor, FALSE)
               AND NOT COALESCE(has_active_guardian, FALSE) THEN NULL
          WHEN onboarding."claimRole" = 'STUDENT'
               AND COALESCE(is_minor, FALSE)
               AND COALESCE(has_active_guardian, FALSE)
               AND onboarding."claimedByUserId" IS NULL
               AND linked_student_user_id IS NOT NULL THEN CURRENT_TIMESTAMP
          ELSE onboarding."claimedAt"
        END,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE onboarding."alunoId" = NEW."alunoId"
      AND onboarding."contractId" = NEW."contractId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Repair claims that are currently inconsistent with canonical age and active
-- guardian authorization, regardless of invited/in-progress/completed state.
WITH canonical_minor_processes AS (
  SELECT
    onboarding."alunoId",
    onboarding."contractId",
    student."userId",
    EXISTS (
      SELECT 1
      FROM "PreRegistrationGuardianAuthorization" AS active_authorization
      WHERE active_authorization."alunoId" = onboarding."alunoId"
        AND active_authorization."contractId" = onboarding."contractId"
        AND active_authorization."purpose" = 'PRE_REGISTRATION'
        AND active_authorization."status" = 'ACTIVE'
    ) AS has_active_guardian
  FROM "StudentOnboardingProcess" AS onboarding
  JOIN "Aluno" AS student
    ON student."id" = onboarding."alunoId"
   AND student."contractId" = onboarding."contractId"
  LEFT JOIN "StudentProfile" AS profile ON profile."alunoId" = student."id"
  WHERE onboarding."claimRole" = 'STUDENT'
    AND COALESCE(
      CASE
        WHEN COALESCE(profile."identificationData"->>'birthDate', '')
             ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          THEN LEFT(profile."identificationData"->>'birthDate', 10)::date
        ELSE NULL
      END,
      student."birthDate"::date
    ) > (CURRENT_DATE - INTERVAL '18 years')::date
)
UPDATE "StudentOnboardingProcess" AS onboarding
SET "version" = onboarding."version" + 1,
    "claimedByUserId" = CASE
      WHEN canonical.has_active_guardian THEN canonical."userId"
      ELSE NULL
    END,
    "claimedAt" = CASE
      WHEN canonical.has_active_guardian AND canonical."userId" IS NOT NULL
        THEN COALESCE(onboarding."claimedAt", CURRENT_TIMESTAMP)
      ELSE NULL
    END,
    "updatedAt" = CURRENT_TIMESTAMP
FROM canonical_minor_processes AS canonical
WHERE onboarding."alunoId" = canonical."alunoId"
  AND onboarding."contractId" = canonical."contractId"
  AND onboarding."claimedByUserId" IS DISTINCT FROM CASE
    WHEN canonical.has_active_guardian THEN canonical."userId"
    ELSE NULL
  END;
