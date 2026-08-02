BEGIN;

-- Issue #246 adversarial closure.
-- Validate every expression branch structurally, even when a test vector does
-- not select that branch, and require vectors to exercise valid populations,
-- limits and discriminating tolerances.
CREATE OR REPLACE FUNCTION "isValidAdipometryExpression"(
  p_expression JSONB,
  p_allowed_variables TEXT[]
) RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  v_op TEXT;
  v_item JSONB;
  v_field TEXT;
BEGIN
  IF JSONB_TYPEOF(p_expression) IS DISTINCT FROM 'object' THEN
    RETURN FALSE;
  END IF;

  v_op := p_expression ->> 'op';

  CASE v_op
    WHEN 'constant' THEN
      RETURN JSONB_TYPEOF(p_expression -> 'value') IS NOT DISTINCT FROM 'number'
        AND (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(p_expression)) = 2;

    WHEN 'variable' THEN
      RETURN JSONB_TYPEOF(p_expression -> 'name') IS NOT DISTINCT FROM 'string'
        AND (p_expression ->> 'name') = ANY(p_allowed_variables)
        AND (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(p_expression)) = 2;

    WHEN 'add', 'multiply' THEN
      IF JSONB_TYPEOF(p_expression -> 'args') IS DISTINCT FROM 'array'
         OR JSONB_ARRAY_LENGTH(p_expression -> 'args') < 2
         OR (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(p_expression)) <> 2 THEN
        RETURN FALSE;
      END IF;

      FOR v_item IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_expression -> 'args') LOOP
        IF NOT COALESCE("isValidAdipometryExpression"(v_item, p_allowed_variables), FALSE) THEN
          RETURN FALSE;
        END IF;
      END LOOP;
      RETURN TRUE;

    WHEN 'subtract' THEN
      RETURN (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(p_expression)) = 3
        AND COALESCE("isValidAdipometryExpression"(p_expression -> 'left', p_allowed_variables), FALSE)
        AND COALESCE("isValidAdipometryExpression"(p_expression -> 'right', p_allowed_variables), FALSE);

    WHEN 'divide' THEN
      RETURN (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(p_expression)) = 3
        AND COALESCE("isValidAdipometryExpression"(p_expression -> 'numerator', p_allowed_variables), FALSE)
        AND COALESCE("isValidAdipometryExpression"(p_expression -> 'denominator', p_allowed_variables), FALSE);

    WHEN 'power' THEN
      RETURN (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(p_expression)) = 3
        AND COALESCE("isValidAdipometryExpression"(p_expression -> 'base', p_allowed_variables), FALSE)
        AND COALESCE("isValidAdipometryExpression"(p_expression -> 'exponent', p_allowed_variables), FALSE);

    WHEN 'negate' THEN
      RETURN (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(p_expression)) = 2
        AND COALESCE("isValidAdipometryExpression"(p_expression -> 'value', p_allowed_variables), FALSE);

    WHEN 'ifEquals' THEN
      v_field := p_expression ->> 'field';
      RETURN (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(p_expression)) = 5
        AND COALESCE(v_field ~ '^profileCriteria\.[A-Za-z][A-Za-z0-9]*$', FALSE)
        AND COALESCE(JSONB_TYPEOF(p_expression -> 'expected') IN ('string', 'number', 'boolean', 'null'), FALSE)
        AND COALESCE("isValidAdipometryExpression"(p_expression -> 'then', p_allowed_variables), FALSE)
        AND COALESCE("isValidAdipometryExpression"(p_expression -> 'else', p_allowed_variables), FALSE);

    ELSE
      RETURN FALSE;
  END CASE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
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
  v_expected_outputs CONSTANT TEXT[] := ARRAY['bodyFatPercentage', 'fatMassKg', 'leanMassKg'];
  v_available_variables TEXT[] := ARRAY[
    'weightKg', 'tricepsMm', 'subscapularMm', 'suprailiacMm',
    'abdominalMm', 'thighMm', 'skinfoldTotalMm', 'ageAtAssessment'
  ];
  v_field TEXT;
  v_vector JSONB;
  v_equation JSONB;
  v_warning JSONB;
  v_limit JSONB;
  v_actual JSONB;
  v_expected NUMERIC;
  v_tolerance NUMERIC;
  v_max_tolerance NUMERIC;
  v_age NUMERIC;
  v_measurement NUMERIC;
  v_equation_index INTEGER := 0;
  v_approved_at_text TEXT;
