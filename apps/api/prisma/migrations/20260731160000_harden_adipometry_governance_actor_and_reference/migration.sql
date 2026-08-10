BEGIN;

-- Issue #246 independent-audit remediation.
-- Responsibility history must attribute designation and termination only to an
-- active, same-contract professional with the explicit management grant.
CREATE OR REPLACE FUNCTION "isEligibleAdipometryResponsibilityActor"(
  p_contract_id TEXT,
  p_user_id TEXT,
  p_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "Professor" professor
    JOIN "User" app_user ON app_user.id = professor."userId"
    WHERE professor."contractId" = p_contract_id
      AND professor."userId" = p_user_id
      AND app_user."isActive" = TRUE
      AND (professor."dismissalDate" IS NULL OR professor."dismissalDate" > p_at)
      AND LOWER(COALESCE(professor."currentStatus", 'active')) NOT IN (
        'inactive', 'inativo', 'dismissed', 'desligado', 'terminated', 'encerrado'
      )
      AND EXISTS (
        SELECT 1
        FROM "AccessPermission" permission
        WHERE permission."collaboratorFunctionId" = professor."collaboratorFunctionId"
          AND permission."screenKey" = 'settings.contract'
          AND permission."blockKey" =
            'settings.contract.actions.manageClinicalTechnicalResponsibility'
          AND permission."canView" = TRUE
      )
  );
$$;

CREATE OR REPLACE FUNCTION "guardAdipometryClinicalResponsibility"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_HISTORY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."effectiveTo" IS NOT NULL OR NEW."endedAt" IS NOT NULL
       OR NEW."endedByUserId" IS NOT NULL OR NEW."endReason" IS NOT NULL THEN
      RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_MUST_START_ACTIVE' USING ERRCODE = '23514';
    END IF;
    IF NOT "isEligibleAdipometryClinicalDesignation"(
      NEW."contractId", NEW."professorId", NEW."effectiveFrom"
    ) THEN
      RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBLE_NOT_ELIGIBLE' USING ERRCODE = '23514';
    END IF;
    IF NOT "isEligibleAdipometryResponsibilityActor"(
      NEW."contractId", NEW."designatedByUserId", NEW."designatedAt"
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

  IF NEW."effectiveTo" IS NULL
     OR NEW."endedByUserId" IS NULL
     OR NEW."endedAt" IS NULL
     OR NULLIF(BTRIM(NEW."endReason"), '') IS NULL
     OR NEW."effectiveTo" IS DISTINCT FROM NEW."endedAt" THEN
    RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_END_INCOMPLETE' USING ERRCODE = '23514';
  END IF;

  IF NOT "isEligibleAdipometryResponsibilityActor"(
    NEW."contractId", NEW."endedByUserId", NEW."endedAt"
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_END_ACTOR_INVALID'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- Preserve every input used by buildAdipometrySpecificationHash. The API may
-- omit this column on insert; the database captures the canonical reference in
-- the same transaction and keeps it immutable afterwards.
CREATE OR REPLACE FUNCTION "guardAdipometryProtocolApprovalReferenceSnapshot"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_reference TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."protocolReferenceSnapshot" IS DISTINCT FROM OLD."protocolReferenceSnapshot" THEN
      RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_REFERENCE_SNAPSHOT_IMMUTABLE'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT protocol.reference INTO v_reference
  FROM "AdipometryProtocol" protocol
  WHERE protocol.id = NEW."protocolId"
    AND protocol.code = NEW."protocolCode"
    AND protocol.version = NEW."protocolVersion";

  IF NULLIF(BTRIM(v_reference), '') IS NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_REFERENCE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF NEW."protocolReferenceSnapshot" IS NULL THEN
    NEW."protocolReferenceSnapshot" := v_reference;
  ELSIF BTRIM(NEW."protocolReferenceSnapshot") IS DISTINCT FROM BTRIM(v_reference) THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_REFERENCE_SNAPSHOT_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- The legacy-compatibility gate intentionally installs only the early ADPT
-- foundation. Governance tables are absent there, so install the reference
-- snapshot only when the complete governance chain is present.
DO $install_reference_snapshot$
DECLARE
  v_invalid BOOLEAN;
BEGIN
  IF TO_REGCLASS('"AdipometryProtocolApproval"') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE "AdipometryProtocolApproval"
    ADD COLUMN "protocolReferenceSnapshot" TEXT';

  EXECUTE 'UPDATE "AdipometryProtocolApproval" approval
    SET "protocolReferenceSnapshot" = protocol.reference
    FROM "AdipometryProtocol" protocol
    WHERE protocol.id = approval."protocolId"
      AND protocol.code = approval."protocolCode"
      AND protocol.version = approval."protocolVersion"';

  EXECUTE 'SELECT EXISTS (
    SELECT 1
    FROM "AdipometryProtocolApproval"
    WHERE NULLIF(BTRIM("protocolReferenceSnapshot"), '''') IS NULL
  )' INTO v_invalid;

  IF v_invalid THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_REFERENCE_BACKFILL_INCOMPLETE';
  END IF;

  EXECUTE 'ALTER TABLE "AdipometryProtocolApproval"
    ALTER COLUMN "protocolReferenceSnapshot" SET NOT NULL,
    ADD CONSTRAINT "AdipometryProtocolApproval_reference_snapshot_check"
      CHECK (NULLIF(BTRIM("protocolReferenceSnapshot"), '''') IS NOT NULL)';

  EXECUTE 'CREATE TRIGGER "AdipometryProtocolApproval_00_reference_snapshot_guard"
    BEFORE INSERT OR UPDATE ON "AdipometryProtocolApproval"
    FOR EACH ROW EXECUTE FUNCTION "guardAdipometryProtocolApprovalReferenceSnapshot"()';
END;
$install_reference_snapshot$;

COMMIT;
