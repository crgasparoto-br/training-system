-- Issue #248: a definição clínica é global, mas a autorização de uso é
-- contratual. A conclusão deve validar a aprovação ativa do contrato que foi
-- congelada no calculationSnapshot, e não o status administrativo global da
-- definição. O mesmo guard aceita como autor de correção um ator profissional
-- ativo com vínculo próprio, sem confundi-lo com o responsável clínico.
--
-- Alguns bancos legados usados pela verificação da cadeia não instalaram a
-- fundação ADPT. Neles esta migração deve ser um no-op, como as demais
-- migrações incrementais do domínio.
DO $migration$
BEGIN
  IF TO_REGCLASS('public."AdipometryAssessment"') IS NULL
     OR TO_REGCLASS('public."AdipometryProtocol"') IS NULL
     OR TO_REGCLASS('public."AdipometryProtocolApproval"') IS NULL
     OR TO_REGCLASS('public."ProfessionalActorMembership"') IS NULL
  THEN
    RETURN;
  END IF;

  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION "isAdipometryActorEligibleForContract"(
      p_user_id TEXT,
      p_contract_id TEXT
    ) RETURNS BOOLEAN
    LANGUAGE sql
    STABLE
    AS $function$
      SELECT EXISTS (
        SELECT 1
        FROM "Professor" professor
        JOIN "User" actor ON actor."id" = professor."userId"
        JOIN "CollaboratorFunctionOption" collaborator_function
          ON collaborator_function."id" = professor."collaboratorFunctionId"
         AND collaborator_function."contractId" = professor."contractId"
        WHERE professor."userId" = p_user_id
          AND professor."contractId" = p_contract_id
          AND actor."isActive" = TRUE
          AND collaborator_function."isActive" = TRUE
          AND LOWER(
            COALESCE(
              NULLIF(BTRIM(professor."currentStatus"::TEXT), ''),
              'active'
            )
          ) NOT IN (
            'inactive',
            'inativo',
            'dismissed',
            'desligado',
            'terminated',
            'encerrado'
          )
          AND (
            professor."dismissalDate" IS NULL
            OR professor."dismissalDate" > CURRENT_TIMESTAMP
          )
      ) OR EXISTS (
        SELECT 1
        FROM "ProfessionalActorMembership" membership
        JOIN "User" actor ON actor."id" = membership."userId"
        JOIN "CollaboratorFunctionOption" collaborator_function
          ON collaborator_function."id" = membership."collaboratorFunctionId"
         AND collaborator_function."contractId" = membership."contractId"
        WHERE membership."userId" = p_user_id
          AND membership."contractId" = p_contract_id
          AND membership."isActive" = TRUE
          AND actor."isActive" = TRUE
          AND actor."type"::TEXT = 'professor'
          AND collaborator_function."isActive" = TRUE
      );
    $function$;
  $ddl$;

  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION "validateAdipometryAssessmentState"()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    DECLARE
      v_original "AdipometryAssessment"%ROWTYPE;
      v_is_completion_transition BOOLEAN;
    BEGIN
      v_is_completion_transition := NEW."status" = 'COMPLETED'
        AND (
          TG_OP = 'INSERT'
          OR OLD."status" IS DISTINCT FROM 'COMPLETED'
        );

      IF v_is_completion_transition AND NOT EXISTS (
        SELECT 1
        FROM "AdipometryProtocol" protocol
        JOIN "AdipometryProtocolApproval" approval
          ON approval."protocolId" = protocol."id"
         AND approval."protocolCode" = protocol."code"
         AND approval."protocolVersion" = protocol."version"
        WHERE protocol."id" = NEW."protocolId"
          AND protocol."code" = NEW."protocolCode"
          AND protocol."version" = NEW."protocolVersion"
          AND protocol."status"::TEXT <> 'DISABLED'
          AND approval."contractId" = NEW."contractId"
          AND approval."revokedAt" IS NULL
          AND approval."id" = NEW."calculationSnapshot" #>> '{protocolApproval,id}'
      ) THEN
        RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_NOT_APPROVED_FOR_CONTRACT'
          USING ERRCODE = '23514';
      END IF;

      IF NEW."correctsAssessmentId" = NEW."id"
         OR NEW."correctedByAssessmentId" = NEW."id" THEN
        RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_SELF_REFERENCE'
          USING ERRCODE = '23514';
      END IF;

      IF TG_OP = 'INSERT' AND NEW."correctedByAssessmentId" IS NOT NULL THEN
        RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_LINK_IS_MANAGED'
          USING ERRCODE = '23514';
      END IF;

      IF NEW."correctsAssessmentId" IS NOT NULL THEN
        SELECT * INTO v_original
        FROM "AdipometryAssessment"
        WHERE "id" = NEW."correctsAssessmentId"
        FOR UPDATE;

        IF NOT FOUND
           OR v_original."contractId" <> NEW."contractId"
           OR v_original."alunoId" <> NEW."alunoId"
           OR v_original."status" <> 'COMPLETED'
           OR v_original."correctedByAssessmentId" IS NOT NULL
        THEN
          RAISE EXCEPTION 'ADIPOMETRY_INVALID_CORRECTION_TARGET'
            USING ERRCODE = '23514';
        END IF;

        IF NOT "isAdipometryActorEligibleForContract"(
          NEW."correctionAuthorUserId",
          NEW."contractId"
        ) THEN
          RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_AUTHOR_CROSS_TENANT_OR_INACTIVE'
            USING ERRCODE = '23514';
        END IF;
      END IF;

      IF TG_OP = 'UPDATE'
         AND OLD."status" = 'COMPLETED'
         AND OLD."correctedByAssessmentId" IS NULL
         AND NEW."correctedByAssessmentId" IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM "AdipometryAssessment" correction
           WHERE correction."id" = NEW."correctedByAssessmentId"
             AND correction."correctsAssessmentId" = OLD."id"
             AND correction."contractId" = OLD."contractId"
             AND correction."alunoId" = OLD."alunoId"
             AND correction."status" = 'COMPLETED'
         )
      THEN
        RAISE EXCEPTION 'ADIPOMETRY_INVALID_CORRECTION_LINK'
          USING ERRCODE = '23514';
      END IF;

      RETURN NEW;
    END;
    $function$;
  $ddl$;
END
$migration$;
