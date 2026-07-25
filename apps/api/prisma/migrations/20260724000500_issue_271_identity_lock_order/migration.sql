-- Issue #271 final concurrency hardening.
--
-- Public writes serialize by StudentOnboardingProcess before updating Aluno and
-- StudentProfile. Administrative writes normally hold Aluno first. When both
-- operations meet, waiting for onboarding from this AFTER UPDATE trigger would
-- invert the lock order and could deadlock. NOWAIT converts that dispute into a
-- serialization failure so the administrative transaction is rolled back and
-- can be retried without overwriting the public draft.
CREATE OR REPLACE FUNCTION bump_pre_registration_version_on_identity_change()
RETURNS TRIGGER AS $$
DECLARE
  locked_onboarding_id TEXT;
BEGIN
  IF NEW."identificationData" IS DISTINCT FROM OLD."identificationData"
     AND COALESCE(NEW."sourceType"::text, '') <> 'student' THEN
    BEGIN
      SELECT "id"
      INTO locked_onboarding_id
      FROM "StudentOnboardingProcess"
      WHERE "alunoId" = NEW."alunoId"
        AND "contractId" = NEW."contractId"
        AND "completedAt" IS NULL
      FOR UPDATE NOWAIT;
    EXCEPTION
      WHEN lock_not_available THEN
        RAISE EXCEPTION 'O pré-cadastro está sendo alterado em outro acesso.'
          USING ERRCODE = '40001';
    END;

    IF locked_onboarding_id IS NOT NULL THEN
      UPDATE "StudentOnboardingProcess"
      SET "version" = "version" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = locked_onboarding_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;