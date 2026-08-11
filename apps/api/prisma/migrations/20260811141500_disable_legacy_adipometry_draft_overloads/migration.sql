BEGIN;

-- Managed PostgreSQL providers can expose migration roles that are allowed to
-- own and replace functions but are explicitly forbidden from GRANT/REVOKE.
-- Preserve the historical signatures for compatibility, but make both
-- no-actor entry points fail closed before any persistence is attempted.
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
BEGIN
  RAISE EXCEPTION 'ADIPOMETRY_ACTOR_REQUIRED' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION "createAdipometryDraft"(
  p_id TEXT,
  p_contract_id TEXT,
  p_aluno_id TEXT,
  p_professor_id TEXT,
  p_assessment_date DATE,
  p_created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
) RETURNS TABLE("assessmentId" TEXT, "sequenceNumber" INTEGER, "code" TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ADIPOMETRY_ACTOR_REQUIRED' USING ERRCODE = '42501';
END;
$$;

COMMIT;
