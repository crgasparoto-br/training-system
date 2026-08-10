BEGIN;

-- Prisma serializes JavaScript Date values as timestamptz parameters. The
-- canonical ADPT database entry points intentionally persist timestamp(3)
-- values. Keep one business implementation and provide exact driver-facing
-- overloads that normalize instants to UTC before delegating.
CREATE OR REPLACE FUNCTION "createAdipometryDraft"(
  p_id TEXT,
  p_contract_id TEXT,
  p_aluno_id TEXT,
  p_professor_id TEXT,
  p_assessment_date TIMESTAMPTZ,
  p_actor_user_id TEXT,
  p_created_at TIMESTAMPTZ
) RETURNS TABLE("assessmentId" TEXT, "sequenceNumber" INTEGER, "code" TEXT)
LANGUAGE sql
AS $$
  SELECT *
  FROM "createAdipometryDraft"(
    p_id,
    p_contract_id,
    p_aluno_id,
    p_professor_id,
    (p_assessment_date AT TIME ZONE 'UTC')::TIMESTAMP(3),
    p_actor_user_id,
    (p_created_at AT TIME ZONE 'UTC')::TIMESTAMP(3)
  );
$$;

CREATE OR REPLACE FUNCTION "startAdipometryCorrection"(
  p_id TEXT,
  p_current_assessment_id TEXT,
  p_category TEXT,
  p_reason TEXT,
  p_actor_user_id TEXT,
  p_started_at TIMESTAMPTZ
) RETURNS TABLE(
  "assessmentId" TEXT,
  "rootAssessmentId" TEXT,
  "revisionNumber" INTEGER,
  "code" TEXT
)
LANGUAGE sql
AS $$
  SELECT *
  FROM "startAdipometryCorrection"(
    p_id,
    p_current_assessment_id,
    p_category,
    p_reason,
    p_actor_user_id,
    (p_started_at AT TIME ZONE 'UTC')::TIMESTAMP(3)
  );
$$;

COMMIT;
