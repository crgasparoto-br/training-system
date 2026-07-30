BEGIN;

-- Issue #246 final persistence hardening.
-- Every assessment insert receives its identity from the transactional counter,
-- completed results are recalculated from the approved protocol definition, and
-- audit rows can only be emitted by the privileged assessment trigger.

CREATE OR REPLACE FUNCTION "roundAdipometryValue"(
  p_value NUMERIC,
  p_scale INTEGER,
  p_mode TEXT
) RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  v_factor NUMERIC;
  v_absolute NUMERIC;
  v_lower NUMERIC;
  v_fraction NUMERIC;
  v_rounded NUMERIC;
BEGIN
  IF p_scale < 0 OR p_scale > 8 THEN
    RAISE EXCEPTION 'ADIPOMETRY_ROUNDING_SCALE_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_mode = 'HALF_UP' THEN
    RETURN ROUND(p_value, p_scale);
  END IF;

  IF p_mode <> 'HALF_EVEN' THEN
    RAISE EXCEPTION 'ADIPOMETRY_ROUNDING_MODE_INVALID' USING ERRCODE = '22023';
  END IF;

  v_factor := POWER(10::NUMERIC, p_scale);
  v_absolute := ABS(p_value) * v_factor;
  v_lower := FLOOR(v_absolute);
  v_fraction := v_absolute - v_lower;

  IF v_fraction < 0.5 THEN
    v_rounded := v_lower;
  ELSIF v_fraction > 0.5 THEN
    v_rounded := v_lower + 1;
  ELSIF MOD(v_lower, 2) = 0 THEN
    v_rounded := v_lower;
  ELSE
    v_rounded := v_lower + 1;
  END IF;

  RETURN SIGN(p_value) * v_rounded / v_factor;
END;
$$;

CREATE OR REPLACE FUNCTION "allocateAdipometryAssessmentIdentity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_sequence INTEGER;
BEGIN
  INSERT INTO "AdipometrySequence" ("contractId", "alunoId", "lastValue", "updatedAt")
  VALUES (NEW."contractId", NEW."alunoId", 1, COALESCE(NEW."createdAt", CURRENT_TIMESTAMP))
  ON CONFLICT ("contractId", "alunoId")
  DO UPDATE SET
    "lastValue" = "AdipometrySequence"."lastValue" + 1,
    "updatedAt" = EXCLUDED."updatedAt"
  RETURNING "lastValue" INTO v_sequence;

  NEW."sequenceNumber" := v_sequence;
  NEW."code" := "formatAdipometryCode"(v_sequence);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "AdipometryAssessment_00_allocate_identity" ON "AdipometryAssessment";
CREATE TRIGGER "AdipometryAssessment_00_allocate_identity"
BEFORE INSERT ON "AdipometryAssessment"
FOR EACH ROW
EXECUTE FUNCTION "allocateAdipometryAssessmentIdentity"();

CREATE OR REPLACE FUNCTION "canonicalizeAdipometryCompletion"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_definition JSONB;
  v_profile JSONB;
  v_vector JSONB;
  v_actual JSONB;
  v_limit JSONB;
  v_age NUMERIC;
  v_sex TEXT;
  v_maturation_rule TEXT;
  v_measurement NUMERIC;
  v_field TEXT;
  v_result_scale INTEGER;
  v_rounding_mode TEXT;
  v_total NUMERIC;
  v_body_fat NUMERIC;
  v_fat_mass NUMERIC;
  v_lean_mass NUMERIC;
