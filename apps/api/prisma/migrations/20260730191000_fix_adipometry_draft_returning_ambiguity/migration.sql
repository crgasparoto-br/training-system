BEGIN;

-- Qualify RETURNING columns because PL/pgSQL output column names use the same
-- identifiers as the persisted assessment fields.
CREATE OR REPLACE FUNCTION "createAdipometryDraft"(
  p_id TEXT,
  p_contract_id TEXT,
  p_aluno_id TEXT,
  p_professor_id TEXT,
  p_assessment_date TIMESTAMP(3),
  p_created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
) RETURNS TABLE("assessmentId" TEXT, "sequenceNumber" INTEGER, "code" TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_sequence INTEGER;
  v_code TEXT;
BEGIN
  INSERT INTO "AdipometryAssessment" AS assessment (
    "id", "contractId", "alunoId", "professorId", "sequenceNumber", "code",
    "assessmentDate", "status", "createdAt", "updatedAt"
  ) VALUES (
    p_id, p_contract_id, p_aluno_id, p_professor_id, 1, 'ADPT-001',
    p_assessment_date, 'DRAFT', p_created_at, p_created_at
  )
  RETURNING assessment."sequenceNumber", assessment."code"
    INTO v_sequence, v_code;

  RETURN QUERY SELECT p_id, v_sequence, v_code;
END;
$$;

CREATE OR REPLACE FUNCTION "createAdipometryDraft"(
  p_id TEXT,
  p_contract_id TEXT,
  p_aluno_id TEXT,
  p_professor_id TEXT,
  p_assessment_date TIMESTAMP(3),
  p_actor_user_id TEXT,
  p_created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
) RETURNS TABLE("assessmentId" TEXT, "sequenceNumber" INTEGER, "code" TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_sequence INTEGER;
  v_code TEXT;
BEGIN
  IF NULLIF(BTRIM(p_actor_user_id), '') IS NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_ACTOR_REQUIRED' USING ERRCODE = '42501';
  END IF;

  PERFORM SET_CONFIG('app.adipometry_actor_user_id', p_actor_user_id, TRUE);
  PERFORM "requireAdipometryActorUserId"(p_contract_id);

  INSERT INTO "AdipometryAssessment" AS assessment (
    "id", "contractId", "alunoId", "professorId", "sequenceNumber", "code",
    "assessmentDate", "status", "createdAt", "updatedAt"
  ) VALUES (
    p_id, p_contract_id, p_aluno_id, p_professor_id, 1, 'ADPT-001',
    p_assessment_date, 'DRAFT', p_created_at, p_created_at
  )
  RETURNING assessment."sequenceNumber", assessment."code"
    INTO v_sequence, v_code;

  RETURN QUERY SELECT p_id, v_sequence, v_code;
END;
$$;

COMMIT;
