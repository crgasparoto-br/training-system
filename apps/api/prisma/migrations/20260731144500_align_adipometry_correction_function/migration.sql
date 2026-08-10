BEGIN;

-- The lifecycle migration originally validated the collapsed category set.
-- Replace the database entry point so every caller uses the six categories
-- explicitly approved in issue #246.
CREATE OR REPLACE FUNCTION "startAdipometryCorrection"(
  p_id TEXT,
  p_current_assessment_id TEXT,
  p_category TEXT,
  p_reason TEXT,
  p_actor_user_id TEXT,
  p_started_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
) RETURNS TABLE(
  "assessmentId" TEXT,
  "rootAssessmentId" TEXT,
  "revisionNumber" INTEGER,
  "code" TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_current "AdipometryAssessment"%ROWTYPE;
  v_result "AdipometryAssessment"%ROWTYPE;
BEGIN
  IF p_category NOT IN (
    'DATA_ENTRY_ERROR',
    'MEASUREMENT_TRANSCRIPTION_ERROR',
    'EVALUATION_DATE_ERROR',
    'PROTOCOL_SEX_ERROR',
    'PROTOCOL_SELECTION_ERROR',
    'OTHER'
  ) OR NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_METADATA_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_current
  FROM "AdipometryAssessment"
  WHERE id = p_current_assessment_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_current."revisionStatus" <> 'FINALIZED'
     OR v_current."correctedByAssessmentId" IS NOT NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_INVALID_CORRECTION_TARGET' USING ERRCODE = '23514';
  END IF;

  PERFORM SET_CONFIG('app.adipometry_actor_user_id', p_actor_user_id, TRUE);
  PERFORM "requireAdipometryActorUserId"(v_current."contractId", v_current."professorId");

  IF EXISTS (
    SELECT 1 FROM "AdipometryAssessment" correction
    WHERE correction."rootAssessmentId" = v_current."rootAssessmentId"
      AND correction."revisionStatus" = 'DRAFT'
      AND correction."revisionNumber" > 1
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_ALREADY_OPEN' USING ERRCODE = '23505';
  END IF;

  INSERT INTO "AdipometryAssessment" (
    id, "contractId", "alunoId", "professorId", "sequenceNumber", code,
    "assessmentDate", status, "weightKg", "tricepsMm", "subscapularMm",
    "suprailiacMm", "abdominalMm", "thighMm", "protocolId",
    "protocolCode", "protocolVersion", "anthropometryAssessmentId", notes,
    "protocolSex", "profileSexSnapshot", "protocolSexSource",
    "protocolSexConfirmedByUserId", "protocolSexConfirmedAt",
    "protocolSexOverrideReason", "skinfoldCapacityWarningConfirmedByUserId",
    "skinfoldCapacityWarningConfirmedAt", "correctsAssessmentId",
    "correctionReason", "correctionAuthorUserId", "correctionCategory",
    "correctionStartedAt", "beforeSnapshot", "createdAt", "updatedAt"
  ) VALUES (
    p_id, v_current."contractId", v_current."alunoId", v_current."professorId",
    v_current."sequenceNumber", v_current.code, v_current."assessmentDate", 'DRAFT',
    v_current."weightKg", v_current."tricepsMm", v_current."subscapularMm",
    v_current."suprailiacMm", v_current."abdominalMm", v_current."thighMm",
    v_current."protocolId", v_current."protocolCode", v_current."protocolVersion",
    v_current."anthropometryAssessmentId", v_current.notes, v_current."protocolSex",
    v_current."profileSexSnapshot", v_current."protocolSexSource",
    v_current."protocolSexConfirmedByUserId", v_current."protocolSexConfirmedAt",
    v_current."protocolSexOverrideReason",
    v_current."skinfoldCapacityWarningConfirmedByUserId",
    v_current."skinfoldCapacityWarningConfirmedAt", v_current.id,
    p_reason, p_actor_user_id, p_category, p_started_at,
    TO_JSONB(v_current), p_started_at, p_started_at
  ) RETURNING * INTO v_result;

  RETURN QUERY
  SELECT v_result.id, v_result."rootAssessmentId", v_result."revisionNumber", v_result.code;
END;
$$;

-- Designation establishes historical responsibility, but it is not itself an
-- approval grant. Approval and revocation still use the stricter eligibility
-- function, which requires the explicit sensitive permission.
CREATE OR REPLACE FUNCTION "isEligibleAdipometryClinicalDesignation"(
  p_contract_id TEXT,
  p_professor_id TEXT,
  p_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "Professor" professor
    JOIN "User" app_user ON app_user.id = professor."userId"
    JOIN "Profile" profile ON profile."userId" = app_user.id
    WHERE professor.id = p_professor_id
      AND professor."contractId" = p_contract_id
      AND app_user."isActive" = TRUE
      AND NULLIF(BTRIM(profile.name), '') IS NOT NULL
      AND NULLIF(BTRIM(profile.cref), '') IS NOT NULL
      AND (professor."dismissalDate" IS NULL OR professor."dismissalDate" > p_at)
      AND LOWER(COALESCE(professor."currentStatus", 'active')) NOT IN (
        'inactive', 'inativo', 'dismissed', 'desligado', 'terminated', 'encerrado'
      )
  );
$$;

CREATE OR REPLACE FUNCTION "guardAdipometryClinicalResponsibility"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_HISTORY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."effectiveTo" IS NOT NULL OR NEW."endedAt" IS NOT NULL
       OR NEW."endedByUserId" IS NOT NULL OR NEW."endReason" IS NOT NULL THEN
      RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_MUST_START_ACTIVE' USING ERRCODE = '23514';
    END IF;
    IF NOT "isEligibleAdipometryClinicalDesignation"(
      NEW."contractId", NEW."professorId", NEW."effectiveFrom"
    ) THEN
      RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBLE_NOT_ELIGIBLE' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."effectiveTo" IS NOT NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_HISTORY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."contractId" IS DISTINCT FROM OLD."contractId"
     OR NEW.domain IS DISTINCT FROM OLD.domain
     OR NEW."professorId" IS DISTINCT FROM OLD."professorId"
     OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom"
     OR NEW."designatedByUserId" IS DISTINCT FROM OLD."designatedByUserId"
     OR NEW."designatedAt" IS DISTINCT FROM OLD."designatedAt"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF NEW."effectiveTo" IS NULL
     OR NEW."endedByUserId" IS NULL
     OR NEW."endedAt" IS NULL
     OR NULLIF(BTRIM(NEW."endReason"), '') IS NULL
     OR NEW."effectiveTo" IS DISTINCT FROM NEW."endedAt" THEN
    RAISE EXCEPTION 'ADIPOMETRY_RESPONSIBILITY_END_INCOMPLETE' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
