-- Issue #274: a revisão administrativa é vinculada à versão da identidade.
-- Alterações de identificadores depois da conclusão invalidam a revisão vigente
-- na mesma transação, sem apagar histórico ou respostas clínicas.
CREATE OR REPLACE FUNCTION "invalidate_pre_registration_review_on_identity_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" IN ('PRE_REGISTRATION_COMPLETED', 'READY_FOR_ENROLLMENT')
     AND (
       OLD."leadName" IS DISTINCT FROM NEW."leadName"
       OR OLD."leadCpfNormalized" IS DISTINCT FROM NEW."leadCpfNormalized"
       OR OLD."leadPhoneNormalized" IS DISTINCT FROM NEW."leadPhoneNormalized"
       OR OLD."leadAdditionalPhoneNormalized" IS DISTINCT FROM NEW."leadAdditionalPhoneNormalized"
       OR OLD."leadEmailNormalized" IS DISTINCT FROM NEW."leadEmailNormalized"
       OR OLD."leadAdditionalEmailNormalized" IS DISTINCT FROM NEW."leadAdditionalEmailNormalized"
       OR OLD."birthDate" IS DISTINCT FROM NEW."birthDate"
     )
  THEN
    -- A fronteira canônica de identidade bloqueia Aluno antes de persistir o
    -- perfil. Não aguarde uma transação que tenha obtido o onboarding na ordem
    -- inversa: aborte com lock_not_available e deixe toda a operação fazer
    -- rollback, evitando deadlock e revisão parcialmente invalidada.
    PERFORM 1
    FROM "StudentOnboardingProcess"
    WHERE "alunoId" = NEW."id"
      AND "contractId" = NEW."contractId"
    FOR UPDATE NOWAIT;

    IF FOUND THEN
      UPDATE "StudentOnboardingProcess"
      SET "version" = "version" + 1,
          "reviewedAt" = NULL,
          "reviewedByProfessorId" = NULL,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "alunoId" = NEW."id"
        AND "contractId" = NEW."contractId";
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Aluno_invalidate_pre_registration_review" ON "Aluno";
CREATE TRIGGER "Aluno_invalidate_pre_registration_review"
AFTER UPDATE OF
  "leadName",
  "leadCpfNormalized",
  "leadPhoneNormalized",
  "leadAdditionalPhoneNormalized",
  "leadEmailNormalized",
  "leadAdditionalEmailNormalized",
  "birthDate"
ON "Aluno"
FOR EACH ROW
EXECUTE FUNCTION "invalidate_pre_registration_review_on_identity_change"();
