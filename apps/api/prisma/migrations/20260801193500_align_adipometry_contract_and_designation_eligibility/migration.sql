BEGIN;

-- Issue #246 / A-246-10.
-- The persistence boundary must use the same target eligibility rule as the
-- API: an active same-contract professional with personal CREF and the
-- explicit adipometry protocol approval grant.
--
-- Some compatibility gates intentionally replay only the early ADPT foundation
-- and selected late guards. In that reduced chain the governance relation and
-- eligibility function do not exist, so this delta is a deliberate no-op.
DO $install_designation_eligibility$
BEGIN
  IF TO_REGCLASS('"AdipometryClinicalResponsibility"') IS NULL
     OR TO_REGPROCEDURE(
       '"isEligibleAdipometryClinicalResponsible"(text,text,timestamp without time zone)'
     ) IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $function$
    CREATE OR REPLACE FUNCTION "isEligibleAdipometryClinicalDesignation"(
      p_contract_id TEXT,
      p_professor_id TEXT,
      p_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
    ) RETURNS BOOLEAN
    LANGUAGE sql
    STABLE
    AS $body$
      SELECT "isEligibleAdipometryClinicalResponsible"(
        p_contract_id,
        p_professor_id,
        p_at
      );
    $body$
  $function$;

  IF EXISTS (
    SELECT 1
    FROM "AdipometryClinicalResponsibility" responsibility
    WHERE responsibility."effectiveTo" IS NULL
      AND NOT "isEligibleAdipometryClinicalDesignation"(
        responsibility."contractId",
        responsibility."professorId",
        CURRENT_TIMESTAMP
      )
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_ACTIVE_RESPONSIBILITY_PERMISSION_INVALID'
      USING ERRCODE = '23514';
  END IF;
END;
$install_designation_eligibility$;

COMMIT;
