-- Issue #274: endurece invariantes relacionais e a vigência da revisão.

-- Falha de forma segura se o banco já contiver uma cadeia, autorreferência,
-- vínculo órfão ou relação cross-tenant. A migration não tenta adivinhar qual
-- cadastro deve prevalecer.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Aluno" source
    LEFT JOIN "Aluno" target ON target."id" = source."canonicalAlunoId"
    WHERE source."canonicalAlunoId" IS NOT NULL
      AND (
        target."id" IS NULL
        OR source."id" = source."canonicalAlunoId"
        OR source."contractId" <> target."contractId"
        OR target."canonicalAlunoId" IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION
      'canonical duplicate graph contains orphan, self-link, cross-tenant link or chain';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "enforce_aluno_canonical_duplicate_link"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_contract_id TEXT;
  target_canonical_id TEXT;
BEGIN
  -- Serializa todas as alterações do grafo dentro do tenant. Isso fecha a
  -- janela entre duas escritas que seriam válidas isoladamente.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."contractId", 274));

  -- Um destino já referenciado não pode mudar de tenant.
  IF NEW."canonicalAlunoId" IS NULL THEN
    IF TG_OP = 'UPDATE'
       AND OLD."contractId" IS DISTINCT FROM NEW."contractId"
       AND EXISTS (
         SELECT 1
         FROM "Aluno" source
         WHERE source."canonicalAlunoId" = NEW."id"
           AND source."contractId" <> NEW."contractId"
       )
    THEN
      RAISE EXCEPTION 'canonical duplicate target cannot move across tenants';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."canonicalAlunoId" = NEW."id" THEN
    RAISE EXCEPTION 'canonical duplicate link cannot reference itself';
  END IF;

  SELECT target."contractId", target."canonicalAlunoId"
  INTO target_contract_id, target_canonical_id
  FROM "Aluno" target
  WHERE target."id" = NEW."canonicalAlunoId"
  FOR UPDATE;

  IF target_contract_id IS NULL THEN
    RAISE EXCEPTION 'canonical duplicate target does not exist';
  END IF;
  IF target_contract_id <> NEW."contractId" THEN
    RAISE EXCEPTION 'canonical duplicate target must belong to the same tenant';
  END IF;
  IF target_canonical_id IS NOT NULL THEN
    RAISE EXCEPTION 'canonical duplicate chains are not allowed';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "Aluno" source
    WHERE source."canonicalAlunoId" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'a referenced canonical target cannot become a duplicate source';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Aluno_enforce_canonical_duplicate_link" ON "Aluno";
CREATE TRIGGER "Aluno_enforce_canonical_duplicate_link"
BEFORE INSERT OR UPDATE OF "canonicalAlunoId", "contractId"
ON "Aluno"
FOR EACH ROW
EXECUTE FUNCTION "enforce_aluno_canonical_duplicate_link"();

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
  "birthDate",
  "leadOrigin",
  "professorId"
ON "Aluno"
FOR EACH ROW
EXECUTE FUNCTION "invalidate_pre_registration_review_on_identity_change"();

CREATE OR REPLACE FUNCTION "invalidate_pre_registration_review_on_commercial_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."identificationData" #> '{_leadCommercial}'
       IS DISTINCT FROM NEW."identificationData" #> '{_leadCommercial}'
  THEN
    UPDATE "StudentOnboardingProcess" onboarding
    SET "version" = onboarding."version" + 1,
        "reviewedAt" = NULL,
        "reviewedByProfessorId" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
    FROM "Aluno" student
    WHERE student."id" = NEW."alunoId"
      AND onboarding."alunoId" = student."id"
      AND onboarding."contractId" = student."contractId"
      AND student."status" IN ('PRE_REGISTRATION_COMPLETED', 'READY_FOR_ENROLLMENT')
      AND onboarding."reviewedAt" IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "StudentProfile_invalidate_pre_registration_review"
ON "StudentProfile";
CREATE TRIGGER "StudentProfile_invalidate_pre_registration_review"
AFTER UPDATE OF "identificationData"
ON "StudentProfile"
FOR EACH ROW
EXECUTE FUNCTION "invalidate_pre_registration_review_on_commercial_change"();
