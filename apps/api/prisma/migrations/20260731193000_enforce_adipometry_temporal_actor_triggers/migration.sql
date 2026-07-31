BEGIN;

-- Issue #246: install independent temporal/actor guards without depending on
-- replacement of legacy trigger functions. Reduced legacy-chain tests may not
-- have the governance tables yet, so trigger installation remains conditional.
CREATE OR REPLACE FUNCTION "enforceAdipometryResponsibilityTemporalAuthority"()
RETURNS trigger
LANGUAGE plpgsql
AS $guard$
DECLARE
  v_actor TEXT;
  v_now TIMESTAMP(3) := CURRENT_TIMESTAMP;
BEGIN
  v_actor := "currentAdipometryAuthenticatedActor"();

  IF TG_OP = 'INSERT' THEN
    IF v_actor IS NOT NULL AND NEW."designatedByUserId" IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_ACTOR_CONTEXT_MISMATCH'
        USING ERRCODE = '23514';
    END IF;

    NEW."designatedAt" := v_now;
    NEW."effectiveFrom" := v_now;
    RETURN NEW;
  END IF;

  IF NEW."endedByUserId" IS NOT NULL THEN
    IF v_actor IS NOT NULL AND NEW."endedByUserId" IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_ACTOR_CONTEXT_MISMATCH'
        USING ERRCODE = '23514';
    END IF;

    NEW."endedAt" := v_now;
    NEW."effectiveTo" := v_now;
  END IF;

  RETURN NEW;
END;
$guard$;

CREATE OR REPLACE FUNCTION "enforceAdipometryApprovalTemporalAuthority"()
RETURNS trigger
LANGUAGE plpgsql
AS $guard$
DECLARE
  v_actor TEXT;
  v_now TIMESTAMP(3) := CURRENT_TIMESTAMP;
BEGIN
  v_actor := "currentAdipometryAuthenticatedActor"();

  IF TG_OP = 'INSERT' THEN
    IF v_actor IS NOT NULL AND NEW."approvedByUserId" IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_ACTOR_CONTEXT_MISMATCH'
        USING ERRCODE = '23514';
    END IF;

    NEW."approvedAt" := v_now;
    RETURN NEW;
  END IF;

  IF NEW."revokedByUserId" IS NOT NULL THEN
    IF v_actor IS NOT NULL AND NEW."revokedByUserId" IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_ACTOR_CONTEXT_MISMATCH'
        USING ERRCODE = '23514';
    END IF;

    NEW."revokedAt" := v_now;
  END IF;

  RETURN NEW;
END;
$guard$;

CREATE OR REPLACE FUNCTION "freezeAdipometryProtocolAfterContractApproval"()
RETURNS trigger
LANGUAGE plpgsql
AS $freeze$
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

  IF NOT v_has_approval THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Referenced adipometry protocol identity is immutable; create a new version'
      USING ERRCODE = '55000';
  END IF;

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
END;
$freeze$;

CREATE OR REPLACE FUNCTION "guardAdipometryApprovalHashAtCompletion"()
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
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_NOT_APPROVED_FOR_CONTRACT'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$guard$;

DO $install_guards$
BEGIN
  IF TO_REGCLASS('"AdipometryClinicalResponsibility"') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS
      "AdipometryClinicalResponsibility_00_temporal_authority"
      ON "AdipometryClinicalResponsibility"';
    EXECUTE 'CREATE TRIGGER
      "AdipometryClinicalResponsibility_00_temporal_authority"
      BEFORE INSERT OR UPDATE ON "AdipometryClinicalResponsibility"
      FOR EACH ROW EXECUTE FUNCTION "enforceAdipometryResponsibilityTemporalAuthority"()';
  END IF;

  IF TO_REGCLASS('"AdipometryProtocolApproval"') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS
      "AdipometryProtocolApproval_02_temporal_actor_guard"
      ON "AdipometryProtocolApproval"';
    EXECUTE 'CREATE TRIGGER
      "AdipometryProtocolApproval_02_temporal_actor_guard"
      BEFORE INSERT OR UPDATE ON "AdipometryProtocolApproval"
      FOR EACH ROW EXECUTE FUNCTION "enforceAdipometryApprovalTemporalAuthority"()';

    EXECUTE 'DROP TRIGGER IF EXISTS
      "AdipometryProtocol_00_contract_approval_freeze"
      ON "AdipometryProtocol"';
    EXECUTE 'CREATE TRIGGER
      "AdipometryProtocol_00_contract_approval_freeze"
      BEFORE UPDATE OR DELETE ON "AdipometryProtocol"
      FOR EACH ROW EXECUTE FUNCTION "freezeAdipometryProtocolAfterContractApproval"()';

    EXECUTE 'DROP TRIGGER IF EXISTS
      "AdipometryAssessment_00_active_approval_hash_guard"
      ON "AdipometryAssessment"';
    EXECUTE 'CREATE TRIGGER
      "AdipometryAssessment_00_active_approval_hash_guard"
      BEFORE INSERT OR UPDATE OF status, "contractId", "protocolId", "protocolCode", "protocolVersion"
      ON "AdipometryAssessment"
      FOR EACH ROW EXECUTE FUNCTION "guardAdipometryApprovalHashAtCompletion"()';
  END IF;
END;
$install_guards$;

COMMIT;
