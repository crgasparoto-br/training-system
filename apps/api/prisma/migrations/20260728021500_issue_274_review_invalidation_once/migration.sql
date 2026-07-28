-- Issue #274 / AUD-274-15: invalida a revisão comercial exatamente uma vez
-- por transação, inclusive antes da primeira aprovação administrativa.
--
-- Aluno e StudentProfile são projeções diferentes da mesma mutação lógica. Uma
-- edição pode alterar origem/responsável em Aluno e unidade/observações em
-- StudentProfile na mesma transação. O marcador transacional evita dois bumps
-- de versão sem deixar alterações exclusivamente comerciais sem invalidação.

CREATE OR REPLACE FUNCTION "invalidate_pre_registration_review_once"(
  target_aluno_id TEXT,
  target_contract_id TEXT
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  marker_name TEXT :=
    'app.issue274_review_invalidated.k_' || md5(target_contract_id || ':' || target_aluno_id);
BEGIN
  IF current_setting(marker_name, true) = '1' THEN
    RETURN;
  END IF;

  PERFORM 1
  FROM "StudentOnboardingProcess" onboarding
  JOIN "Aluno" student
    ON student."id" = onboarding."alunoId"
   AND student."contractId" = onboarding."contractId"
  WHERE onboarding."alunoId" = target_aluno_id
    AND onboarding."contractId" = target_contract_id
    AND student."status" IN ('PRE_REGISTRATION_COMPLETED', 'READY_FOR_ENROLLMENT')
  FOR UPDATE OF onboarding NOWAIT;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE "StudentOnboardingProcess"
  SET "version" = "version" + 1,
      "reviewedAt" = NULL,
      "reviewedByProfessorId" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "alunoId" = target_aluno_id
    AND "contractId" = target_contract_id;

  PERFORM set_config(marker_name, '1', true);
END;
$$;

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
       OR OLD."leadOrigin" IS DISTINCT FROM NEW."leadOrigin"
       OR OLD."professorId" IS DISTINCT FROM NEW."professorId"
     )
  THEN
    PERFORM "invalidate_pre_registration_review_once"(NEW."id", NEW."contractId");
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "invalidate_pre_registration_review_on_commercial_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."identificationData" #> '{_leadCommercial}'
       IS DISTINCT FROM NEW."identificationData" #> '{_leadCommercial}'
  THEN
    PERFORM "invalidate_pre_registration_review_once"(NEW."alunoId", NEW."contractId");
  END IF;

  RETURN NEW;
END;
$$;
