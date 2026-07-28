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

-- O gatilho canônico de StudentProfile já controla versão e vínculo de conta.
-- Integramos a invalidação da revisão nessa mesma função para não manter dois
-- gatilhos concorrentes incrementando a versão pela mesma alteração JSON.
CREATE OR REPLACE FUNCTION "bump_pre_registration_version_on_identity_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  new_birth_date DATE;
  new_is_minor BOOLEAN;
  has_active_guardian BOOLEAN;
  linked_student_user_id TEXT;
  student_status TEXT;
  locked_onboarding_id TEXT;
  professional_write BOOLEAN := COALESCE(NEW."sourceType"::text, '') <> 'student';
BEGIN
  IF NEW."identificationData" IS NOT DISTINCT FROM OLD."identificationData" THEN
    RETURN NEW;
  END IF;

  -- Escritas administrativas bloqueiam Aluno antes de chegar a este gatilho,
  -- enquanto escritas públicas bloqueiam onboarding primeiro. Mantém o NOWAIT
  -- para transformar a ordem inversa em conflito transacional, não deadlock.
  IF professional_write THEN
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

  SELECT student."userId", student."status"::text
  INTO linked_student_user_id, student_status
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

  IF professional_write
     AND student_status IN ('PRE_REGISTRATION_COMPLETED', 'READY_FOR_ENROLLMENT') THEN
    PERFORM "invalidate_pre_registration_review_once"(NEW."alunoId", NEW."contractId");
  END IF;

  UPDATE "StudentOnboardingProcess" AS onboarding
  SET "version" = onboarding."version" + CASE
        -- Depois da conclusão, a função compartilhada acima é a única dona do bump.
        -- Antes da conclusão, preserva o comportamento histórico deste gatilho.
        WHEN professional_write
             AND COALESCE(
               student_status NOT IN ('PRE_REGISTRATION_COMPLETED', 'READY_FOR_ENROLLMENT'),
               TRUE
             )
          THEN 1
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
      professional_write
      AND onboarding."id" = locked_onboarding_id
    ) OR (
      NOT professional_write
      AND onboarding."alunoId" = NEW."alunoId"
      AND onboarding."contractId" = NEW."contractId"
    );

  RETURN NEW;
END;
$$;

-- Remove apenas as variantes específicas da invalidação da issue 274. O gatilho
-- canônico StudentProfile_bump_pre_registration_version permanece como único
-- responsável pela alteração de versão causada por identificationData.
DO $$
DECLARE
  trigger_row RECORD;
BEGIN
  FOR trigger_row IN
    SELECT namespace.nspname AS schema_name,
           relation.relname AS table_name,
           trigger_definition.tgname AS trigger_name
    FROM pg_trigger trigger_definition
    JOIN pg_class relation ON relation.oid = trigger_definition.tgrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_proc trigger_function ON trigger_function.oid = trigger_definition.tgfoid
    WHERE NOT trigger_definition.tgisinternal
      AND relation.relname IN ('Aluno', 'StudentProfile')
      AND (
        trigger_definition.tgname IN (
          'Aluno_invalidate_pre_registration_review',
          'StudentProfile_invalidate_pre_registration_review'
        )
        OR trigger_function.proname LIKE 'invalidate_pre_registration_review%'
      )
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I.%I',
      trigger_row.trigger_name,
      trigger_row.schema_name,
      trigger_row.table_name
    );
  END LOOP;
END;
$$;

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
