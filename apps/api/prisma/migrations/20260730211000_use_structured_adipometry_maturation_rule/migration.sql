BEGIN;

-- Issue #246 adversarial remediation.
-- Completion must consume the executable maturation contract and must never
-- derive eligibility from the human-readable maturationCriteria text.
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
  v_maturation_rule JSONB;
  v_maturation_mode TEXT;
  v_maturation TEXT;
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
  v_sex := NULLIF(UPPER(BTRIM(v_profile ->> 'sex')), '');

  IF v_age <> TRUNC(v_age)
     OR v_age < (v_definition #>> '{population,ageMinYears}')::NUMERIC
     OR v_age > (v_definition #>> '{population,ageMaxYears}')::NUMERIC THEN
    RAISE EXCEPTION 'ADIPOMETRY_AGE_NOT_APPLICABLE' USING ERRCODE = '23514';
  END IF;

  IF v_sex IS NULL
     OR NOT ((v_definition #> '{population,sexCriteria}') @> JSONB_BUILD_ARRAY(v_sex)) THEN
    RAISE EXCEPTION 'ADIPOMETRY_SEX_NOT_APPLICABLE' USING ERRCODE = '23514';
  END IF;

  v_maturation_rule := v_definition #> '{population,maturationRule}';
  IF JSONB_TYPEOF(v_maturation_rule) IS DISTINCT FROM 'object'
     OR JSONB_TYPEOF(v_maturation_rule -> 'mode') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'ADIPOMETRY_MATURATION_RULE_INVALID' USING ERRCODE = '23514';
  END IF;

  v_maturation_mode := v_maturation_rule ->> 'mode';
  v_maturation := NULLIF(UPPER(BTRIM(v_profile ->> 'maturation')), '');

  IF v_maturation_mode = 'REQUIRED' THEN
    IF v_maturation IS NULL THEN
      RAISE EXCEPTION 'ADIPOMETRY_MATURATION_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF JSONB_TYPEOF(v_maturation_rule -> 'allowedValues') IS DISTINCT FROM 'array'
       OR NOT ((v_maturation_rule -> 'allowedValues') @> JSONB_BUILD_ARRAY(v_maturation)) THEN
      RAISE EXCEPTION 'ADIPOMETRY_MATURATION_NOT_APPLICABLE' USING ERRCODE = '23514';
    END IF;
  ELSIF v_maturation_mode <> 'NOT_REQUIRED' THEN
    RAISE EXCEPTION 'ADIPOMETRY_MATURATION_RULE_INVALID' USING ERRCODE = '23514';
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
      'rounding', v_definition -> 'rounding',
      'maturationRule', v_maturation_rule
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

DO $$
DECLARE
  v_definition TEXT;
BEGIN
  SELECT PG_GET_FUNCTIONDEF('"canonicalizeAdipometryCompletion"()'::REGPROCEDURE)
    INTO v_definition;

  IF v_definition LIKE '%population,maturationCriteria%'
     OR v_definition NOT LIKE '%population,maturationRule%' THEN
    RAISE EXCEPTION 'ADIPOMETRY_COMPLETION_MATURATION_CONTRACT_NOT_STRUCTURED';
  END IF;
END $$;

COMMIT;
