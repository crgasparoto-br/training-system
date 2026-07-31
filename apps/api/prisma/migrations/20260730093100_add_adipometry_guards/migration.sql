-- Atomic allocation: PostgreSQL serializes concurrent upserts on the same
-- (contractId, alunoId) key. The sequence update and draft insert execute in
-- the caller transaction, so a failed insert rolls the increment back.
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
  INSERT INTO "AdipometrySequence" ("contractId", "alunoId", "lastValue", "updatedAt")
  VALUES (p_contract_id, p_aluno_id, 1, p_created_at)
  ON CONFLICT ("contractId", "alunoId")
  DO UPDATE SET
    "lastValue" = "AdipometrySequence"."lastValue" + 1,
    "updatedAt" = EXCLUDED."updatedAt"
  RETURNING "lastValue" INTO v_sequence;

  v_code := 'ADPT-' || lpad(v_sequence::TEXT, 3, '0');

  INSERT INTO "AdipometryAssessment" (
    "id", "contractId", "alunoId", "professorId", "sequenceNumber", "code",
    "assessmentDate", "status", "createdAt", "updatedAt"
  ) VALUES (
    p_id, p_contract_id, p_aluno_id, p_professor_id, v_sequence, v_code,
    p_assessment_date, 'DRAFT', p_created_at, p_created_at
  );

  RETURN QUERY SELECT p_id, v_sequence, v_code;
END;
$$;

-- A completed assessment is immutable through common UPDATE statements.
-- The only permitted mutation is linking the correcting assessment back to
-- the original record. All clinical values and the preserved snapshot remain
-- unchanged.
CREATE OR REPLACE FUNCTION "protectCompletedAdipometryAssessment"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'COMPLETED' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
      OR NEW."contractId" IS DISTINCT FROM OLD."contractId"
      OR NEW."alunoId" IS DISTINCT FROM OLD."alunoId"
      OR NEW."professorId" IS DISTINCT FROM OLD."professorId"
      OR NEW."sequenceNumber" IS DISTINCT FROM OLD."sequenceNumber"
      OR NEW."code" IS DISTINCT FROM OLD."code"
      OR NEW."assessmentDate" IS DISTINCT FROM OLD."assessmentDate"
      OR NEW."status" IS DISTINCT FROM OLD."status"
      OR NEW."weightKg" IS DISTINCT FROM OLD."weightKg"
      OR NEW."tricepsMm" IS DISTINCT FROM OLD."tricepsMm"
      OR NEW."subscapularMm" IS DISTINCT FROM OLD."subscapularMm"
      OR NEW."suprailiacMm" IS DISTINCT FROM OLD."suprailiacMm"
      OR NEW."abdominalMm" IS DISTINCT FROM OLD."abdominalMm"
      OR NEW."thighMm" IS DISTINCT FROM OLD."thighMm"
      OR NEW."skinfoldTotalMm" IS DISTINCT FROM OLD."skinfoldTotalMm"
      OR NEW."bodyFatPercentage" IS DISTINCT FROM OLD."bodyFatPercentage"
      OR NEW."fatMassKg" IS DISTINCT FROM OLD."fatMassKg"
      OR NEW."leanMassKg" IS DISTINCT FROM OLD."leanMassKg"
      OR NEW."protocolId" IS DISTINCT FROM OLD."protocolId"
      OR NEW."protocolCode" IS DISTINCT FROM OLD."protocolCode"
      OR NEW."protocolVersion" IS DISTINCT FROM OLD."protocolVersion"
      OR NEW."calculationSnapshot" IS DISTINCT FROM OLD."calculationSnapshot"
      OR NEW."anthropometryAssessmentId" IS DISTINCT FROM OLD."anthropometryAssessmentId"
      OR NEW."notes" IS DISTINCT FROM OLD."notes"
      OR NEW."completedAt" IS DISTINCT FROM OLD."completedAt"
      OR NEW."correctsAssessmentId" IS DISTINCT FROM OLD."correctsAssessmentId"
      OR NEW."correctionReason" IS DISTINCT FROM OLD."correctionReason"
      OR NEW."correctionAuthorUserId" IS DISTINCT FROM OLD."correctionAuthorUserId"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    THEN
      RAISE EXCEPTION 'Completed adipometry assessments are immutable; create an audited correction instead'
        USING ERRCODE = '55000';
    END IF;

    IF OLD."correctedByAssessmentId" IS NOT NULL
       AND NEW."correctedByAssessmentId" IS DISTINCT FROM OLD."correctedByAssessmentId"
    THEN
      RAISE EXCEPTION 'A completed adipometry assessment can be corrected only once'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AdipometryAssessment_completed_immutable"
BEFORE UPDATE ON "AdipometryAssessment"
FOR EACH ROW
EXECUTE FUNCTION "protectCompletedAdipometryAssessment"();

CREATE OR REPLACE FUNCTION "preventCompletedAdipometryDeletion"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'COMPLETED' THEN
    RAISE EXCEPTION 'Completed adipometry assessments cannot be physically deleted'
      USING ERRCODE = '55000';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "AdipometryAssessment_completed_no_delete"
BEFORE DELETE ON "AdipometryAssessment"
FOR EACH ROW
EXECUTE FUNCTION "preventCompletedAdipometryDeletion"();