BEGIN
  IF NEW."status" <> 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  -- Reciprocal correction linking is the only normal update to an already
  -- completed row. Its clinical snapshot must remain byte-for-byte historical.
  IF TG_OP = 'UPDATE' AND OLD."status" = 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  SELECT protocol."definitionSnapshot"
    INTO v_definition
  FROM "AdipometryProtocol" protocol
  WHERE protocol."id" = NEW."protocolId"
    AND protocol."code" = NEW."protocolCode"
    AND protocol."version" = NEW."protocolVersion"
    AND protocol."status" = 'APPROVED';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_NOT_APPROVED' USING ERRCODE = '23514';
  END IF;

  IF JSONB_TYPEOF(NEW."calculationSnapshot") IS DISTINCT FROM 'object'
     OR JSONB_TYPEOF(NEW."calculationSnapshot" -> 'ageAtAssessment') IS DISTINCT FROM 'number'
     OR JSONB_TYPEOF(NEW."calculationSnapshot" -> 'profileCriteria') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROFILE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  v_age := (NEW."calculationSnapshot" ->> 'ageAtAssessment')::NUMERIC;
  v_profile := NEW."calculationSnapshot" -> 'profileCriteria';
  v_sex := NULLIF(BTRIM(v_profile ->> 'sex'), '');

  IF v_age <> TRUNC(v_age)
     OR v_age < (v_definition #>> '{population,ageMinYears}')::NUMERIC
     OR v_age > (v_definition #>> '{population,ageMaxYears}')::NUMERIC THEN
    RAISE EXCEPTION 'ADIPOMETRY_AGE_NOT_APPLICABLE' USING ERRCODE = '23514';
  END IF;

  IF v_sex IS NULL
     OR NOT ((v_definition #> '{population,sexCriteria}') ? v_sex) THEN
    RAISE EXCEPTION 'ADIPOMETRY_SEX_NOT_APPLICABLE' USING ERRCODE = '23514';
  END IF;

  v_maturation_rule := COALESCE(v_definition #>> '{population,maturationCriteria}', '');
  IF v_maturation_rule !~* '^\s*(not required|not applicable|n/a|nao exigid|nao aplic)'
     AND NULLIF(BTRIM(v_profile ->> 'maturation'), '') IS NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_MATURATION_REQUIRED' USING ERRCODE = '23514';
  END IF;

  FOREACH v_field IN ARRAY ARRAY[
    'weightKg', 'tricepsMm', 'subscapularMm', 'suprailiacMm', 'abdominalMm', 'thighMm'
  ] LOOP
    v_measurement := CASE v_field
      WHEN 'weightKg' THEN NEW."weightKg"
      WHEN 'tricepsMm' THEN NEW."tricepsMm"
      WHEN 'subscapularMm' THEN NEW."subscapularMm"
      WHEN 'suprailiacMm' THEN NEW."suprailiacMm"
      WHEN 'abdominalMm' THEN NEW."abdominalMm"
      WHEN 'thighMm' THEN NEW."thighMm"
    END;
    v_limit := v_definition #> ARRAY['limits', 'blocking', v_field];

    IF v_measurement IS NULL THEN
      RAISE EXCEPTION 'ADIPOMETRY_MEASUREMENT_REQUIRED: %', v_field USING ERRCODE = '23514';
    END IF;

    IF JSONB_TYPEOF(v_limit) IS DISTINCT FROM 'object'
       OR v_measurement < (v_limit ->> 'min')::NUMERIC
       OR v_measurement > (v_limit ->> 'max')::NUMERIC THEN
      RAISE EXCEPTION 'ADIPOMETRY_MEASUREMENT_OUT_OF_RANGE: %', v_field USING ERRCODE = '23514';
    END IF;
  END LOOP;

  v_vector := JSONB_BUILD_OBJECT(
    'inputs', JSONB_BUILD_OBJECT(
      'ageAtAssessment', v_age,
      'profileCriteria', v_profile,
      'measurements', JSONB_BUILD_OBJECT(
        'weightKg', NEW."weightKg",
        'tricepsMm', NEW."tricepsMm",
        'subscapularMm', NEW."subscapularMm",
        'suprailiacMm', NEW."suprailiacMm",
        'abdominalMm', NEW."abdominalMm",
        'thighMm', NEW."thighMm"
      )
    )
  );

  v_actual := "evaluateAdipometryProtocolVector"(v_definition, v_vector);
  v_result_scale := (v_definition #>> '{precision,resultScale}')::INTEGER;
  v_rounding_mode := v_definition #>> '{rounding,mode}';

  v_total := "roundAdipometryValue"((v_actual ->> 'skinfoldTotalMm')::NUMERIC, v_result_scale, v_rounding_mode);
  v_body_fat := "roundAdipometryValue"((v_actual ->> 'bodyFatPercentage')::NUMERIC, v_result_scale, v_rounding_mode);
  v_fat_mass := "roundAdipometryValue"((v_actual ->> 'fatMassKg')::NUMERIC, v_result_scale, v_rounding_mode);
  v_lean_mass := "roundAdipometryValue"((v_actual ->> 'leanMassKg')::NUMERIC, v_result_scale, v_rounding_mode);

  IF v_body_fat NOT BETWEEN 0 AND 100
     OR v_fat_mass < 0
     OR v_lean_mass < 0
     OR ABS((v_fat_mass + v_lean_mass) - NEW."weightKg") > 0.02 THEN
    RAISE EXCEPTION 'ADIPOMETRY_CALCULATED_RESULT_INVALID' USING ERRCODE = '23514';
  END IF;

  -- Derived values and their reproducible rules are database-authoritative.
  -- Any values supplied by a caller are replaced before constraints and audit.
  NEW."skinfoldTotalMm" := v_total;
  NEW."bodyFatPercentage" := v_body_fat;
  NEW."fatMassKg" := v_fat_mass;
  NEW."leanMassKg" := v_lean_mass;
  NEW."completedAt" := CURRENT_TIMESTAMP;
  NEW."calculationSnapshot" := JSONB_BUILD_OBJECT(
    'protocol', JSONB_BUILD_OBJECT('code', NEW."protocolCode", 'version', NEW."protocolVersion"),
    'assessmentDate', TO_CHAR(NEW."assessmentDate", 'YYYY-MM-DD'),
    'ageAtAssessment', v_age,
    'profileCriteria', v_profile,
    'inputs', JSONB_BUILD_OBJECT(
      'weightKg', NEW."weightKg",
      'tricepsMm', NEW."tricepsMm",
      'subscapularMm', NEW."subscapularMm",
      'suprailiacMm', NEW."suprailiacMm",
      'abdominalMm', NEW."abdominalMm",
      'thighMm', NEW."thighMm"
    ),
    'rules', JSONB_BUILD_OBJECT(
      'equations', v_definition -> 'equations',
      'limits', v_definition -> 'limits',
      'precision', v_definition -> 'precision',
      'rounding', v_definition -> 'rounding'
    ),
    'results', JSONB_BUILD_OBJECT(
      'skinfoldTotalMm', v_total,
      'bodyFatPercentage', v_body_fat,
      'fatMassKg', v_fat_mass,
      'leanMassKg', v_lean_mass
    ),
    'implementationVersion', 'db-adipometry-protocol-v2',
    'calculatedAt', TO_CHAR(CLOCK_TIMESTAMP() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "AdipometryAssessment_01_canonicalize_completion" ON "AdipometryAssessment";
CREATE TRIGGER "AdipometryAssessment_01_canonicalize_completion"
BEFORE INSERT OR UPDATE ON "AdipometryAssessment"
FOR EACH ROW
EXECUTE FUNCTION "canonicalizeAdipometryCompletion"();

-- Draft creation delegates identity allocation to the universal insert trigger,
-- so direct inserts and function calls cannot diverge.
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
  INSERT INTO "AdipometryAssessment" (
    "id", "contractId", "alunoId", "professorId", "sequenceNumber", "code",
    "assessmentDate", "status", "createdAt", "updatedAt"
  ) VALUES (
    p_id, p_contract_id, p_aluno_id, p_professor_id, 1, 'ADPT-001',
    p_assessment_date, 'DRAFT', p_created_at, p_created_at
  ) RETURNING "sequenceNumber", "code" INTO v_sequence, v_code;

  RETURN QUERY SELECT p_id, v_sequence, v_code;
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
LANGUAGE sql
AS $$
  SELECT * FROM "createAdipometryDraft"(
    p_id,
    p_contract_id,
    p_aluno_id,
    p_professor_id,
    p_assessment_date::TIMESTAMP(3),
    p_created_at::TIMESTAMP(3)
  );
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

  INSERT INTO "AdipometryAssessment" (
    "id", "contractId", "alunoId", "professorId", "sequenceNumber", "code",
    "assessmentDate", "status", "createdAt", "updatedAt"
  ) VALUES (
    p_id, p_contract_id, p_aluno_id, p_professor_id, 1, 'ADPT-001',
    p_assessment_date, 'DRAFT', p_created_at, p_created_at
  ) RETURNING "sequenceNumber", "code" INTO v_sequence, v_code;

  RETURN QUERY SELECT p_id, v_sequence, v_code;
END;
$$;

CREATE OR REPLACE FUNCTION "createAdipometryDraft"(
  p_id TEXT,
  p_contract_id TEXT,
  p_aluno_id TEXT,
  p_professor_id TEXT,
  p_assessment_date DATE,
  p_actor_user_id TEXT,
  p_created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
) RETURNS TABLE("assessmentId" TEXT, "sequenceNumber" INTEGER, "code" TEXT)
LANGUAGE sql
AS $$
  SELECT * FROM "createAdipometryDraft"(
    p_id,
    p_contract_id,
    p_aluno_id,
    p_professor_id,
    p_assessment_date::TIMESTAMP(3),
    p_actor_user_id,
    p_created_at::TIMESTAMP(3)
  );
$$;

CREATE OR REPLACE FUNCTION "validateAdipometryAuditEvent"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_table_owner TEXT;
BEGIN
  SELECT PG_GET_USERBYID(class.relowner)
    INTO v_table_owner
  FROM pg_class class
  WHERE class.oid = 'public."AdipometryAuditEvent"'::REGCLASS;

  IF CURRENT_USER IS DISTINCT FROM v_table_owner THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_INSERT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "Professor" professor
    JOIN "User" actor ON actor."id" = professor."userId"
    WHERE professor."userId" = NEW."actorUserId"
      AND professor."contractId" = NEW."contractId"
      AND actor."isActive" = TRUE
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_ACTOR_CROSS_TENANT_OR_INACTIVE'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."action" = 'DRAFT_CREATED' AND NOT (
       NEW."beforeSnapshot" IS NULL
       AND NEW."afterSnapshot" ->> 'status' = 'DRAFT'
     ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_EVENT_INVALID' USING ERRCODE = '23514';
  ELSIF NEW."action" = 'DRAFT_UPDATED' AND NOT (
       NEW."beforeSnapshot" ->> 'status' = 'DRAFT'
       AND NEW."afterSnapshot" ->> 'status' = 'DRAFT'
     ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_EVENT_INVALID' USING ERRCODE = '23514';
  ELSIF NEW."action" = 'COMPLETED' AND NOT (
       NEW."afterSnapshot" ->> 'status' = 'COMPLETED'
       AND (NEW."beforeSnapshot" IS NULL OR NEW."beforeSnapshot" ->> 'status' = 'DRAFT')
     ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_EVENT_INVALID' USING ERRCODE = '23514';
  ELSIF NEW."action" = 'CORRECTION_CREATED' AND NOT (
       NEW."afterSnapshot" ->> 'status' = 'COMPLETED'
       AND NULLIF(BTRIM(NEW."afterSnapshot" ->> 'correctsAssessmentId'), '') IS NOT NULL
       AND NULLIF(BTRIM(NEW."reason"), '') IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_EVENT_INVALID' USING ERRCODE = '23514';
  ELSIF NEW."action" = 'CORRECTION_LINKED' AND NOT (
       NEW."beforeSnapshot" ->> 'status' = 'COMPLETED'
       AND NEW."afterSnapshot" ->> 'status' = 'COMPLETED'
       AND NEW."beforeSnapshot" -> 'correctedByAssessmentId' = 'null'::JSONB
       AND JSONB_TYPEOF(NEW."afterSnapshot" -> 'correctedByAssessmentId') = 'string'
       AND NULLIF(BTRIM(NEW."reason"), '') IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_AUDIT_EVENT_INVALID' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "recordAdipometryAuditEvent"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_user_id TEXT;
  v_action TEXT;
  v_reason TEXT;
BEGIN
  v_actor_user_id := "requireAdipometryActorUserId"(NEW."contractId", NEW."professorId");

  IF TG_OP = 'INSERT' THEN
    IF NEW."correctsAssessmentId" IS NOT NULL THEN
      v_action := 'CORRECTION_CREATED';
      v_reason := NEW."correctionReason";
    ELSIF NEW."status" = 'COMPLETED' THEN
      v_action := 'COMPLETED';
    ELSE
      v_action := 'DRAFT_CREATED';
    END IF;
  ELSIF OLD."correctsAssessmentId" IS NULL AND NEW."correctsAssessmentId" IS NOT NULL THEN
    v_action := 'CORRECTION_CREATED';
    v_reason := NEW."correctionReason";
  ELSIF OLD."status" = 'DRAFT' AND NEW."status" = 'COMPLETED' THEN
    v_action := 'COMPLETED';
  ELSIF OLD."status" = 'DRAFT' AND NEW."status" = 'DRAFT' THEN
    v_action := 'DRAFT_UPDATED';
  ELSIF OLD."status" = 'COMPLETED'
        AND OLD."correctedByAssessmentId" IS NULL
        AND NEW."correctedByAssessmentId" IS NOT NULL THEN
    v_action := 'CORRECTION_LINKED';
    SELECT correction."correctionReason" INTO v_reason
    FROM "AdipometryAssessment" correction
    WHERE correction."id" = NEW."correctedByAssessmentId";
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO "AdipometryAuditEvent" (
    "id", "contractId", "assessmentId", "actorUserId", "action", "reason",
    "beforeSnapshot", "afterSnapshot", "createdAt"
  ) VALUES (
    MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT || NEW."id" || v_action),
    NEW."contractId",
    NEW."id",
    v_actor_user_id,
    v_action,
    v_reason,
    CASE WHEN TG_OP = 'UPDATE' THEN TO_JSONB(OLD) ELSE NULL END,
    TO_JSONB(NEW),
    CURRENT_TIMESTAMP
  );

  RETURN NEW;
END;
$$;

REVOKE INSERT ON TABLE "AdipometryAuditEvent" FROM PUBLIC;

COMMIT;
