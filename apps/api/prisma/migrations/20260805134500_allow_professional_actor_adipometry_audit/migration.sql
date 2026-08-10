BEGIN;

-- Issue #248 audit-escape remediation.
-- Audit attribution must validate the authenticated actor independently from
-- the clinical responsible stored on the assessment.
CREATE OR REPLACE FUNCTION "validateAdipometryAuditEvent"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_table_owner TEXT;
BEGIN
  SELECT PG_GET_USERBYID(class.relowner)
    INTO v_table_owner
  FROM pg_class class
  WHERE class.oid = 'public."AdipometryAuditEvent"'::REGCLASS;

  IF CURRENT_USER IS DISTINCT FROM v_table_owner THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_INSERT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1
      FROM "Professor" professor
      JOIN "User" actor ON actor."id" = professor."userId"
      WHERE professor."userId" = NEW."actorUserId"
        AND professor."contractId" = NEW."contractId"
        AND actor."isActive" = TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM "ProfessionalActorMembership" membership
      JOIN "User" actor
        ON actor."id" = membership."userId"
      JOIN "CollaboratorFunctionOption" collaborator_function
        ON collaborator_function."id" = membership."collaboratorFunctionId"
       AND collaborator_function."contractId" = membership."contractId"
      WHERE membership."userId" = NEW."actorUserId"
        AND membership."contractId" = NEW."contractId"
        AND membership."isActive" = TRUE
        AND actor."isActive" = TRUE
        AND actor."type"::TEXT = 'professor'
        AND collaborator_function."isActive" = TRUE
    )
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_ACTOR_CROSS_TENANT_OR_INACTIVE'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."action" = 'DRAFT_CREATED' AND NOT (
       NEW."beforeSnapshot" IS NULL
       AND NEW."afterSnapshot" ->> 'status' = 'DRAFT'
     ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_EVENT_INVALID' USING ERRCODE = '23514';
  ELSIF NEW."action" = 'DRAFT_UPDATED' AND NOT (
       NEW."beforeSnapshot" ->> 'status' = 'DRAFT'
       AND NEW."afterSnapshot" ->> 'status' = 'DRAFT'
     ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_EVENT_INVALID' USING ERRCODE = '23514';
  ELSIF NEW."action" = 'COMPLETED' AND NOT (
       NEW."afterSnapshot" ->> 'status' = 'COMPLETED'
       AND (NEW."beforeSnapshot" IS NULL OR NEW."beforeSnapshot" ->> 'status' = 'DRAFT')
     ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_EVENT_INVALID' USING ERRCODE = '23514';
  ELSIF NEW."action" = 'CORRECTION_CREATED' AND NOT (
       NEW."afterSnapshot" ->> 'status' = 'COMPLETED'
       AND NULLIF(BTRIM(NEW."afterSnapshot" ->> 'correctsAssessmentId'), '') IS NOT NULL
       AND NULLIF(BTRIM(NEW."reason"), '') IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_EVENT_INVALID' USING ERRCODE = '23514';
  ELSIF NEW."action" = 'CORRECTION_LINKED' AND NOT (
       NEW."beforeSnapshot" ->> 'status' = 'COMPLETED'
       AND NEW."afterSnapshot" ->> 'status' = 'COMPLETED'
       AND NEW."beforeSnapshot" -> 'correctedByAssessmentId' = 'null'::JSONB
       AND JSONB_TYPEOF(NEW."afterSnapshot" -> 'correctedByAssessmentId') = 'string'
       AND NULLIF(BTRIM(NEW."reason"), '') IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_EVENT_INVALID' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
