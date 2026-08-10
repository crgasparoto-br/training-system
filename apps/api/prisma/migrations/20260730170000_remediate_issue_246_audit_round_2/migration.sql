BEGIN;

-- Issue #246 audit remediation round 2.
-- Clinical equations use a restricted executable JSON expression language.
CREATE OR REPLACE FUNCTION "evaluateAdipometryExpression"(
  p_expression JSONB,
  p_context JSONB
) RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  v_op TEXT;
  v_item JSONB;
  v_value JSONB;
  v_result NUMERIC;
  v_divisor NUMERIC;
  v_path TEXT[];
BEGIN
  IF JSONB_TYPEOF(p_expression) = 'number' THEN
    RETURN (p_expression #>> '{}')::NUMERIC;
  END IF;

  IF JSONB_TYPEOF(p_expression) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_INVALID_TYPE' USING ERRCODE = '22023';
  END IF;

  v_op := p_expression ->> 'op';

  CASE v_op
    WHEN 'constant' THEN
      IF JSONB_TYPEOF(p_expression -> 'value') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_INVALID_CONSTANT' USING ERRCODE = '22023';
      END IF;
      RETURN (p_expression ->> 'value')::NUMERIC;

    WHEN 'variable' THEN
      IF COALESCE(p_expression ->> 'name', '') !~ '^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$' THEN
        RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_INVALID_VARIABLE' USING ERRCODE = '22023';
      END IF;
      v_path := STRING_TO_ARRAY(p_expression ->> 'name', '.');
      v_value := p_context #> v_path;
      IF JSONB_TYPEOF(v_value) IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_VARIABLE_NOT_NUMERIC: %', p_expression ->> 'name'
          USING ERRCODE = '22023';
      END IF;
      RETURN (v_value #>> '{}')::NUMERIC;

    WHEN 'add' THEN
      IF JSONB_TYPEOF(p_expression -> 'args') IS DISTINCT FROM 'array'
         OR JSONB_ARRAY_LENGTH(p_expression -> 'args') < 2 THEN
        RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_INVALID_ADD' USING ERRCODE = '22023';
      END IF;
      v_result := 0;
      FOR v_item IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_expression -> 'args') LOOP
        v_result := v_result + "evaluateAdipometryExpression"(v_item, p_context);
      END LOOP;
      RETURN v_result;

    WHEN 'subtract' THEN
      IF NOT (p_expression ? 'left') OR NOT (p_expression ? 'right') THEN
        RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_INVALID_SUBTRACT' USING ERRCODE = '22023';
      END IF;
      RETURN "evaluateAdipometryExpression"(p_expression -> 'left', p_context)
        - "evaluateAdipometryExpression"(p_expression -> 'right', p_context);

    WHEN 'multiply' THEN
      IF JSONB_TYPEOF(p_expression -> 'args') IS DISTINCT FROM 'array'
         OR JSONB_ARRAY_LENGTH(p_expression -> 'args') < 2 THEN
        RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_INVALID_MULTIPLY' USING ERRCODE = '22023';
      END IF;
      v_result := 1;
      FOR v_item IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_expression -> 'args') LOOP
        v_result := v_result * "evaluateAdipometryExpression"(v_item, p_context);
      END LOOP;
      RETURN v_result;

    WHEN 'divide' THEN
      IF NOT (p_expression ? 'numerator') OR NOT (p_expression ? 'denominator') THEN
        RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_INVALID_DIVIDE' USING ERRCODE = '22023';
      END IF;
      v_divisor := "evaluateAdipometryExpression"(p_expression -> 'denominator', p_context);
      IF v_divisor = 0 THEN
        RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_DIVISION_BY_ZERO' USING ERRCODE = '22012';
      END IF;
      RETURN "evaluateAdipometryExpression"(p_expression -> 'numerator', p_context) / v_divisor;

    WHEN 'power' THEN
      IF NOT (p_expression ? 'base') OR NOT (p_expression ? 'exponent') THEN
        RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_INVALID_POWER' USING ERRCODE = '22023';
      END IF;
      RETURN POWER(
        "evaluateAdipometryExpression"(p_expression -> 'base', p_context),
        "evaluateAdipometryExpression"(p_expression -> 'exponent', p_context)
      );

    WHEN 'negate' THEN
      IF NOT (p_expression ? 'value') THEN
        RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_INVALID_NEGATE' USING ERRCODE = '22023';
      END IF;
      RETURN -"evaluateAdipometryExpression"(p_expression -> 'value', p_context);

    WHEN 'ifEquals' THEN
      IF COALESCE(p_expression ->> 'field', '') !~ '^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$'
         OR NOT (p_expression ? 'expected')
         OR NOT (p_expression ? 'then')
         OR NOT (p_expression ? 'else') THEN
        RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_INVALID_CONDITIONAL' USING ERRCODE = '22023';
      END IF;
      v_path := STRING_TO_ARRAY(p_expression ->> 'field', '.');
      IF p_context #> v_path IS NULL THEN
        RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_CONDITIONAL_FIELD_MISSING' USING ERRCODE = '22023';
      END IF;
      IF (p_context #> v_path) = p_expression -> 'expected' THEN
        RETURN "evaluateAdipometryExpression"(p_expression -> 'then', p_context);
      END IF;
      RETURN "evaluateAdipometryExpression"(p_expression -> 'else', p_context);

    ELSE
      RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_UNSUPPORTED_OPERATOR: %', COALESCE(v_op, '<missing>')
        USING ERRCODE = '22023';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION "evaluateAdipometryProtocolVector"(
  p_definition JSONB,
  p_vector JSONB
) RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  v_context JSONB;
  v_equation JSONB;
  v_output TEXT;
  v_value NUMERIC;
  v_total NUMERIC;
  v_seen TEXT[] := ARRAY[]::TEXT[];
BEGIN
  v_context := COALESCE(p_vector #> '{inputs,measurements}', '{}'::JSONB)
    || JSONB_BUILD_OBJECT(
      'ageAtAssessment', p_vector #> '{inputs,ageAtAssessment}',
      'profileCriteria', COALESCE(p_vector #> '{inputs,profileCriteria}', '{}'::JSONB)
    );

  v_total :=
    (v_context ->> 'tricepsMm')::NUMERIC
    + (v_context ->> 'subscapularMm')::NUMERIC
    + (v_context ->> 'suprailiacMm')::NUMERIC
    + (v_context ->> 'abdominalMm')::NUMERIC
    + (v_context ->> 'thighMm')::NUMERIC;
  v_context := v_context || JSONB_BUILD_OBJECT('skinfoldTotalMm', v_total);

  FOR v_equation IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'equations') LOOP
    v_output := v_equation ->> 'output';
    IF v_output NOT IN ('bodyFatPercentage', 'fatMassKg', 'leanMassKg')
       OR v_output = ANY(v_seen) THEN
      RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_INVALID_EQUATION_OUTPUT' USING ERRCODE = '22023';
    END IF;

    v_value := "evaluateAdipometryExpression"(v_equation -> 'expression', v_context);
    v_context := v_context || JSONB_BUILD_OBJECT(v_output, v_value);
    v_seen := ARRAY_APPEND(v_seen, v_output);
  END LOOP;

  IF ARRAY_LENGTH(v_seen, 1) IS DISTINCT FROM 3
     OR NOT ('bodyFatPercentage' = ANY(v_seen))
     OR NOT ('fatMassKg' = ANY(v_seen))
     OR NOT ('leanMassKg' = ANY(v_seen)) THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_MISSING_EQUATION_OUTPUT' USING ERRCODE = '22023';
  END IF;

  RETURN JSONB_BUILD_OBJECT(
    'skinfoldTotalMm', v_total,
    'bodyFatPercentage', v_context -> 'bodyFatPercentage',
    'fatMassKg', v_context -> 'fatMassKg',
    'leanMassKg', v_context -> 'leanMassKg'
  );
END;
$$;

CREATE OR REPLACE FUNCTION "isValidAdipometryProtocolDefinition"(
  p_definition JSONB,
  p_approved_by_user_id TEXT,
  p_approved_at TIMESTAMP(3)
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
STRICT
AS $$
DECLARE
  v_required_skinfolds CONSTANT JSONB := '["tricepsMm","subscapularMm","suprailiacMm","abdominalMm","thighMm"]'::JSONB;
  v_field TEXT;
  v_vector JSONB;
  v_limit JSONB;
  v_actual JSONB;
  v_expected NUMERIC;
  v_tolerance NUMERIC;
  v_approved_at_text TEXT;
BEGIN
  IF JSONB_TYPEOF(p_definition) IS DISTINCT FROM 'object'
     OR JSONB_TYPEOF(p_definition -> 'schemaVersion') IS DISTINCT FROM 'number'
     OR (p_definition ->> 'schemaVersion')::INTEGER < 1 THEN
    RETURN FALSE;
  END IF;

  IF JSONB_TYPEOF(p_definition -> 'population') IS DISTINCT FROM 'object'
     OR JSONB_TYPEOF(p_definition #> '{population,ageMinYears}') IS DISTINCT FROM 'number'
     OR JSONB_TYPEOF(p_definition #> '{population,ageMaxYears}') IS DISTINCT FROM 'number'
     OR (p_definition #>> '{population,ageMinYears}')::NUMERIC < 0
     OR (p_definition #>> '{population,ageMaxYears}')::NUMERIC <= (p_definition #>> '{population,ageMinYears}')::NUMERIC
     OR JSONB_TYPEOF(p_definition #> '{population,sexCriteria}') IS DISTINCT FROM 'array'
     OR JSONB_ARRAY_LENGTH(p_definition #> '{population,sexCriteria}') = 0
     OR EXISTS (
       SELECT 1 FROM JSONB_ARRAY_ELEMENTS(p_definition #> '{population,sexCriteria}') item
       WHERE JSONB_TYPEOF(item) IS DISTINCT FROM 'string' OR NULLIF(BTRIM(item #>> '{}'), '') IS NULL
     )
     OR JSONB_TYPEOF(p_definition #> '{population,maturationCriteria}') IS DISTINCT FROM 'string'
     OR NULLIF(BTRIM(p_definition #>> '{population,maturationCriteria}'), '') IS NULL THEN
    RETURN FALSE;
  END IF;

  IF JSONB_TYPEOF(p_definition -> 'requiredSkinfolds') IS DISTINCT FROM 'array'
     OR JSONB_ARRAY_LENGTH(p_definition -> 'requiredSkinfolds') <> 5
     OR NOT ((p_definition -> 'requiredSkinfolds') @> v_required_skinfolds)
     OR NOT (v_required_skinfolds @> (p_definition -> 'requiredSkinfolds')) THEN
    RETURN FALSE;
  END IF;

  IF p_definition #>> '{inputUnits,weightKg}' IS DISTINCT FROM 'kg'
     OR p_definition #>> '{inputUnits,tricepsMm}' IS DISTINCT FROM 'mm'
     OR p_definition #>> '{inputUnits,subscapularMm}' IS DISTINCT FROM 'mm'
     OR p_definition #>> '{inputUnits,suprailiacMm}' IS DISTINCT FROM 'mm'
     OR p_definition #>> '{inputUnits,abdominalMm}' IS DISTINCT FROM 'mm'
     OR p_definition #>> '{inputUnits,thighMm}' IS DISTINCT FROM 'mm'
     OR p_definition #>> '{outputUnits,skinfoldTotalMm}' IS DISTINCT FROM 'mm'
     OR p_definition #>> '{outputUnits,bodyFatPercentage}' IS DISTINCT FROM 'percent'
     OR p_definition #>> '{outputUnits,fatMassKg}' IS DISTINCT FROM 'kg'
     OR p_definition #>> '{outputUnits,leanMassKg}' IS DISTINCT FROM 'kg' THEN
    RETURN FALSE;
  END IF;

  IF JSONB_TYPEOF(p_definition -> 'equations') IS DISTINCT FROM 'array'
     OR JSONB_ARRAY_LENGTH(p_definition -> 'equations') <> 3
     OR EXISTS (
       SELECT 1 FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'equations') equation
       WHERE NULLIF(BTRIM(equation ->> 'id'), '') IS NULL
         OR equation ->> 'output' NOT IN ('bodyFatPercentage', 'fatMassKg', 'leanMassKg')
         OR JSONB_TYPEOF(equation -> 'expression') IS DISTINCT FROM 'object'
     )
     OR (
       SELECT COUNT(DISTINCT equation ->> 'output')
       FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'equations') equation
     ) <> 3
     OR (
       SELECT COUNT(DISTINCT equation ->> 'id')
       FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'equations') equation
     ) <> 3 THEN
    RETURN FALSE;
  END IF;

  IF JSONB_TYPEOF(p_definition #> '{limits,blocking}') IS DISTINCT FROM 'object'
     OR JSONB_TYPEOF(p_definition #> '{limits,warnings}') IS DISTINCT FROM 'array' THEN
    RETURN FALSE;
  END IF;

  FOREACH v_field IN ARRAY ARRAY['weightKg','tricepsMm','subscapularMm','suprailiacMm','abdominalMm','thighMm'] LOOP
    v_limit := p_definition #> ARRAY['limits','blocking',v_field];
    IF JSONB_TYPEOF(v_limit) IS DISTINCT FROM 'object'
       OR JSONB_TYPEOF(v_limit -> 'min') IS DISTINCT FROM 'number'
       OR JSONB_TYPEOF(v_limit -> 'max') IS DISTINCT FROM 'number'
       OR (v_limit ->> 'max')::NUMERIC <= (v_limit ->> 'min')::NUMERIC THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  IF JSONB_TYPEOF(p_definition -> 'precision') IS DISTINCT FROM 'object'
     OR JSONB_TYPEOF(p_definition #> '{precision,measurementScale}') IS DISTINCT FROM 'number'
     OR JSONB_TYPEOF(p_definition #> '{precision,resultScale}') IS DISTINCT FROM 'number'
     OR JSONB_TYPEOF(p_definition #> '{precision,internalScale}') IS DISTINCT FROM 'number'
     OR (p_definition #>> '{precision,measurementScale}')::INTEGER NOT BETWEEN 0 AND 2
     OR (p_definition #>> '{precision,resultScale}')::INTEGER NOT BETWEEN 0 AND 4
     OR (p_definition #>> '{precision,internalScale}')::INTEGER NOT BETWEEN 1 AND 8
     OR (p_definition #>> '{precision,internalScale}')::INTEGER < (p_definition #>> '{precision,resultScale}')::INTEGER THEN
    RETURN FALSE;
  END IF;

  IF p_definition #>> '{rounding,mode}' NOT IN ('HALF_UP','HALF_EVEN')
     OR p_definition #>> '{rounding,stage}' IS DISTINCT FROM 'FINAL_RESULTS_ONLY'
     OR JSONB_TYPEOF(p_definition -> 'missingDataBehavior') IS DISTINCT FROM 'object'
     OR NULLIF(BTRIM(p_definition #>> '{missingDataBehavior,missingRequired}'), '') IS NULL
     OR NULLIF(BTRIM(p_definition #>> '{missingDataBehavior,incompatibleProfile}'), '') IS NULL THEN
    RETURN FALSE;
  END IF;

  IF JSONB_TYPEOF(p_definition -> 'testVectors') IS DISTINCT FROM 'array'
     OR JSONB_ARRAY_LENGTH(p_definition -> 'testVectors') < 2
     OR (
       SELECT COUNT(DISTINCT vector ->> 'id')
       FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'testVectors') vector
     ) <> JSONB_ARRAY_LENGTH(p_definition -> 'testVectors')
     OR (
       SELECT COUNT(DISTINCT vector -> 'inputs')
       FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'testVectors') vector
     ) <> JSONB_ARRAY_LENGTH(p_definition -> 'testVectors') THEN
    RETURN FALSE;
  END IF;

  FOR v_vector IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'testVectors') LOOP
    IF NULLIF(BTRIM(v_vector ->> 'id'), '') IS NULL
       OR JSONB_TYPEOF(v_vector #> '{inputs,ageAtAssessment}') IS DISTINCT FROM 'number'
       OR JSONB_TYPEOF(v_vector #> '{inputs,profileCriteria}') IS DISTINCT FROM 'object'
       OR JSONB_TYPEOF(v_vector #> '{inputs,measurements}') IS DISTINCT FROM 'object' THEN
      RETURN FALSE;
    END IF;

    FOREACH v_field IN ARRAY ARRAY['weightKg','tricepsMm','subscapularMm','suprailiacMm','abdominalMm','thighMm'] LOOP
      IF JSONB_TYPEOF(v_vector #> ARRAY['inputs','measurements',v_field]) IS DISTINCT FROM 'number' THEN
        RETURN FALSE;
      END IF;
    END LOOP;

    v_actual := "evaluateAdipometryProtocolVector"(p_definition, v_vector);
    FOREACH v_field IN ARRAY ARRAY['skinfoldTotalMm','bodyFatPercentage','fatMassKg','leanMassKg'] LOOP
      IF JSONB_TYPEOF(v_actual -> v_field) IS DISTINCT FROM 'number'
         OR JSONB_TYPEOF(v_vector #> ARRAY['expectedResults',v_field]) IS DISTINCT FROM 'number'
         OR JSONB_TYPEOF(v_vector #> ARRAY['tolerance',v_field]) IS DISTINCT FROM 'number' THEN
        RETURN FALSE;
      END IF;
      v_expected := (v_vector #>> ARRAY['expectedResults',v_field])::NUMERIC;
      v_tolerance := (v_vector #>> ARRAY['tolerance',v_field])::NUMERIC;
      IF v_tolerance < 0
         OR ABS((v_actual ->> v_field)::NUMERIC - v_expected) > v_tolerance THEN
        RETURN FALSE;
      END IF;
    END LOOP;
  END LOOP;

  v_approved_at_text := p_definition #>> '{clinicalApproval,approvedAt}';
  IF p_definition #>> '{clinicalApproval,status}' IS DISTINCT FROM 'approved'
     OR p_definition #>> '{clinicalApproval,approverUserId}' IS DISTINCT FROM p_approved_by_user_id
     OR NULLIF(BTRIM(p_definition #>> '{clinicalApproval,approvalRecordId}'), '') IS NULL
     OR COALESCE(p_definition #>> '{clinicalApproval,artifactSha256}', '') !~ '^[0-9a-f]{64}$'
     OR JSONB_TYPEOF(p_definition #> '{clinicalApproval,approvedAt}') IS DISTINCT FROM 'string'
     OR COALESCE(v_approved_at_text, '') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
     OR ((v_approved_at_text::TIMESTAMPTZ AT TIME ZONE 'UTC')::TIMESTAMP(3)) IS DISTINCT FROM p_approved_at THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

-- The actor is transaction-local and must be an active collaborator of the tenant.
CREATE OR REPLACE FUNCTION "requireAdipometryActorUserId"(
  p_contract_id TEXT,
  p_fallback_professor_id TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_actor_user_id TEXT := NULLIF(CURRENT_SETTING('app.adipometry_actor_user_id', TRUE), '');
BEGIN
  -- Database owners can execute migration and verification SQL. Application
  -- roles must always provide the authenticated actor through transaction-local
  -- context or the explicit actor overload of createAdipometryDraft.
  IF v_actor_user_id IS NULL AND CURRENT_USER = 'postgres' AND p_fallback_professor_id IS NOT NULL THEN
    SELECT professor."userId" INTO v_actor_user_id
    FROM "Professor" professor
    WHERE professor."id" = p_fallback_professor_id
      AND professor."contractId" = p_contract_id;
  END IF;

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_ACTOR_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "Professor" professor
    JOIN "User" actor ON actor."id" = professor."userId"
    WHERE professor."userId" = v_actor_user_id
      AND professor."contractId" = p_contract_id
      AND actor."isActive" = TRUE
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_ACTOR_CROSS_TENANT_OR_INACTIVE' USING ERRCODE = '42501';
  END IF;

  RETURN v_actor_user_id;
END;
$$;

-- Legacy six-argument overloads remain only for migration owners and old
-- verification fixtures. Application roles cannot invoke them.
REVOKE EXECUTE ON FUNCTION "createAdipometryDraft"(TEXT,TEXT,TEXT,TEXT,TIMESTAMP WITHOUT TIME ZONE,TIMESTAMP WITHOUT TIME ZONE) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "createAdipometryDraft"(TEXT,TEXT,TEXT,TEXT,DATE,TIMESTAMP WITH TIME ZONE) FROM PUBLIC;

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

  INSERT INTO "AdipometrySequence" ("contractId", "alunoId", "lastValue", "updatedAt")
  VALUES (p_contract_id, p_aluno_id, 1, p_created_at)
  ON CONFLICT ("contractId", "alunoId")
  DO UPDATE SET
    "lastValue" = "AdipometrySequence"."lastValue" + 1,
    "updatedAt" = EXCLUDED."updatedAt"
  RETURNING "lastValue" INTO v_sequence;

  v_code := "formatAdipometryCode"(v_sequence);

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

CREATE OR REPLACE FUNCTION "validateAdipometryAssessmentState"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_original "AdipometryAssessment"%ROWTYPE;
  v_actor_user_id TEXT;
BEGIN
  v_actor_user_id := "requireAdipometryActorUserId"(NEW."contractId", NEW."professorId");

  IF NEW."status" = 'COMPLETED' AND NOT EXISTS (
    SELECT 1 FROM "AdipometryProtocol" protocol
    WHERE protocol."id" = NEW."protocolId"
      AND protocol."code" = NEW."protocolCode"
      AND protocol."version" = NEW."protocolVersion"
      AND protocol."status" = 'APPROVED'
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_NOT_APPROVED' USING ERRCODE = '23514';
  END IF;

  IF NEW."correctsAssessmentId" = NEW."id"
     OR NEW."correctedByAssessmentId" = NEW."id" THEN
    RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_SELF_REFERENCE' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' AND NEW."correctedByAssessmentId" IS NOT NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_LINK_IS_MANAGED' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW."correctedByAssessmentId" IS DISTINCT FROM OLD."correctedByAssessmentId" THEN
    IF OLD."status" <> 'COMPLETED'
       OR OLD."correctedByAssessmentId" IS NOT NULL
       OR NEW."correctedByAssessmentId" IS NULL THEN
      RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_LINK_IS_MANAGED' USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM "AdipometryAssessment" correction
      WHERE correction."id" = NEW."correctedByAssessmentId"
        AND correction."correctsAssessmentId" = OLD."id"
        AND correction."contractId" = OLD."contractId"
        AND correction."alunoId" = OLD."alunoId"
        AND correction."status" = 'COMPLETED'
    ) THEN
      RAISE EXCEPTION 'ADIPOMETRY_INVALID_CORRECTION_LINK' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."correctsAssessmentId" IS NOT NULL THEN
    IF NEW."correctionAuthorUserId" IS DISTINCT FROM v_actor_user_id THEN
      RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_ACTOR_MISMATCH' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_original
    FROM "AdipometryAssessment"
    WHERE "id" = NEW."correctsAssessmentId"
    FOR UPDATE;

    IF NOT FOUND
       OR v_original."contractId" <> NEW."contractId"
       OR v_original."alunoId" <> NEW."alunoId"
       OR v_original."status" <> 'COMPLETED'
       OR v_original."correctedByAssessmentId" IS NOT NULL THEN
      RAISE EXCEPTION 'ADIPOMETRY_INVALID_CORRECTION_TARGET' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "recordAdipometryAuditEvent"()
RETURNS trigger
LANGUAGE plpgsql
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

COMMIT;
