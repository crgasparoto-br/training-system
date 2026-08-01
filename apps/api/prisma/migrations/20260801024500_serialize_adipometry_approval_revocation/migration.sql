BEGIN;

-- Issue #246 / A-246-07 and A-246-08.
-- Completion and revocation must be serialized on the same active approval row.
-- FOR SHARE keeps a completion that has already bound the approval ahead of a
-- later revocation, while a completion that starts after an uncommitted
-- revocation waits and then re-evaluates the revokedAt predicate fail-closed.
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
           'approvedSpecificationHash', approval."approvedSpecificationHash",
           'protocolReference', approval."protocolReferenceSnapshot",
           'protocolDefinitionSnapshot', approval."protocolDefinitionSnapshot"
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
  LIMIT 1
  FOR SHARE OF approval;

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

COMMIT;
