-- Issue #248: o usuário que confirma o sexo do protocolo pode ser um
-- profissional autenticado por ProfessionalActorMembership, sem possuir uma
-- linha própria em Professor. O responsável clínico continua sendo validado
-- separadamente e permanece uma referência Professor.
--
-- Bancos legados sem a fundação ADPT permanecem no-op.
DO $migration$
DECLARE
  v_target_oid OID;
  v_target_count INTEGER;
  v_definition TEXT;
  v_before TEXT;
  v_tail TEXT;
  v_match TEXT[];
  v_patched TEXT;
  v_marker CONSTANT TEXT :=
    'ADIPOMETRY_PROTOCOL_SEX_CONFIRMER_OUTSIDE_CONTRACT';
  v_marker_position INTEGER;
  v_start INTEGER;
  v_end_relative INTEGER;
  v_after INTEGER;
BEGIN
  IF TO_REGCLASS('public."AdipometryAssessment"') IS NULL
     OR TO_REGCLASS('public."ProfessionalActorMembership"') IS NULL
  THEN
    RETURN;
  END IF;

  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION "isAdipometryProtocolSexConfirmerInContract"(
      p_user_id TEXT,
      p_contract_id TEXT
    ) RETURNS BOOLEAN
    LANGUAGE sql
    STABLE
    AS $function$
      SELECT EXISTS (
        SELECT 1
        FROM "Professor" professor
        WHERE professor."userId" = p_user_id
          AND professor."contractId" = p_contract_id
      ) OR EXISTS (
        SELECT 1
        FROM "ProfessionalActorMembership" membership
        WHERE membership."userId" = p_user_id
          AND membership."contractId" = p_contract_id
      );
    $function$;
  $ddl$;

  SELECT COUNT(*), MIN(proc.oid)
    INTO v_target_count, v_target_oid
  FROM pg_proc proc
  JOIN pg_namespace namespace ON namespace.oid = proc.pronamespace
  WHERE namespace.nspname = 'public'
    AND proc.prokind = 'f'
    AND POSITION(v_marker IN PG_GET_FUNCTIONDEF(proc.oid)) > 0;

  IF v_target_count <> 1 OR v_target_oid IS NULL THEN
    RAISE EXCEPTION
      'ADIPOMETRY_PROTOCOL_SEX_CONFIRMER_GUARD_AMBIGUOUS: % function(s)',
      v_target_count;
  END IF;

  SELECT PG_GET_FUNCTIONDEF(v_target_oid)
    INTO v_definition;

  v_marker_position := POSITION(v_marker IN v_definition);
  v_before := SUBSTRING(v_definition FROM 1 FOR v_marker_position - 1);

  -- O grupo guloso captura até o último token IF anterior ao código de erro,
  -- ou seja, o início do bloco específico que contém essa exceção.
  v_match := REGEXP_MATCH(v_before, '^(.*)(\mIF\M)');
  IF v_match IS NULL OR ARRAY_LENGTH(v_match, 1) < 1 THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_SEX_CONFIRMER_GUARD_START_NOT_FOUND';
  END IF;
  v_start := LENGTH(v_match[1]) + 1;

  v_tail := SUBSTRING(v_definition FROM v_marker_position);
  v_end_relative := POSITION('END IF;' IN v_tail);
  IF v_end_relative = 0 THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_SEX_CONFIRMER_GUARD_END_NOT_FOUND';
  END IF;
  v_after := v_marker_position + v_end_relative - 1 + LENGTH('END IF;');

  v_patched :=
    SUBSTRING(v_definition FROM 1 FOR v_start - 1)
    || $replacement$
IF NEW."protocolSexConfirmedByUserId" IS NOT NULL
   AND NOT "isAdipometryProtocolSexConfirmerInContract"(
     NEW."protocolSexConfirmedByUserId",
     NEW."contractId"
   )
THEN
  RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_SEX_CONFIRMER_OUTSIDE_CONTRACT'
    USING ERRCODE = '23514';
END IF;
$replacement$
    || SUBSTRING(v_definition FROM v_after);

  -- Não permita que um patch de texto remova hardenings independentes do
  -- trigger vigente.
  IF POSITION('requireAdipometryActorUserId' IN v_patched) = 0
     OR POSITION('ADIPOMETRY_CORRECTION_ACTOR_MISMATCH' IN v_patched) = 0
     OR POSITION('ADIPOMETRY_REVISION_ROOT_INVALID' IN v_patched) = 0
  THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_SEX_PATCH_WOULD_LOSE_HARDENING';
  END IF;

  EXECUTE v_patched;

  SELECT PG_GET_FUNCTIONDEF(v_target_oid)
    INTO v_definition;
  IF POSITION('isAdipometryProtocolSexConfirmerInContract' IN v_definition) = 0
     OR POSITION('requireAdipometryActorUserId' IN v_definition) = 0
     OR POSITION('ADIPOMETRY_CORRECTION_ACTOR_MISMATCH' IN v_definition) = 0
     OR POSITION('ADIPOMETRY_REVISION_ROOT_INVALID' IN v_definition) = 0
  THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_SEX_PATCH_VERIFICATION_FAILED';
  END IF;
END
$migration$;
