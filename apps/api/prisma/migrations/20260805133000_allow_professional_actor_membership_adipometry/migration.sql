BEGIN;

-- Issue #248 audit-escape remediation.
-- The authenticated actor and the clinical responsible are separate
-- authorities. Preserve the existing Professor path and additionally accept a
-- tenant-scoped, active ProfessionalActorMembership owned by the actor.
CREATE OR REPLACE FUNCTION "requireAdipometryActorUserId"(
  p_contract_id TEXT,
  p_fallback_professor_id TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_actor_user_id TEXT := NULLIF(CURRENT_SETTING('app.adipometry_actor_user_id', TRUE), '');
BEGIN
  -- Database owners can execute migration and verification SQL. Application
  -- roles must always provide the authenticated actor through transaction-local
  -- context or the explicit actor overload of createAdipometryDraft.
  IF v_actor_user_id IS NULL AND CURRENT_USER = 'postgres' AND p_fallback_professor_id IS NOT NULL THEN
    SELECT professor."userId" INTO v_actor_user_id
    FROM "Professor" professor
    WHERE professor."id" = p_fallback_professor_id
      AND professor."contractId" = p_contract_id;
  END IF;

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_ACTOR_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1
      FROM "Professor" professor
      JOIN "User" actor ON actor."id" = professor."userId"
      WHERE professor."userId" = v_actor_user_id
        AND professor."contractId" = p_contract_id
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
      WHERE membership."userId" = v_actor_user_id
        AND membership."contractId" = p_contract_id
        AND membership."isActive" = TRUE
        AND actor."isActive" = TRUE
        AND actor."type"::TEXT = 'professor'
        AND collaborator_function."isActive" = TRUE
    )
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_ACTOR_CROSS_TENANT_OR_INACTIVE' USING ERRCODE = '42501';
  END IF;

  RETURN v_actor_user_id;
END;
$$;

COMMIT;
