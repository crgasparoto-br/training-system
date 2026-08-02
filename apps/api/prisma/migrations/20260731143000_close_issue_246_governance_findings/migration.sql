BEGIN;

-- Issue #246 audit remediation: clinical authority must be explicitly granted,
-- approvals can be revoked without rewriting history, and correction categories
-- preserve the vocabulary approved in the issue decisions.

ALTER TABLE "AdipometryProtocolApproval"
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedByProfessorId" TEXT,
  ADD COLUMN "revokedByUserId" TEXT,
  ADD COLUMN "revocationReason" TEXT;

ALTER TABLE "AdipometryProtocolApproval"
  ADD CONSTRAINT "AdipometryProtocolApproval_revocation_check" CHECK (
    (
      "revokedAt" IS NULL
      AND "revokedByProfessorId" IS NULL
      AND "revokedByUserId" IS NULL
      AND "revocationReason" IS NULL
    )
    OR
    (
      "revokedAt" IS NOT NULL
      AND "revokedByProfessorId" IS NOT NULL
      AND "revokedByUserId" IS NOT NULL
      AND LENGTH(BTRIM("revocationReason")) >= 10
      AND "revokedAt" >= "approvedAt"
    )
  );

ALTER TABLE "AdipometryProtocolApproval"
  ADD CONSTRAINT "AdipometryProtocolApproval_revokedByProfessor_contract_fkey"
  FOREIGN KEY ("revokedByProfessorId", "contractId")
  REFERENCES "Professor"("id", "contractId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryProtocolApproval"
  ADD CONSTRAINT "AdipometryProtocolApproval_revokedByUserId_fkey"
  FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "AdipometryProtocolApproval_contract_protocol_key";
CREATE UNIQUE INDEX "AdipometryProtocolApproval_contract_protocol_key"
  ON "AdipometryProtocolApproval"("contractId", "protocolId", "protocolCode", "protocolVersion")
  WHERE "revokedAt" IS NULL;
CREATE INDEX "AdipometryProtocolApproval_contract_revokedAt_idx"
  ON "AdipometryProtocolApproval"("contractId", "revokedAt" DESC)
  WHERE "revokedAt" IS NOT NULL;

-- Sensitive clinical capabilities are never inherited from a role/profile.
-- Existing rows introduced by the draft implementation are reset to deny and
-- can be enabled explicitly through collaborator-function permissions.
UPDATE "AccessPermission"
SET "canView" = FALSE,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "screenKey" = 'settings.contract'
  AND "blockKey" = 'settings.contract.adipometryProtocolApproval';

INSERT INTO "AccessPermission" (
  id, "collaboratorFunctionId", "screenKey", "blockKey", "canView", "createdAt", "updatedAt"
)
SELECT
  'adpt_' || MD5(function.id || ':settings.contract.adipometryProtocolApproval'),
  function.id,
  'settings.contract',
  'settings.contract.adipometryProtocolApproval',
  FALSE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "CollaboratorFunctionOption" function
ON CONFLICT ("collaboratorFunctionId", "screenKey", "blockKey") DO NOTHING;

INSERT INTO "AccessPermission" (
  id, "collaboratorFunctionId", "screenKey", "blockKey", "canView", "createdAt", "updatedAt"
)
SELECT
  'adpt_' || MD5(function.id || ':settings.contract.actions.manageClinicalTechnicalResponsibility'),
  function.id,
  'settings.contract',
  'settings.contract.actions.manageClinicalTechnicalResponsibility',
  FALSE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "CollaboratorFunctionOption" function
ON CONFLICT ("collaboratorFunctionId", "screenKey", "blockKey") DO NOTHING;

CREATE OR REPLACE FUNCTION "hasExplicitAdipometryClinicalPermission"(
  p_contract_id TEXT,
  p_professor_id TEXT,
  p_block_key TEXT
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "Professor" professor
    JOIN "AccessPermission" permission
      ON permission."collaboratorFunctionId" = professor."collaboratorFunctionId"
    WHERE professor.id = p_professor_id
      AND professor."contractId" = p_contract_id
      AND permission."screenKey" = 'settings.contract'
      AND permission."blockKey" = p_block_key
      AND permission."canView" = TRUE
  );
$$;

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
      AND "hasExplicitAdipometryClinicalPermission"(
        p_contract_id,
        p_professor_id,
        'settings.contract.adipometryProtocolApproval'
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
     ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_APPROVAL_ACTOR_INVALID' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "guardAdipometryActiveContractApproval"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
       WHERE approval."contractId" = NEW."contractId"
         AND approval."protocolId" = NEW."protocolId"
         AND approval."protocolCode" = NEW."protocolCode"
         AND approval."protocolVersion" = NEW."protocolVersion"
         AND approval."revokedAt" IS NULL
     ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_NOT_APPROVED_FOR_CONTRACT' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "AdipometryAssessment_active_approval_insert_guard" ON "AdipometryAssessment";
DROP TRIGGER IF EXISTS "AdipometryAssessment_active_approval_update_guard" ON "AdipometryAssessment";
CREATE TRIGGER "AdipometryAssessment_active_approval_insert_guard"
BEFORE INSERT ON "AdipometryAssessment"
FOR EACH ROW EXECUTE FUNCTION "guardAdipometryActiveContractApproval"();
CREATE TRIGGER "AdipometryAssessment_active_approval_update_guard"
BEFORE UPDATE OF status, "contractId", "protocolId", "protocolCode", "protocolVersion"
ON "AdipometryAssessment"
FOR EACH ROW EXECUTE FUNCTION "guardAdipometryActiveContractApproval"();

ALTER TABLE "AdipometryAssessment"
  DROP CONSTRAINT "AdipometryAssessment_correction_category_check";

UPDATE "AdipometryAssessment"
SET "correctionCategory" = CASE "correctionCategory"
  WHEN 'MEASUREMENT_OR_TRANSCRIPTION_ERROR' THEN 'MEASUREMENT_TRANSCRIPTION_ERROR'
  WHEN 'DEMOGRAPHIC_CONFIRMATION_ERROR' THEN 'PROTOCOL_SEX_ERROR'
  ELSE "correctionCategory"
END
WHERE "correctionCategory" IN (
  'MEASUREMENT_OR_TRANSCRIPTION_ERROR',
  'DEMOGRAPHIC_CONFIRMATION_ERROR'
);

ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_correction_category_check" CHECK (
    "correctionCategory" IS NULL OR "correctionCategory" IN (
      'DATA_ENTRY_ERROR',
      'MEASUREMENT_TRANSCRIPTION_ERROR',
      'EVALUATION_DATE_ERROR',
      'PROTOCOL_SEX_ERROR',
      'PROTOCOL_SELECTION_ERROR',
      'OTHER'
    )
  );

COMMIT;
