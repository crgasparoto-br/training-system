BEGIN;

-- Issue #246 / independent audit B-246-01.
-- Contract-scoped protocol approval must execute every canonical test vector.
-- The previous definition returned TRUE immediately after checking only the
-- vector count, leaving the result and tolerance comparisons unreachable.
CREATE OR REPLACE FUNCTION "isValidAdipometryContractProtocolDefinition"(p_definition JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
STRICT
AS $$
DECLARE
  v_all_skinfolds CONSTANT JSONB := '["tricepsMm","subscapularMm","suprailiacMm","abdominalMm","thighMm"]'::JSONB;
  v_male_skinfolds CONSTANT JSONB := '["tricepsMm","suprailiacMm","abdominalMm"]'::JSONB;
  v_female_skinfolds CONSTANT JSONB := '["subscapularMm","suprailiacMm","thighMm"]'::JSONB;
  v_allowed_variables TEXT[] := ARRAY[
    'weightKg','tricepsMm','subscapularMm','suprailiacMm','abdominalMm','thighMm',
    'skinfoldTotalMm','ageAtAssessment'
  ];
  v_expected_outputs CONSTANT TEXT[] := ARRAY['bodyFatPercentage','fatMassKg','leanMassKg'];
  v_equation JSONB;
  v_vector JSONB;
  v_field TEXT;
  v_limit JSONB;
  v_actual JSONB;
  v_expected NUMERIC;
  v_tolerance NUMERIC;
  v_index INTEGER := 0;
  v_sex TEXT;
BEGIN
  IF JSONB_TYPEOF(p_definition) IS DISTINCT FROM 'object'
     OR (p_definition ->> 'schemaVersion')::INTEGER < 3
     OR NULLIF(BTRIM(p_definition ->> 'internalVersion'), '') IS NULL THEN RETURN FALSE; END IF;

  IF (p_definition #>> '{population,ageMinYears}')::INTEGER <> 18
     OR (p_definition #>> '{population,ageMaxYears}')::INTEGER <> 30
     OR NOT ((p_definition #> '{population,sexCriteria}') @> '["MALE","FEMALE"]'::JSONB)
     OR JSONB_ARRAY_LENGTH(p_definition #> '{population,sexCriteria}') <> 2
     OR p_definition #>> '{population,maturationRule,mode}' IS DISTINCT FROM 'NOT_REQUIRED' THEN RETURN FALSE; END IF;

  IF JSONB_ARRAY_LENGTH(p_definition -> 'requiredSkinfolds') <> 5
     OR NOT ((p_definition -> 'requiredSkinfolds') @> v_all_skinfolds)
     OR NOT (v_all_skinfolds @> (p_definition -> 'requiredSkinfolds'))
     OR NOT ((p_definition #> '{calculationSkinfoldsBySex,MALE}') @> v_male_skinfolds)
     OR NOT (v_male_skinfolds @> (p_definition #> '{calculationSkinfoldsBySex,MALE}'))
     OR NOT ((p_definition #> '{calculationSkinfoldsBySex,FEMALE}') @> v_female_skinfolds)
     OR NOT (v_female_skinfolds @> (p_definition #> '{calculationSkinfoldsBySex,FEMALE}')) THEN RETURN FALSE; END IF;

  IF p_definition #>> '{inputScales,weightKg}' IS DISTINCT FROM '2'
     OR p_definition #>> '{inputScales,tricepsMm}' IS DISTINCT FROM '1'
     OR p_definition #>> '{inputScales,subscapularMm}' IS DISTINCT FROM '1'
     OR p_definition #>> '{inputScales,suprailiacMm}' IS DISTINCT FROM '1'
     OR p_definition #>> '{inputScales,abdominalMm}' IS DISTINCT FROM '1'
     OR p_definition #>> '{inputScales,thighMm}' IS DISTINCT FROM '1'
     OR p_definition #>> '{rounding,mode}' IS DISTINCT FROM 'HALF_UP'
     OR p_definition #>> '{rounding,stage}' IS DISTINCT FROM 'FINAL_RESULTS_ONLY'
     OR p_definition #>> '{precision,resultScale}' IS DISTINCT FROM '2'
     OR p_definition #>> '{precision,internalScale}' IS DISTINCT FROM '8' THEN RETURN FALSE; END IF;

  FOREACH v_field IN ARRAY ARRAY['weightKg','tricepsMm','subscapularMm','suprailiacMm','abdominalMm','thighMm'] LOOP
    v_limit := p_definition #> ARRAY['limits','blocking',v_field];
    IF JSONB_TYPEOF(v_limit) IS DISTINCT FROM 'object'
       OR JSONB_TYPEOF(v_limit -> 'min') IS DISTINCT FROM 'number'
       OR JSONB_TYPEOF(v_limit -> 'max') IS DISTINCT FROM 'number'
       OR (v_limit ->> 'min')::NUMERIC <= 0
       OR (v_limit ->> 'max')::NUMERIC <= (v_limit ->> 'min')::NUMERIC THEN RETURN FALSE; END IF;
  END LOOP;

  IF JSONB_ARRAY_LENGTH(p_definition -> 'equations') <> 3 THEN RETURN FALSE; END IF;
  FOR v_equation IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'equations') LOOP
    v_index := v_index + 1;
    IF v_equation ->> 'output' IS DISTINCT FROM v_expected_outputs[v_index]
       OR NOT "isValidAdipometryContractExpression"(v_equation -> 'expression', v_allowed_variables) THEN RETURN FALSE; END IF;
    v_allowed_variables := ARRAY_APPEND(v_allowed_variables, v_equation ->> 'output');
  END LOOP;

  IF JSONB_TYPEOF(p_definition -> 'testVectors') IS DISTINCT FROM 'array'
     OR JSONB_ARRAY_LENGTH(p_definition -> 'testVectors') < 3 THEN RETURN FALSE; END IF;

  FOR v_vector IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'testVectors') LOOP
    v_sex := UPPER(BTRIM(v_vector #>> '{inputs,profileCriteria,sex}'));
    IF v_sex NOT IN ('MALE','FEMALE')
       OR (v_vector #>> '{inputs,ageAtAssessment}')::INTEGER NOT BETWEEN 18 AND 30 THEN RETURN FALSE; END IF;

    v_actual := "evaluateAdipometryContractProtocolVector"(p_definition, v_vector);

    FOREACH v_field IN ARRAY ARRAY['skinfoldTotalMm','bodyFatPercentage','fatMassKg','leanMassKg'] LOOP
      IF JSONB_TYPEOF(v_vector #> ARRAY['expectedResults',v_field]) IS DISTINCT FROM 'number'
         OR JSONB_TYPEOF(v_vector #> ARRAY['tolerance',v_field]) IS DISTINCT FROM 'number' THEN RETURN FALSE; END IF;

      v_expected := (v_vector #>> ARRAY['expectedResults',v_field])::NUMERIC;
      v_tolerance := (v_vector #>> ARRAY['tolerance',v_field])::NUMERIC;

      IF v_tolerance < 0 OR v_tolerance > 0.01 THEN RETURN FALSE; END IF;
      IF ABS(
        "roundAdipometryValue"(
          (v_actual ->> v_field)::NUMERIC,
          CASE WHEN v_field = 'skinfoldTotalMm' THEN 1 ELSE 2 END,
          'HALF_UP'
        ) - v_expected
      ) > v_tolerance THEN RETURN FALSE; END IF;
    END LOOP;
  END LOOP;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN RETURN FALSE;
END;
$$;

-- Refuse deployment over an already-approved snapshot that the corrected
-- validator cannot reproduce. Historical approvals remain immutable; an
-- invalid row therefore requires an explicit operational remediation.
-- Reduced compatibility gates may replay this migration before the governance
-- table exists; in that harness the migration is intentionally a no-op here
-- and the isolated full-chain control verifies the production ordering.
DO $validate_existing_approvals$
BEGIN
  IF TO_REGCLASS('"AdipometryProtocolApproval"') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "AdipometryProtocolApproval" approval
    WHERE NOT "isValidAdipometryContractProtocolDefinition"(
      approval."protocolDefinitionSnapshot"
    )
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_EXISTING_APPROVAL_VECTOR_VALIDATION_FAILED'
      USING ERRCODE = '23514';
  END IF;
END;
$validate_existing_approvals$;

COMMIT;
