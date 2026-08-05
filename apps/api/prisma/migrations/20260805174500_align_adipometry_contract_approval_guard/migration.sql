-- Issue #248: a definição clínica é global, mas a autorização de uso é
-- contratual. A conclusão já possui guards independentes que validam aprovação
-- ativa, identidade e hash por contrato. Esta migração remove somente a
-- verificação legada duplicada que ainda exigia estado global do protocolo,
-- preservando integralmente as proteções posteriores de ator e revisão.
--
-- Bancos legados sem a fundação ADPT permanecem no-op.
DO $migration$
DECLARE
  v_function REGPROCEDURE;
  v_definition TEXT;
  v_patched TEXT;
  v_marker TEXT;
  v_error_marker CONSTANT TEXT :=
    'RAISE EXCEPTION ''ADIPOMETRY_PROTOCOL_NOT_APPROVED_FOR_CONTRACT''';
  v_start INTEGER;
  v_error INTEGER;
  v_end_relative INTEGER;
  v_after INTEGER;
BEGIN
  IF TO_REGCLASS('public."AdipometryAssessment"') IS NULL
     OR TO_REGCLASS('public."AdipometryProtocolApproval"') IS NULL
  THEN
    RETURN;
  END IF;

  v_function := TO_REGPROCEDURE(
    'public."validateAdipometryAssessmentState"()'
  );
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_STATE_GUARD_NOT_FOUND';
  END IF;

  IF TO_REGPROCEDURE(
       'public."guardAdipometryApprovalHashAtCompletion"()'
     ) IS NULL
     AND TO_REGPROCEDURE(
       'public."guardAdipometryActiveContractApproval"()'
     ) IS NULL
  THEN
    RAISE EXCEPTION 'ADIPOMETRY_CONTRACT_APPROVAL_GUARD_NOT_FOUND';
  END IF;

  SELECT PG_GET_FUNCTIONDEF(v_function)
    INTO v_definition;

  v_marker := 'IF NEW.status = ''COMPLETED'' AND NOT EXISTS (';
  v_start := POSITION(v_marker IN v_definition);
  IF v_start = 0 THEN
    v_marker := 'IF NEW."status" = ''COMPLETED'' AND NOT EXISTS (';
    v_start := POSITION(v_marker IN v_definition);
  END IF;

  IF v_start = 0 THEN
    RAISE EXCEPTION 'ADIPOMETRY_LEGACY_APPROVAL_GUARD_START_NOT_FOUND';
  END IF;

  v_error := POSITION(
    v_error_marker IN SUBSTRING(v_definition FROM v_start)
  );
  IF v_error = 0 THEN
    RAISE EXCEPTION 'ADIPOMETRY_LEGACY_APPROVAL_GUARD_ERROR_NOT_FOUND';
  END IF;
  v_error := v_start + v_error - 1;

  v_end_relative := POSITION(
    'END IF;' IN SUBSTRING(v_definition FROM v_error)
  );
  IF v_end_relative = 0 THEN
    RAISE EXCEPTION 'ADIPOMETRY_LEGACY_APPROVAL_GUARD_END_NOT_FOUND';
  END IF;

  v_after := v_error + v_end_relative - 1 + LENGTH('END IF;');
  v_patched :=
    SUBSTRING(v_definition FROM 1 FOR v_start - 1)
    || E'-- Aprovação contratual validada pelos guards independentes.\n  '
    || SUBSTRING(v_definition FROM v_after);

  IF POSITION(v_error_marker IN v_patched) > 0 THEN
    RAISE EXCEPTION 'ADIPOMETRY_LEGACY_APPROVAL_GUARD_STILL_PRESENT';
  END IF;

  -- Falhe fechado se a função vigente não contiver os hardenings que esta
  -- migração deve obrigatoriamente preservar.
  IF POSITION('requireAdipometryActorUserId' IN v_patched) = 0
     OR POSITION('ADIPOMETRY_CORRECTION_ACTOR_MISMATCH' IN v_patched) = 0
     OR POSITION('ADIPOMETRY_REVISION_ROOT_INVALID' IN v_patched) = 0
  THEN
    RAISE EXCEPTION 'ADIPOMETRY_STATE_GUARD_HARDENING_WOULD_BE_LOST';
  END IF;

  EXECUTE v_patched;

  SELECT PG_GET_FUNCTIONDEF(v_function)
    INTO v_definition;
  IF POSITION(v_error_marker IN v_definition) > 0
     OR POSITION('requireAdipometryActorUserId' IN v_definition) = 0
     OR POSITION('ADIPOMETRY_CORRECTION_ACTOR_MISMATCH' IN v_definition) = 0
     OR POSITION('ADIPOMETRY_REVISION_ROOT_INVALID' IN v_definition) = 0
  THEN
    RAISE EXCEPTION 'ADIPOMETRY_STATE_GUARD_PATCH_VERIFICATION_FAILED';
  END IF;
END
$migration$;
