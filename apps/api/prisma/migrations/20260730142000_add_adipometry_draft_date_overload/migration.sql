-- SQL callers and Prisma commonly provide assessment dates as DATE values and
-- creation timestamps as TIMESTAMPTZ. Keep the canonical implementation in the
-- timestamp overload and bridge these native PostgreSQL types explicitly.
CREATE OR REPLACE FUNCTION "createAdipometryDraft"(
  p_id TEXT,
  p_contract_id TEXT,
  p_aluno_id TEXT,
  p_professor_id TEXT,
  p_assessment_date DATE,
  p_created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
) RETURNS TABLE("assessmentId" TEXT, "sequenceNumber" INTEGER, "code" TEXT)
LANGUAGE sql
AS $$
  SELECT *
  FROM "createAdipometryDraft"(
    p_id,
    p_contract_id,
    p_aluno_id,
    p_professor_id,
    p_assessment_date::TIMESTAMP(3),
    p_created_at::TIMESTAMP(3)
  );
$$;
