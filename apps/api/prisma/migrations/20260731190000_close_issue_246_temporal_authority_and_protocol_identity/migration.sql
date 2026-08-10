BEGIN;

-- Issue #246 independent-audit remediation.
-- Sensitive governance writes must be bound to the authenticated application
-- actor and to the database transaction time. PostgreSQL superusers retain an
-- explicit administrative bypass for migrations and controlled recovery only.
CREATE OR REPLACE FUNCTION "currentAdipometryAuthenticatedActor"()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $actor$
DECLARE
  v_actor TEXT;
  v_is_superuser BOOLEAN;
BEGIN
  v_actor := NULLIF(BTRIM(CURRENT_SETTING('app.adipometry_actor_user_id', TRUE)), '');
  IF v_actor IS NOT NULL THEN
    RETURN v_actor;
  END IF;

  SELECT roles.rolsuper INTO v_is_superuser
  FROM pg_roles roles
  WHERE roles.rolname = CURRENT_USER;

  IF COALESCE(v_is_superuser, FALSE) THEN
    RETURN NULL;
  END IF;

  RAISE EXCEPTION 'ADIPOMETRY_AUTHENTICATED_ACTOR_CONTEXT_REQUIRED'
    USING ERRCODE = '28000';
END;
$actor$;

-- Reduced legacy-chain gates intentionally install only the early ADPT
-- foundation. Install each hardened guard only when its complete dependency
-- set is present; the production migration order installs every branch.
DO $install_temporal_authority$
DECLARE
  v_invalid BOOLEAN;
