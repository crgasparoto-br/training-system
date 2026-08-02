BEGIN;

-- Issue #246 audit remediation: make the demographic protocol contract
-- executable against the same canonical fields used during completion.
CREATE OR REPLACE FUNCTION "isValidAdipometryCanonicalPopulation"(
  p_definition JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  v_population JSONB;
  v_maturation_rule JSONB;
  v_mode TEXT;
  v_item JSONB;
BEGIN
  v_population := p_definition -> 'population';
  IF JSONB_TYPEOF(v_population) IS DISTINCT FROM 'object'
     OR JSONB_TYPEOF(v_population -> 'sexCriteria') IS DISTINCT FROM 'array'
     OR JSONB_ARRAY_LENGTH(v_population -> 'sexCriteria') = 0 THEN
    RETURN FALSE;
  END IF;

  FOR v_item IN SELECT value FROM JSONB_ARRAY_ELEMENTS(v_population -> 'sexCriteria') LOOP
    IF JSONB_TYPEOF(v_item) IS DISTINCT FROM 'string'
       OR NULLIF(BTRIM(v_item #>> '{}'), '') IS NULL
       OR (v_item #>> '{}') IS DISTINCT FROM UPPER(BTRIM(v_item #>> '{}'))
       OR (v_item #>> '{}') NOT IN ('MALE', 'FEMALE', 'OTHER') THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  v_maturation_rule := v_population -> 'maturationRule';
  IF JSONB_TYPEOF(v_maturation_rule) IS DISTINCT FROM 'object'
     OR JSONB_TYPEOF(v_maturation_rule -> 'mode') IS DISTINCT FROM 'string' THEN
    RETURN FALSE;
  END IF;

  v_mode := v_maturation_rule ->> 'mode';
  IF v_mode = 'NOT_REQUIRED' THEN
    RETURN (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(v_maturation_rule)) = 1;
  END IF;

  IF v_mode <> 'REQUIRED'
     OR (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(v_maturation_rule)) <> 2
     OR JSONB_TYPEOF(v_maturation_rule -> 'allowedValues') IS DISTINCT FROM 'array'
     OR JSONB_ARRAY_LENGTH(v_maturation_rule -> 'allowedValues') = 0 THEN
    RETURN FALSE;
  END IF;

  IF (
    SELECT COUNT(DISTINCT item #>> '{}')
    FROM JSONB_ARRAY_ELEMENTS(v_maturation_rule -> 'allowedValues') item
    WHERE JSONB_TYPEOF(item) = 'string'
      AND NULLIF(BTRIM(item #>> '{}'), '') IS NOT NULL
      AND (item #>> '{}') = UPPER(BTRIM(item #>> '{}'))
      AND (item #>> '{}') ~ '^[A-Z0-9][A-Z0-9 _-]*$'
  ) <> JSONB_ARRAY_LENGTH(v_maturation_rule -> 'allowedValues') THEN
    RETURN FALSE;
  END IF;

  -- Every approval vector must prove a profile that the production resolver can
  -- actually produce. A caller-only maturation value cannot satisfy the gate.
  FOR v_item IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'testVectors') LOOP
    IF JSONB_TYPEOF(v_item #> '{inputs,profileCriteria,maturation}') IS DISTINCT FROM 'string'
       OR NOT ((v_maturation_rule -> 'allowedValues') @>
          JSONB_BUILD_ARRAY(UPPER(BTRIM(v_item #>> '{inputs,profileCriteria,maturation}')))) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

-- Keep the expression language aligned with the finite canonical profile.
-- Age is already available as the numeric variable ageAtAssessment; conditionals
-- may only inspect canonical sex or maturation.
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
  v_expected TEXT;
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
      v_expected := p_expression ->> 'expected';
      RETURN (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(p_expression)) = 5
        AND v_field IN ('profileCriteria.sex', 'profileCriteria.maturation')
        AND JSONB_TYPEOF(p_expression -> 'expected') = 'string'
        AND NULLIF(BTRIM(v_expected), '') IS NOT NULL
        AND v_expected = UPPER(BTRIM(v_expected))
        AND (
          (v_field = 'profileCriteria.sex' AND v_expected IN ('MALE', 'FEMALE', 'OTHER'))
          OR
          (v_field = 'profileCriteria.maturation' AND v_expected ~ '^[A-Z0-9][A-Z0-9 _-]*$')
        )
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

-- Re-scan approved rows using both the generic executable contract and the
-- canonical demographic contract.
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
      AND "isValidAdipometryCanonicalPopulation"("definitionSnapshot")
    )
  );

CREATE OR REPLACE FUNCTION "validateAdipometryCanonicalProtocolProfile"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_definition JSONB;
  v_profile JSONB;
  v_rule JSONB;
  v_mode TEXT;
  v_sex TEXT;
  v_maturation TEXT;
BEGIN
  IF NEW."status" <> 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  -- Reciprocal correction linking must not rewrite a historical snapshot.
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

  IF NOT FOUND
     OR NOT COALESCE("isValidAdipometryCanonicalPopulation"(v_definition), FALSE) THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_CANONICAL_PROFILE_INVALID' USING ERRCODE = '23514';
  END IF;

  IF JSONB_TYPEOF(NEW."calculationSnapshot" -> 'profileCriteria') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROFILE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  v_profile := NEW."calculationSnapshot" -> 'profileCriteria';
  v_sex := UPPER(BTRIM(COALESCE(v_profile ->> 'sex', '')));
  v_maturation := NULLIF(UPPER(BTRIM(COALESCE(v_profile ->> 'maturation', ''))), '');

  IF v_sex NOT IN ('MALE', 'FEMALE', 'OTHER') THEN
    RAISE EXCEPTION 'ADIPOMETRY_SEX_INVALID' USING ERRCODE = '23514';
  END IF;

  IF NOT ((v_definition #> '{population,sexCriteria}') @> JSONB_BUILD_ARRAY(v_sex)) THEN
    RAISE EXCEPTION 'ADIPOMETRY_SEX_NOT_APPLICABLE' USING ERRCODE = '23514';
  END IF;

  v_rule := v_definition #> '{population,maturationRule}';
  v_mode := v_rule ->> 'mode';

  IF v_mode = 'REQUIRED' THEN
    IF v_maturation IS NULL THEN
      RAISE EXCEPTION 'ADIPOMETRY_MATURATION_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF NOT ((v_rule -> 'allowedValues') @> JSONB_BUILD_ARRAY(v_maturation)) THEN
      RAISE EXCEPTION 'ADIPOMETRY_MATURATION_NOT_APPLICABLE' USING ERRCODE = '23514';
    END IF;
  ELSIF v_mode <> 'NOT_REQUIRED' THEN
    RAISE EXCEPTION 'ADIPOMETRY_MATURATION_RULE_INVALID' USING ERRCODE = '23514';
  END IF;

  NEW."calculationSnapshot" := JSONB_SET(
    NEW."calculationSnapshot",
    '{profileCriteria,sex}',
    TO_JSONB(v_sex),
    TRUE
  );
  NEW."calculationSnapshot" := JSONB_SET(
    NEW."calculationSnapshot",
    '{profileCriteria,maturation}',
    CASE WHEN v_maturation IS NULL THEN 'null'::JSONB ELSE TO_JSONB(v_maturation) END,
    TRUE
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "AdipometryAssessment_00z_validate_canonical_profile" ON "AdipometryAssessment";
CREATE TRIGGER "AdipometryAssessment_00z_validate_canonical_profile"
BEFORE INSERT OR UPDATE ON "AdipometryAssessment"
FOR EACH ROW
EXECUTE FUNCTION "validateAdipometryCanonicalProtocolProfile"();

COMMIT;
