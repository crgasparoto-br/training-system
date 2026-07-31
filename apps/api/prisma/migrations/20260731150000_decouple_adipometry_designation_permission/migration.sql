BEGIN;

-- A professional may be designated before the collaborator function receives
-- the sensitive clinical grant. The grant remains mandatory at approval and
-- revocation time and is revalidated inside the same transaction.
CREATE OR REPLACE FUNCTION "isEligibleAdipometryClinicalResponsible"(
  p_contract_id TEXT,
  p_professor_id TEXT,
  p_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "Professor" professor
    JOIN "User" app_user ON app_user.id = professor."userId"
    JOIN "Profile" profile ON profile."userId" = app_user.id
    WHERE professor.id = p_professor_id
      AND professor."contractId" = p_contract_id
      AND app_user."isActive" = TRUE
      AND NULLIF(BTRIM(profile.name), '') IS NOT NULL
      AND NULLIF(BTRIM(profile.cref), '') IS NOT NULL
      AND (professor."dismissalDate" IS NULL OR professor."dismissalDate" > p_at)
      AND LOWER(COALESCE(professor."currentStatus", 'active')) NOT IN (
        'inactive', 'inativo', 'dismissed', 'desligado', 'terminated', 'encerrado'
      )
  );
$$;

CREATE OR REPLACE FUNCTION "guardAdipometryProtocolApproval"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_protocol "AdipometryProtocol"%ROWTYPE;
  v_responsibility "AdipometryClinicalResponsibility"%ROWTYPE;
  v_name TEXT;
  v_cref TEXT;
  v_user_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_APPROVAL_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."revokedAt" IS NOT NULL
       OR NEW."revokedAt" IS NULL
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

    SELECT * INTO v_responsibility
    FROM "AdipometryClinicalResponsibility"
    WHERE "contractId" = NEW."contractId"
      AND domain = 'ADIPOMETRY_CLINICAL_RESPONSIBLE'
      AND "professorId" = NEW."revokedByProfessorId"
      AND "effectiveFrom" <= NEW."revokedAt"
      AND ("effectiveTo" IS NULL OR "effectiveTo" > NEW."revokedAt");

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ADIPOMETRY_REVOCATION_REQUIRES_ACTIVE_RESPONSIBLE' USING ERRCODE = '23514';
    END IF;

    SELECT professor."userId" INTO v_user_id
    FROM "Professor" professor
    WHERE professor.id = NEW."revokedByProfessorId"
      AND professor."contractId" = NEW."contractId";

    IF v_user_id IS DISTINCT FROM NEW."revokedByUserId"
       OR NOT "isEligibleAdipometryClinicalResponsible"(
         NEW."contractId", NEW."revokedByProfessorId", NEW."revokedAt"
       )
       OR NOT "hasExplicitAdipometryClinicalPermission"(
         NEW."contractId", NEW."revokedByProfessorId",
         'settings.contract.adipometryProtocolApproval'
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
     OR v_responsibility."effectiveFrom" > NEW."approvedAt"
     OR (v_responsibility."effectiveTo" IS NOT NULL AND v_responsibility."effectiveTo" <= NEW."approvedAt") THEN
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
       NEW."contractId", NEW."approvedByProfessorId", NEW."approvedAt"
     )
     OR NOT "hasExplicitAdipometryClinicalPermission"(
       NEW."contractId", NEW."approvedByProfessorId",
       'settings.contract.adipometryProtocolApproval'
     ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_APPROVAL_ACTOR_INVALID' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