BEGIN
  IF TO_REGCLASS('"AdipometryClinicalResponsibility"') IS NOT NULL
     AND TO_REGPROCEDURE('"isEligibleAdipometryClinicalDesignation"(text,text,timestamp without time zone)') IS NOT NULL
     AND TO_REGPROCEDURE('"isEligibleAdipometryResponsibilityActor"(text,text,timestamp without time zone)') IS NOT NULL THEN
    EXECUTE $responsibility_function$
      CREATE OR REPLACE FUNCTION "guardAdipometryClinicalResponsibility"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $guard$
      DECLARE
        v_actor TEXT;
        v_now TIMESTAMP(3) := CURRENT_TIMESTAMP;
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_HISTORY_IMMUTABLE' USING ERRCODE = '23514';
        END IF;

        v_actor := "currentAdipometryAuthenticatedActor"();

        IF TG_OP = 'INSERT' THEN
          IF NEW."effectiveTo" IS NOT NULL OR NEW."endedAt" IS NOT NULL
             OR NEW."endedByUserId" IS NOT NULL OR NEW."endReason" IS NOT NULL THEN
            RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_MUST_START_ACTIVE' USING ERRCODE = '23514';
          END IF;
          IF v_actor IS NOT NULL AND NEW."designatedByUserId" IS DISTINCT FROM v_actor THEN
            RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_ACTOR_CONTEXT_MISMATCH'
              USING ERRCODE = '23514';
          END IF;

          NEW."designatedAt" := v_now;
          NEW."effectiveFrom" := v_now;

          IF NOT "isEligibleAdipometryClinicalDesignation"(
            NEW."contractId", NEW."professorId", v_now
          ) THEN
            RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBLE_NOT_ELIGIBLE' USING ERRCODE = '23514';
          END IF;
          IF NOT "isEligibleAdipometryResponsibilityActor"(
            NEW."contractId", NEW."designatedByUserId", v_now
          ) THEN
            RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_DESIGNATION_ACTOR_INVALID'
              USING ERRCODE = '23514';
          END IF;
          RETURN NEW;
        END IF;

        IF OLD."effectiveTo" IS NOT NULL THEN
          RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_HISTORY_IMMUTABLE' USING ERRCODE = '23514';
        END IF;

        IF NEW.id IS DISTINCT FROM OLD.id
           OR NEW."contractId" IS DISTINCT FROM OLD."contractId"
           OR NEW.domain IS DISTINCT FROM OLD.domain
           OR NEW."professorId" IS DISTINCT FROM OLD."professorId"
           OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom"
           OR NEW."designatedByUserId" IS DISTINCT FROM OLD."designatedByUserId"
           OR NEW."designatedAt" IS DISTINCT FROM OLD."designatedAt"
           OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
          RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
        END IF;

        IF NEW."endedByUserId" IS NULL
           OR NULLIF(BTRIM(NEW."endReason"), '') IS NULL THEN
          RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_END_INCOMPLETE' USING ERRCODE = '23514';
        END IF;
        IF v_actor IS NOT NULL AND NEW."endedByUserId" IS DISTINCT FROM v_actor THEN
          RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_ACTOR_CONTEXT_MISMATCH'
            USING ERRCODE = '23514';
        END IF;

        NEW."endedAt" := v_now;
        NEW."effectiveTo" := v_now;

        IF NOT "isEligibleAdipometryResponsibilityActor"(
          NEW."contractId", NEW."endedByUserId", v_now
        ) THEN
          RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_END_ACTOR_INVALID'
            USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
      END;
      $guard$;
    $responsibility_function$;
  END IF;

  IF TO_REGCLASS('"AdipometryProtocolApproval"') IS NOT NULL
     AND TO_REGCLASS('"AdipometryClinicalResponsibility"') IS NOT NULL
     AND TO_REGPROCEDURE('"isEligibleAdipometryClinicalResponsible"(text,text,timestamp without time zone)') IS NOT NULL
     AND TO_REGPROCEDURE('"isValidAdipometryContractProtocolDefinition"(jsonb)') IS NOT NULL THEN
    EXECUTE $approval_function$
      CREATE OR REPLACE FUNCTION "guardAdipometryProtocolApproval"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $guard$
      DECLARE
        v_protocol "AdipometryProtocol"%ROWTYPE;
        v_responsibility "AdipometryClinicalResponsibility"%ROWTYPE;
        v_name TEXT;
        v_cref TEXT;
        v_user_id TEXT;
        v_actor TEXT;
        v_now TIMESTAMP(3) := CURRENT_TIMESTAMP;
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_APPROVAL_IMMUTABLE' USING ERRCODE = '23514';
        END IF;

        v_actor := "currentAdipometryAuthenticatedActor"();

        IF TG_OP = 'UPDATE' THEN
          IF OLD."revokedAt" IS NOT NULL
             OR NEW."revokedByProfessorId" IS NULL
             OR NEW."revokedByUserId" IS NULL
             OR LENGTH(BTRIM(COALESCE(NEW."revocationReason", ''))) < 10 THEN
            RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_REVOCATION_INCOMPLETE' USING ERRCODE = '23514';
          END IF;

          IF (TO_JSONB(NEW) - ARRAY[
                'revokedAt', 'revokedByProfessorId', 'revokedByUserId', 'revocationReason'
              ]) IS DISTINCT FROM
             (TO_JSONB(OLD) - ARRAY[
                'revokedAt', 'revokedByProfessorId', 'revokedByUserId', 'revocationReason'
              ]) THEN
            RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_APPROVAL_IMMUTABLE' USING ERRCODE = '23514';
          END IF;
          IF v_actor IS NOT NULL AND NEW."revokedByUserId" IS DISTINCT FROM v_actor THEN
            RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_ACTOR_CONTEXT_MISMATCH'
              USING ERRCODE = '23514';
          END IF;

          NEW."revokedAt" := v_now;

          SELECT * INTO v_responsibility
          FROM "AdipometryClinicalResponsibility"
          WHERE "contractId" = NEW."contractId"
            AND domain = 'ADIPOMETRY_CLINICAL_RESPONSIBLE'
            AND "professorId" = NEW."revokedByProfessorId"
            AND "effectiveFrom" <= v_now
            AND ("effectiveTo" IS NULL OR "effectiveTo" > v_now);

          IF NOT FOUND THEN
            RAISE EXCEPTION 'ADIPOMETRY_REVOCATION_REQUIRES_ACTIVE_RESPONSIBLE' USING ERRCODE = '23514';
          END IF;

          SELECT professor."userId" INTO v_user_id
          FROM "Professor" professor
          WHERE professor.id = NEW."revokedByProfessorId"
            AND professor."contractId" = NEW."contractId";

          IF v_user_id IS DISTINCT FROM NEW."revokedByUserId"
             OR NOT "isEligibleAdipometryClinicalResponsible"(
               NEW."contractId", NEW."revokedByProfessorId", v_now
             ) THEN
            RAISE EXCEPTION 'ADIPOMETRY_REVOCATION_ACTOR_INVALID' USING ERRCODE = '23514';
          END IF;

          RETURN NEW;
        END IF;

        IF NEW."revokedAt" IS NOT NULL
           OR NEW."revokedByProfessorId" IS NOT NULL
           OR NEW."revokedByUserId" IS NOT NULL
           OR NEW."revocationReason" IS NOT NULL THEN
          RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_APPROVAL_MUST_START_ACTIVE' USING ERRCODE = '23514';
        END IF;
        IF v_actor IS NOT NULL AND NEW."approvedByUserId" IS DISTINCT FROM v_actor THEN
          RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_ACTOR_CONTEXT_MISMATCH'
            USING ERRCODE = '23514';
        END IF;

        NEW."approvedAt" := v_now;

        SELECT * INTO v_protocol
        FROM "AdipometryProtocol"
        WHERE id = NEW."protocolId" AND code = NEW."protocolCode" AND version = NEW."protocolVersion";
        IF NOT FOUND OR v_protocol.status = 'DISABLED' THEN
          RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_NOT_AVAILABLE_FOR_APPROVAL' USING ERRCODE = '23514';
        END IF;
        IF NEW."protocolDefinitionSnapshot" IS DISTINCT FROM v_protocol."definitionSnapshot"
           OR NOT "isValidAdipometryContractProtocolDefinition"(NEW."protocolDefinitionSnapshot") THEN
          RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_DEFINITION_INCOMPLETE' USING ERRCODE = '23514';
        END IF;

        SELECT * INTO v_responsibility
        FROM "AdipometryClinicalResponsibility"
        WHERE id = NEW."responsibilityId"
          AND "contractId" = NEW."contractId"
          AND domain = 'ADIPOMETRY_CLINICAL_RESPONSIBLE';
        IF NOT FOUND
           OR v_responsibility."professorId" <> NEW."approvedByProfessorId"
           OR v_responsibility."effectiveFrom" > v_now
           OR (v_responsibility."effectiveTo" IS NOT NULL AND v_responsibility."effectiveTo" <= v_now) THEN
          RAISE EXCEPTION 'ADIPOMETRY_APPROVAL_REQUIRES_ACTIVE_RESPONSIBLE' USING ERRCODE = '23514';
        END IF;

        SELECT profile.name, profile.cref, professor."userId"
          INTO v_name, v_cref, v_user_id
        FROM "Professor" professor
        JOIN "User" app_user ON app_user.id = professor."userId"
        JOIN "Profile" profile ON profile."userId" = app_user.id
        WHERE professor.id = NEW."approvedByProfessorId"
          AND professor."contractId" = NEW."contractId";

        IF v_user_id IS DISTINCT FROM NEW."approvedByUserId"
           OR BTRIM(v_name) IS DISTINCT FROM BTRIM(NEW."approvedByNameSnapshot")
           OR BTRIM(v_cref) IS DISTINCT FROM BTRIM(NEW."approvedByCrefSnapshot")
           OR NOT "isEligibleAdipometryClinicalResponsible"(
             NEW."contractId", NEW."approvedByProfessorId", v_now
           ) THEN
          RAISE EXCEPTION 'ADIPOMETRY_APPROVAL_ACTOR_INVALID' USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
      END;
      $guard$;
    $approval_function$;
  END IF;

  -- Once any contract has approved a protocol identity, the definition attached
  -- to that code/version is frozen. Material changes must use a new version.
  IF TO_REGCLASS('"AdipometryProtocolApproval"') IS NOT NULL
     AND TO_REGPROCEDURE('"buildAdipometrySpecificationHash"(text,integer,text,jsonb)') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (
      SELECT 1
      FROM "AdipometryProtocolApproval" approval
      JOIN "AdipometryProtocol" protocol
        ON protocol.id = approval."protocolId"
       AND protocol.code = approval."protocolCode"
       AND protocol.version = approval."protocolVersion"
      WHERE approval."approvedSpecificationHash" IS DISTINCT FROM
        "buildAdipometrySpecificationHash"(
          protocol.code,
          protocol.version,
          protocol.reference,
          protocol."definitionSnapshot"
        )
    )' INTO v_invalid;

    IF v_invalid THEN
      RAISE EXCEPTION 'ADIPOMETRY_EXISTING_PROTOCOL_IDENTITY_DRIFT';
    END IF;

    EXECUTE $protocol_function$
      CREATE OR REPLACE FUNCTION "protectApprovedAdipometryProtocol"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $protect$
      DECLARE
        v_has_approval BOOLEAN;
      BEGIN
        SELECT EXISTS (
          SELECT 1
          FROM "AdipometryProtocolApproval" approval
          WHERE approval."protocolId" = OLD.id
            AND approval."protocolCode" = OLD.code
            AND approval."protocolVersion" = OLD.version
        ) INTO v_has_approval;

        IF TG_OP = 'DELETE' AND (OLD.status IN ('APPROVED', 'DISABLED') OR v_has_approval) THEN
          RAISE EXCEPTION 'Approved, referenced or disabled adipometry protocols cannot be deleted'
            USING ERRCODE = '55000';
        END IF;

        IF TG_OP = 'UPDATE' AND v_has_approval THEN
          IF (TO_JSONB(NEW) - ARRAY['status', 'updatedAt']) IS DISTINCT FROM
             (TO_JSONB(OLD) - ARRAY['status', 'updatedAt']) THEN
            RAISE EXCEPTION 'Referenced adipometry protocol identity is immutable; create a new version'
              USING ERRCODE = '55000';
          END IF;
          IF NEW.status NOT IN (OLD.status, 'DISABLED') THEN
            RAISE EXCEPTION 'Referenced adipometry protocol can only preserve status or become disabled'
              USING ERRCODE = '55000';
          END IF;
          RETURN NEW;
        END IF;

        IF TG_OP = 'UPDATE' AND OLD.status = 'APPROVED' THEN
          IF NEW.status = 'DISABLED'
             AND (TO_JSONB(NEW) - ARRAY['status', 'updatedAt']) =
                 (TO_JSONB(OLD) - ARRAY['status', 'updatedAt']) THEN
            RETURN NEW;
          END IF;

          RAISE EXCEPTION 'Approved adipometry protocol definitions are immutable; only disabling is allowed'
            USING ERRCODE = '55000';
        END IF;

        IF TG_OP = 'UPDATE' AND OLD.status = 'DISABLED' THEN
          RAISE EXCEPTION 'Disabled adipometry protocols are immutable and cannot be reactivated'
            USING ERRCODE = '55000';
        END IF;

        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $protect$;
    $protocol_function$;

    EXECUTE $completion_function$
      CREATE OR REPLACE FUNCTION "guardAdipometryActiveContractApproval"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $guard$
      BEGIN
        IF NEW.status = 'COMPLETED'
           AND (
             TG_OP = 'INSERT'
             OR OLD.status IS DISTINCT FROM 'COMPLETED'
             OR NEW."contractId" IS DISTINCT FROM OLD."contractId"
             OR NEW."protocolId" IS DISTINCT FROM OLD."protocolId"
             OR NEW."protocolCode" IS DISTINCT FROM OLD."protocolCode"
             OR NEW."protocolVersion" IS DISTINCT FROM OLD."protocolVersion"
           )
           AND NOT EXISTS (
             SELECT 1
             FROM "AdipometryProtocolApproval" approval
             JOIN "AdipometryProtocol" protocol
               ON protocol.id = approval."protocolId"
              AND protocol.code = approval."protocolCode"
              AND protocol.version = approval."protocolVersion"
             WHERE approval."contractId" = NEW."contractId"
               AND approval."protocolId" = NEW."protocolId"
               AND approval."protocolCode" = NEW."protocolCode"
               AND approval."protocolVersion" = NEW."protocolVersion"
               AND approval."revokedAt" IS NULL
               AND approval."approvedSpecificationHash" =
                 "buildAdipometrySpecificationHash"(
                   protocol.code,
                   protocol.version,
                   protocol.reference,
                   protocol."definitionSnapshot"
                 )
           ) THEN
          RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_NOT_APPROVED_FOR_CONTRACT' USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
      END;
      $guard$;
    $completion_function$;
  END IF;
END;
$install_temporal_authority$;

COMMIT;