BEGIN
  IF JSONB_TYPEOF(p_definition) IS DISTINCT FROM 'object'
     OR JSONB_TYPEOF(p_definition -> 'schemaVersion') IS DISTINCT FROM 'number'
     OR (p_definition ->> 'schemaVersion')::INTEGER < 2 THEN
    RETURN FALSE;
  END IF;

  IF JSONB_TYPEOF(p_definition -> 'population') IS DISTINCT FROM 'object'
     OR JSONB_TYPEOF(p_definition #> '{population,ageMinYears}') IS DISTINCT FROM 'number'
     OR JSONB_TYPEOF(p_definition #> '{population,ageMaxYears}') IS DISTINCT FROM 'number'
     OR (p_definition #>> '{population,ageMinYears}')::NUMERIC < 0
     OR (p_definition #>> '{population,ageMaxYears}')::NUMERIC <=
        (p_definition #>> '{population,ageMinYears}')::NUMERIC
     OR JSONB_TYPEOF(p_definition #> '{population,sexCriteria}') IS DISTINCT FROM 'array'
     OR JSONB_ARRAY_LENGTH(p_definition #> '{population,sexCriteria}') = 0
     OR (
       SELECT COUNT(DISTINCT item #>> '{}')
       FROM JSONB_ARRAY_ELEMENTS(p_definition #> '{population,sexCriteria}') item
       WHERE JSONB_TYPEOF(item) = 'string' AND NULLIF(BTRIM(item #>> '{}'), '') IS NOT NULL
     ) <> JSONB_ARRAY_LENGTH(p_definition #> '{population,sexCriteria}')
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
     OR JSONB_ARRAY_LENGTH(p_definition -> 'equations') <> 3 THEN
    RETURN FALSE;
  END IF;

  FOR v_equation IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'equations') LOOP
    v_equation_index := v_equation_index + 1;
    IF NULLIF(BTRIM(v_equation ->> 'id'), '') IS NULL
       OR v_equation ->> 'output' IS DISTINCT FROM v_expected_outputs[v_equation_index]
       OR NOT COALESCE("isValidAdipometryExpression"(v_equation -> 'expression', v_available_variables), FALSE) THEN
      RETURN FALSE;
    END IF;
    v_available_variables := ARRAY_APPEND(v_available_variables, v_equation ->> 'output');
  END LOOP;

  IF (
    SELECT COUNT(DISTINCT equation ->> 'id')
    FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'equations') equation
  ) <> 3 THEN
    RETURN FALSE;
  END IF;

  IF JSONB_TYPEOF(p_definition #> '{limits,blocking}') IS DISTINCT FROM 'object'
     OR JSONB_TYPEOF(p_definition #> '{limits,warnings}') IS DISTINCT FROM 'array' THEN
    RETURN FALSE;
  END IF;

  FOREACH v_field IN ARRAY ARRAY[
    'weightKg', 'tricepsMm', 'subscapularMm', 'suprailiacMm', 'abdominalMm', 'thighMm'
  ] LOOP
    v_limit := p_definition #> ARRAY['limits', 'blocking', v_field];
    IF JSONB_TYPEOF(v_limit) IS DISTINCT FROM 'object'
       OR JSONB_TYPEOF(v_limit -> 'min') IS DISTINCT FROM 'number'
       OR JSONB_TYPEOF(v_limit -> 'max') IS DISTINCT FROM 'number'
       OR (v_limit ->> 'max')::NUMERIC <= (v_limit ->> 'min')::NUMERIC THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  FOR v_warning IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_definition #> '{limits,warnings}') LOOP
    IF JSONB_TYPEOF(v_warning) IS DISTINCT FROM 'object'
       OR COALESCE(v_warning ->> 'field', '') NOT IN (
         'weightKg', 'tricepsMm', 'subscapularMm', 'suprailiacMm',
         'abdominalMm', 'thighMm', 'skinfoldTotalMm', 'bodyFatPercentage',
         'fatMassKg', 'leanMassKg'
       )
       OR NULLIF(BTRIM(v_warning ->> 'message'), '') IS NULL
       OR (v_warning ? 'min' AND JSONB_TYPEOF(v_warning -> 'min') IS DISTINCT FROM 'number')
       OR (v_warning ? 'max' AND JSONB_TYPEOF(v_warning -> 'max') IS DISTINCT FROM 'number')
       OR (
         v_warning ? 'min' AND v_warning ? 'max'
         AND (v_warning ->> 'max')::NUMERIC <= (v_warning ->> 'min')::NUMERIC
       ) THEN
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
     OR (p_definition #>> '{precision,internalScale}')::INTEGER <
        (p_definition #>> '{precision,resultScale}')::INTEGER THEN
    RETURN FALSE;
  END IF;

  v_max_tolerance := POWER(10::NUMERIC, -(p_definition #>> '{precision,resultScale}')::INTEGER);

  IF p_definition #>> '{rounding,mode}' NOT IN ('HALF_UP', 'HALF_EVEN')
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
       OR JSONB_TYPEOF(v_vector #> '{inputs,profileCriteria,sex}') IS DISTINCT FROM 'string'
       OR JSONB_TYPEOF(v_vector #> '{inputs,measurements}') IS DISTINCT FROM 'object' THEN
      RETURN FALSE;
    END IF;

    v_age := (v_vector #>> '{inputs,ageAtAssessment}')::NUMERIC;
    IF v_age < (p_definition #>> '{population,ageMinYears}')::NUMERIC
       OR v_age > (p_definition #>> '{population,ageMaxYears}')::NUMERIC
       OR NOT ((p_definition #> '{population,sexCriteria}') @>
          JSONB_BUILD_ARRAY(v_vector #>> '{inputs,profileCriteria,sex}')) THEN
      RETURN FALSE;
    END IF;

    FOREACH v_field IN ARRAY ARRAY[
      'weightKg', 'tricepsMm', 'subscapularMm', 'suprailiacMm', 'abdominalMm', 'thighMm'
    ] LOOP
      IF JSONB_TYPEOF(v_vector #> ARRAY['inputs', 'measurements', v_field]) IS DISTINCT FROM 'number' THEN
        RETURN FALSE;
      END IF;
      v_measurement := (v_vector #>> ARRAY['inputs', 'measurements', v_field])::NUMERIC;
      v_limit := p_definition #> ARRAY['limits', 'blocking', v_field];
      IF v_measurement < (v_limit ->> 'min')::NUMERIC
         OR v_measurement > (v_limit ->> 'max')::NUMERIC THEN
        RETURN FALSE;
      END IF;
    END LOOP;

    v_actual := "evaluateAdipometryProtocolVector"(p_definition, v_vector);
    FOREACH v_field IN ARRAY ARRAY[
      'skinfoldTotalMm', 'bodyFatPercentage', 'fatMassKg', 'leanMassKg'
    ] LOOP
      IF JSONB_TYPEOF(v_actual -> v_field) IS DISTINCT FROM 'number'
         OR JSONB_TYPEOF(v_vector #> ARRAY['expectedResults', v_field]) IS DISTINCT FROM 'number'
         OR JSONB_TYPEOF(v_vector #> ARRAY['tolerance', v_field]) IS DISTINCT FROM 'number' THEN
        RETURN FALSE;
      END IF;
      v_expected := (v_vector #>> ARRAY['expectedResults', v_field])::NUMERIC;
      v_tolerance := (v_vector #>> ARRAY['tolerance', v_field])::NUMERIC;
      IF v_tolerance < 0
         OR v_tolerance > v_max_tolerance
         OR ABS((v_actual ->> v_field)::NUMERIC - v_expected) > v_tolerance THEN
        RETURN FALSE;
      END IF;
    END LOOP;

    IF (v_actual ->> 'bodyFatPercentage')::NUMERIC NOT BETWEEN 0 AND 100
       OR (v_actual ->> 'fatMassKg')::NUMERIC < 0
       OR (v_actual ->> 'leanMassKg')::NUMERIC < 0
       OR ABS(
         (v_actual ->> 'fatMassKg')::NUMERIC
         + (v_actual ->> 'leanMassKg')::NUMERIC
         - (v_vector #>> '{inputs,measurements,weightKg}')::NUMERIC
       ) > v_max_tolerance THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  v_approved_at_text := p_definition #>> '{clinicalApproval,approvedAt}';
  IF p_definition #>> '{clinicalApproval,status}' IS DISTINCT FROM 'approved'
     OR p_definition #>> '{clinicalApproval,approverUserId}' IS DISTINCT FROM p_approved_by_user_id
     OR NULLIF(BTRIM(p_definition #>> '{clinicalApproval,approvalRecordId}'), '') IS NULL
     OR COALESCE(p_definition #>> '{clinicalApproval,artifactSha256}', '') !~ '^[0-9a-f]{64}$'
     OR JSONB_TYPEOF(p_definition #> '{clinicalApproval,approvedAt}') IS DISTINCT FROM 'string'
     OR COALESCE(v_approved_at_text, '') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
     OR ((v_approved_at_text::TIMESTAMPTZ AT TIME ZONE 'UTC')::TIMESTAMP(3))
        IS DISTINCT FROM p_approved_at THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

-- Recreate the constraint so any rows introduced before this hardening are
-- scanned against the final validator.
ALTER TABLE "AdipometryProtocol"
  DROP CONSTRAINT "AdipometryProtocol_approval_check";
ALTER TABLE "AdipometryProtocol"
  ADD CONSTRAINT "AdipometryProtocol_approval_check" CHECK (
    "status" <> 'APPROVED'
    OR (
      "approvedAt" IS NOT NULL
      AND "approvedByUserId" IS NOT NULL
      AND NULLIF(BTRIM("reference"), '') IS NOT NULL
      AND "isValidAdipometryProtocolDefinition"(
        "definitionSnapshot",
        "approvedByUserId",
        "approvedAt"
      )
    )
  );

COMMIT;
