BEGIN;

-- Issue #246 independent-audit remediation.
-- Completion already requires an active contract approval, but the historical
-- snapshot must be bound to that same active row rather than to an arbitrary
-- revoked approval for the same protocol identity.
CREATE OR REPLACE FUNCTION "bindActiveAdipometryApprovalSnapshot"()
RETURNS trigger
LANGUAGE plpgsql
AS $active_snapshot$
DECLARE
  v_approval JSONB;
BEGIN
  IF NEW."status" <> 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  -- Completed assessments are immutable. Reciprocal revision-link updates must
  -- preserve the approval snapshot captured at the original completion instant.
  IF TG_OP = 'UPDATE' AND OLD."status" = 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  SELECT JSONB_BUILD_OBJECT(
           'id', approval.id,
           'responsibilityId', approval."responsibilityId",
           'approvedAt', TO_CHAR(
             approval."approvedAt" AT TIME ZONE 'UTC',
             'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
           ),
           'approvedByProfessorId', approval."approvedByProfessorId",
           'approvedByName', approval."approvedByNameSnapshot",
           'approvedByCref', approval."approvedByCrefSnapshot",
           'approvedSpecificationHash', approval."approvedSpecificationHash"
         )
    INTO v_approval
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
    AND protocol.status <> 'DISABLED'
    AND approval."approvedSpecificationHash" =
      "buildAdipometrySpecificationHash"(
        protocol.code,
        protocol.version,
        protocol.reference,
        protocol."definitionSnapshot"
      )
  ORDER BY approval."approvedAt" DESC, approval.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_NOT_APPROVED_FOR_CONTRACT'
      USING ERRCODE = '23514';
  END IF;

  IF JSONB_TYPEOF(NEW."calculationSnapshot") IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ADIPOMETRY_CALCULATION_SNAPSHOT_REQUIRED'
      USING ERRCODE = '23514';
  END IF;

  NEW."calculationSnapshot" := JSONB_SET(
    NEW."calculationSnapshot",
    '{protocolApproval}',
    v_approval,
    TRUE
  );

  RETURN NEW;
END;
$active_snapshot$;

-- The reduced legacy-chain gate intentionally installs only selected ADPT
-- migrations. Install the trigger only when its complete dependency set exists;
-- the normal production chain reaches this migration with every dependency.
DO $install_active_snapshot_trigger$
BEGIN
  IF TO_REGCLASS('"AdipometryAssessment"') IS NULL
     OR TO_REGCLASS('"AdipometryProtocolApproval"') IS NULL
     OR TO_REGCLASS('"AdipometryProtocol"') IS NULL
     OR TO_REGPROCEDURE(
       '"buildAdipometrySpecificationHash"(text,integer,text,jsonb)'
     ) IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'DROP TRIGGER IF EXISTS
    "zzzz_AdipometryAssessment_active_approval_snapshot"
    ON "AdipometryAssessment"';
  EXECUTE 'CREATE TRIGGER
    "zzzz_AdipometryAssessment_active_approval_snapshot"
    BEFORE INSERT OR UPDATE OF
      status, "contractId", "protocolId", "protocolCode", "protocolVersion"
    ON "AdipometryAssessment"
    FOR EACH ROW
    EXECUTE FUNCTION "bindActiveAdipometryApprovalSnapshot"()';
END;
$install_active_snapshot_trigger$;

COMMIT;
