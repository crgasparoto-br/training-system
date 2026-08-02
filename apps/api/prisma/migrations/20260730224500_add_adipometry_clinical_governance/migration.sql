BEGIN;

CREATE OR REPLACE FUNCTION "roundAdipometryValue"(
  p_value NUMERIC,
  p_scale INTEGER,
  p_mode TEXT
) RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $round$
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
  IF p_mode = 'HALF_UP' THEN RETURN ROUND(p_value, p_scale); END IF;
  IF p_mode <> 'HALF_EVEN' THEN
    RAISE EXCEPTION 'ADIPOMETRY_ROUNDING_MODE_INVALID' USING ERRCODE = '22023';
  END IF;
  v_factor := POWER(10::NUMERIC, p_scale);
  v_absolute := ABS(p_value) * v_factor;
  v_lower := FLOOR(v_absolute);
  v_fraction := v_absolute - v_lower;
  IF v_fraction < 0.5 THEN v_rounded := v_lower;
  ELSIF v_fraction > 0.5 THEN v_rounded := v_lower + 1;
  ELSIF MOD(v_lower, 2) = 0 THEN v_rounded := v_lower;
  ELSE v_rounded := v_lower + 1; END IF;
  RETURN SIGN(p_value) * v_rounded / v_factor;
END;
$round$;

-- Issue #246: contract-scoped clinical governance and the canonical
-- GUEDES_1991_ADULT_YOUNG candidate definition. The protocol remains DRAFT
-- globally and becomes usable only after an explicit approval in each contract.

CREATE TABLE "AdipometryClinicalResponsibility" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "professorId" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "designatedByUserId" TEXT NOT NULL,
  "designatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedByUserId" TEXT,
  "endedAt" TIMESTAMP(3),
  "endReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdipometryClinicalResponsibility_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdipometryClinicalResponsibility_domain_check"
    CHECK ("domain" = 'ADIPOMETRY_CLINICAL_RESPONSIBLE'),
  CONSTRAINT "AdipometryClinicalResponsibility_period_check" CHECK (
    (
      "effectiveTo" IS NULL
      AND "endedByUserId" IS NULL
      AND "endedAt" IS NULL
      AND "endReason" IS NULL
    )
    OR
    (
      "effectiveTo" IS NOT NULL
      AND "endedByUserId" IS NOT NULL
      AND "endedAt" IS NOT NULL
      AND NULLIF(BTRIM("endReason"), '') IS NOT NULL
      AND "effectiveTo" = "endedAt"
      AND "effectiveTo" >= "effectiveFrom"
    )
  )
);

CREATE UNIQUE INDEX "AdipometryClinicalResponsibility_id_contractId_key"
  ON "AdipometryClinicalResponsibility"("id", "contractId");
CREATE UNIQUE INDEX "AdipometryClinicalResponsibility_active_key"
  ON "AdipometryClinicalResponsibility"("contractId", "domain")
  WHERE "effectiveTo" IS NULL;
CREATE INDEX "AdipometryClinicalResponsibility_contract_history_idx"
  ON "AdipometryClinicalResponsibility"("contractId", "domain", "effectiveFrom" DESC);
CREATE INDEX "AdipometryClinicalResponsibility_professor_idx"
  ON "AdipometryClinicalResponsibility"("professorId", "effectiveFrom" DESC);

ALTER TABLE "AdipometryClinicalResponsibility"
  ADD CONSTRAINT "AdipometryClinicalResponsibility_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryClinicalResponsibility"
  ADD CONSTRAINT "AdipometryClinicalResponsibility_professor_contract_fkey"
  FOREIGN KEY ("professorId") REFERENCES "Professor"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryClinicalResponsibility"
  ADD CONSTRAINT "AdipometryClinicalResponsibility_designatedByUserId_fkey"
  FOREIGN KEY ("designatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryClinicalResponsibility"
  ADD CONSTRAINT "AdipometryClinicalResponsibility_endedByUserId_fkey"
  FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AdipometryProtocolApproval" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "protocolId" TEXT NOT NULL,
  "protocolCode" TEXT NOT NULL,
  "protocolVersion" INTEGER NOT NULL,
  "responsibilityId" TEXT NOT NULL,
  "approvedByProfessorId" TEXT NOT NULL,
  "approvedByUserId" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "approvalStatement" TEXT NOT NULL,
  "approvedByNameSnapshot" TEXT NOT NULL,
  "approvedByCrefSnapshot" TEXT NOT NULL,
  "approvedSpecificationHash" TEXT NOT NULL,
  "protocolDefinitionSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdipometryProtocolApproval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdipometryProtocolApproval_statement_check"
    CHECK (LENGTH(BTRIM("approvalStatement")) >= 30),
  CONSTRAINT "AdipometryProtocolApproval_name_check"
    CHECK (NULLIF(BTRIM("approvedByNameSnapshot"), '') IS NOT NULL),
  CONSTRAINT "AdipometryProtocolApproval_cref_check"
    CHECK (NULLIF(BTRIM("approvedByCrefSnapshot"), '') IS NOT NULL),
  CONSTRAINT "AdipometryProtocolApproval_hash_check"
    CHECK ("approvedSpecificationHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "AdipometryProtocolApproval_version_check"
    CHECK ("protocolVersion" > 0)
);

CREATE UNIQUE INDEX "AdipometryProtocolApproval_contract_protocol_key"
  ON "AdipometryProtocolApproval"("contractId", "protocolId", "protocolCode", "protocolVersion");
CREATE INDEX "AdipometryProtocolApproval_contract_approvedAt_idx"
  ON "AdipometryProtocolApproval"("contractId", "approvedAt" DESC);
CREATE INDEX "AdipometryProtocolApproval_responsibility_idx"
  ON "AdipometryProtocolApproval"("responsibilityId");

ALTER TABLE "AdipometryProtocolApproval"
  ADD CONSTRAINT "AdipometryProtocolApproval_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryProtocolApproval"
  ADD CONSTRAINT "AdipometryProtocolApproval_protocol_identity_fkey"
  FOREIGN KEY ("protocolId")
  REFERENCES "AdipometryProtocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryProtocolApproval"
  ADD CONSTRAINT "AdipometryProtocolApproval_responsibility_contract_fkey"
  FOREIGN KEY ("responsibilityId", "contractId")
  REFERENCES "AdipometryClinicalResponsibility"("id", "contractId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryProtocolApproval"
  ADD CONSTRAINT "AdipometryProtocolApproval_professor_contract_fkey"
  FOREIGN KEY ("approvedByProfessorId")
  REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryProtocolApproval"
  ADD CONSTRAINT "AdipometryProtocolApproval_user_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "isEligibleAdipometryClinicalResponsible"(
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
      AND (
        professor.role::TEXT = 'master'
        OR EXISTS (
          SELECT 1
          FROM "AccessPermission" permission
          WHERE permission."collaboratorFunctionId" = professor."collaboratorFunctionId"
            AND permission."screenKey" = 'settings.contract'
            AND permission."blockKey" = 'settings.contract.adipometryProtocolApproval'
            AND permission."canView" = TRUE
        )
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
    IF NOT "isEligibleAdipometryClinicalResponsible"(
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

CREATE TRIGGER "AdipometryClinicalResponsibility_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "AdipometryClinicalResponsibility"
FOR EACH ROW EXECUTE FUNCTION "guardAdipometryClinicalResponsibility"();

CREATE OR REPLACE FUNCTION "evaluateAdipometryContractExpression"(
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
        v_result := v_result + "evaluateAdipometryContractExpression"(v_item, p_context);
      END LOOP;
      RETURN v_result;
    WHEN 'subtract' THEN
      RETURN "evaluateAdipometryContractExpression"(p_expression -> 'left', p_context)
        - "evaluateAdipometryContractExpression"(p_expression -> 'right', p_context);
    WHEN 'multiply' THEN
      IF JSONB_TYPEOF(p_expression -> 'args') IS DISTINCT FROM 'array'
         OR JSONB_ARRAY_LENGTH(p_expression -> 'args') < 2 THEN
        RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_INVALID_MULTIPLY' USING ERRCODE = '22023';
      END IF;
      v_result := 1;
      FOR v_item IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_expression -> 'args') LOOP
        v_result := v_result * "evaluateAdipometryContractExpression"(v_item, p_context);
      END LOOP;
      RETURN v_result;
    WHEN 'divide' THEN
      v_divisor := "evaluateAdipometryContractExpression"(p_expression -> 'denominator', p_context);
      IF v_divisor = 0 THEN
        RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_DIVISION_BY_ZERO' USING ERRCODE = '22012';
      END IF;
      RETURN "evaluateAdipometryContractExpression"(p_expression -> 'numerator', p_context) / v_divisor;
    WHEN 'power' THEN
      RETURN POWER(
        "evaluateAdipometryContractExpression"(p_expression -> 'base', p_context),
        "evaluateAdipometryContractExpression"(p_expression -> 'exponent', p_context)
      );
    WHEN 'log10' THEN
      v_result := "evaluateAdipometryContractExpression"(p_expression -> 'value', p_context);
      IF v_result <= 0 THEN
        RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_LOG10_NON_POSITIVE' USING ERRCODE = '22023';
      END IF;
      RETURN LN(v_result) / LN(10::NUMERIC);
    WHEN 'negate' THEN
      RETURN -"evaluateAdipometryContractExpression"(p_expression -> 'value', p_context);
    WHEN 'ifEquals' THEN
      v_path := STRING_TO_ARRAY(p_expression ->> 'field', '.');
      IF p_context #> v_path IS NULL THEN
        RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_CONDITIONAL_FIELD_MISSING' USING ERRCODE = '22023';
      END IF;
      IF (p_context #> v_path) = p_expression -> 'expected' THEN
        RETURN "evaluateAdipometryContractExpression"(p_expression -> 'then', p_context);
      END IF;
      RETURN "evaluateAdipometryContractExpression"(p_expression -> 'else', p_context);
    ELSE
      RAISE EXCEPTION 'ADIPOMETRY_EXPRESSION_UNSUPPORTED_OPERATOR: %', COALESCE(v_op, '<missing>')
        USING ERRCODE = '22023';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION "isValidAdipometryContractExpression"(
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
BEGIN
  IF JSONB_TYPEOF(p_expression) IS DISTINCT FROM 'object' THEN RETURN FALSE; END IF;
  v_op := p_expression ->> 'op';
  CASE v_op
    WHEN 'constant' THEN
      RETURN JSONB_TYPEOF(p_expression -> 'value') = 'number'
        AND (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(p_expression)) = 2;
    WHEN 'variable' THEN
      RETURN JSONB_TYPEOF(p_expression -> 'name') = 'string'
        AND (p_expression ->> 'name') = ANY(p_allowed_variables)
        AND (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(p_expression)) = 2;
    WHEN 'add', 'multiply' THEN
      IF JSONB_TYPEOF(p_expression -> 'args') IS DISTINCT FROM 'array'
         OR JSONB_ARRAY_LENGTH(p_expression -> 'args') < 2
         OR (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(p_expression)) <> 2 THEN RETURN FALSE; END IF;
      FOR v_item IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_expression -> 'args') LOOP
        IF NOT "isValidAdipometryContractExpression"(v_item, p_allowed_variables) THEN RETURN FALSE; END IF;
      END LOOP;
      RETURN TRUE;
    WHEN 'subtract' THEN
      RETURN (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(p_expression)) = 3
        AND "isValidAdipometryContractExpression"(p_expression -> 'left', p_allowed_variables)
        AND "isValidAdipometryContractExpression"(p_expression -> 'right', p_allowed_variables);
    WHEN 'divide' THEN
      RETURN (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(p_expression)) = 3
        AND "isValidAdipometryContractExpression"(p_expression -> 'numerator', p_allowed_variables)
        AND "isValidAdipometryContractExpression"(p_expression -> 'denominator', p_allowed_variables);
    WHEN 'power' THEN
      RETURN (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(p_expression)) = 3
        AND "isValidAdipometryContractExpression"(p_expression -> 'base', p_allowed_variables)
        AND "isValidAdipometryContractExpression"(p_expression -> 'exponent', p_allowed_variables);
    WHEN 'log10', 'negate' THEN
      RETURN (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(p_expression)) = 2
        AND "isValidAdipometryContractExpression"(p_expression -> 'value', p_allowed_variables);
    WHEN 'ifEquals' THEN
      RETURN (SELECT COUNT(*) FROM JSONB_OBJECT_KEYS(p_expression)) = 5
        AND (p_expression ->> 'field') = 'profileCriteria.sex'
        AND JSONB_TYPEOF(p_expression -> 'expected') = 'string'
        AND (p_expression ->> 'expected') IN ('MALE', 'FEMALE')
        AND "isValidAdipometryContractExpression"(p_expression -> 'then', p_allowed_variables)
        AND "isValidAdipometryContractExpression"(p_expression -> 'else', p_allowed_variables);
    ELSE RETURN FALSE;
  END CASE;
EXCEPTION WHEN OTHERS THEN RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION "evaluateAdipometryContractProtocolVector"(
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
  v_total NUMERIC := 0;
  v_field JSONB;
  v_sex TEXT;
  v_selected JSONB;
  v_seen TEXT[] := ARRAY[]::TEXT[];
BEGIN
  v_context := COALESCE(p_vector #> '{inputs,measurements}', '{}'::JSONB)
    || JSONB_BUILD_OBJECT(
      'ageAtAssessment', p_vector #> '{inputs,ageAtAssessment}',
      'profileCriteria', COALESCE(p_vector #> '{inputs,profileCriteria}', '{}'::JSONB)
    );
  v_sex := UPPER(BTRIM(p_vector #>> '{inputs,profileCriteria,sex}'));
  v_selected := p_definition #> ARRAY['calculationSkinfoldsBySex', v_sex];
  IF JSONB_TYPEOF(v_selected) IS DISTINCT FROM 'array' OR JSONB_ARRAY_LENGTH(v_selected) <> 3 THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_SEX_SKINFOLDS_INVALID' USING ERRCODE = '22023';
  END IF;

  FOR v_field IN SELECT value FROM JSONB_ARRAY_ELEMENTS(v_selected) LOOP
    IF JSONB_TYPEOF(v_context -> (v_field #>> '{}')) IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'ADIPOMETRY_MEASUREMENT_REQUIRED: %', v_field #>> '{}' USING ERRCODE = '22023';
    END IF;
    v_total := v_total + (v_context ->> (v_field #>> '{}'))::NUMERIC;
  END LOOP;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'ADIPOMETRY_SKINFOLD_TOTAL_INVALID' USING ERRCODE = '22023';
  END IF;
  v_context := v_context || JSONB_BUILD_OBJECT('skinfoldTotalMm', v_total);

  FOR v_equation IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'equations') LOOP
    v_output := v_equation ->> 'output';
    IF v_output NOT IN ('bodyFatPercentage', 'fatMassKg', 'leanMassKg') OR v_output = ANY(v_seen) THEN
      RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_INVALID_EQUATION_OUTPUT' USING ERRCODE = '22023';
    END IF;
    v_value := "evaluateAdipometryContractExpression"(v_equation -> 'expression', v_context);
    v_context := v_context || JSONB_BUILD_OBJECT(v_output, v_value);
    v_seen := ARRAY_APPEND(v_seen, v_output);
  END LOOP;

  RETURN JSONB_BUILD_OBJECT(
    'skinfoldTotalMm', v_total,
    'bodyFatPercentage', v_context -> 'bodyFatPercentage',
    'fatMassKg', v_context -> 'fatMassKg',
    'leanMassKg', v_context -> 'leanMassKg'
  );
END;
$$;

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
  RETURN TRUE;
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

CREATE OR REPLACE FUNCTION "guardAdipometryProtocolApproval"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_protocol "AdipometryProtocol"%ROWTYPE;
  v_responsibility "AdipometryClinicalResponsibility"%ROWTYPE;
  v_name TEXT;
  v_cref TEXT;
  v_user_id TEXT;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_APPROVAL_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_protocol
  FROM "AdipometryProtocol"
  WHERE id = NEW."protocolId" AND code = NEW."protocolCode" AND version = NEW."protocolVersion";
  IF NOT FOUND OR v_protocol.status = 'DISABLED' THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_NOT_AVAILABLE_FOR_APPROVAL' USING ERRCODE = '23514';
  END IF;
  IF NEW."protocolDefinitionSnapshot" IS DISTINCT FROM v_protocol."definitionSnapshot"
     OR NOT "isValidAdipometryContractProtocolDefinition"(NEW."protocolDefinitionSnapshot") THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_DEFINITION_INCOMPLETE' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_responsibility
  FROM "AdipometryClinicalResponsibility"
  WHERE id = NEW."responsibilityId"
    AND "contractId" = NEW."contractId"
    AND domain = 'ADIPOMETRY_CLINICAL_RESPONSIBLE';
  IF NOT FOUND
     OR v_responsibility."professorId" <> NEW."approvedByProfessorId"
     OR v_responsibility."effectiveFrom" > NEW."approvedAt"
     OR (v_responsibility."effectiveTo" IS NOT NULL AND v_responsibility."effectiveTo" <= NEW."approvedAt") THEN
    RAISE EXCEPTION 'ADIPOMETRY_APPROVAL_REQUIRES_ACTIVE_RESPONSIBLE' USING ERRCODE = '23514';
  END IF;

  SELECT profile.name, profile.cref, professor."userId"
    INTO v_name, v_cref, v_user_id
  FROM "Professor" professor
  JOIN "User" app_user ON app_user.id = professor."userId"
  JOIN "Profile" profile ON profile."userId" = app_user.id
  WHERE professor.id = NEW."approvedByProfessorId"
    AND professor."contractId" = NEW."contractId";

  IF v_user_id IS DISTINCT FROM NEW."approvedByUserId"
     OR BTRIM(v_name) IS DISTINCT FROM BTRIM(NEW."approvedByNameSnapshot")
     OR BTRIM(v_cref) IS DISTINCT FROM BTRIM(NEW."approvedByCrefSnapshot")
     OR NOT "isEligibleAdipometryClinicalResponsible"(
       NEW."contractId", NEW."approvedByProfessorId", NEW."approvedAt"
     ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_APPROVAL_ACTOR_INVALID' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AdipometryProtocolApproval_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "AdipometryProtocolApproval"
FOR EACH ROW EXECUTE FUNCTION "guardAdipometryProtocolApproval"();

-- Preserve the old placeholder as unavailable and add the canonical candidate.
UPDATE "AdipometryProtocol"
SET status = 'DISABLED',
    "definitionSnapshot" = "definitionSnapshot" || '{"supersededBy":"GUEDES_1991_ADULT_YOUNG"}'::JSONB,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE code = 'GUEDES_ADULT' AND version = 1;

INSERT INTO "AdipometryProtocol" (
  id, code, version, name, status, "definitionSnapshot", reference, "createdAt", "updatedAt"
) VALUES (
  'adpt_protocol_guedes_1991_adult_young_v1',
  'GUEDES_1991_ADULT_YOUNG',
  1,
  'Guedes e Guedes — adultos jovens',
  'DRAFT',
  $guedes${"schemaVersion":3,"internalVersion":"1.0.0","population":{"ageMinYears":18,"ageMaxYears":30,"sexCriteria":["MALE","FEMALE"],"maturationCriteria":"Maturação não participa da aplicabilidade deste protocolo para adultos jovens.","maturationRule":{"mode":"NOT_REQUIRED"}},"requiredSkinfolds":["tricepsMm","subscapularMm","suprailiacMm","abdominalMm","thighMm"],"calculationSkinfoldsBySex":{"MALE":["tricepsMm","suprailiacMm","abdominalMm"],"FEMALE":["subscapularMm","suprailiacMm","thighMm"]},"inputUnits":{"weightKg":"kg","tricepsMm":"mm","subscapularMm":"mm","suprailiacMm":"mm","abdominalMm":"mm","thighMm":"mm"},"inputScales":{"weightKg":2,"tricepsMm":1,"subscapularMm":1,"suprailiacMm":1,"abdominalMm":1,"thighMm":1},"outputUnits":{"skinfoldTotalMm":"mm","bodyDensity":"g/cm3","bodyFatPercentage":"percent","fatMassKg":"kg","leanMassKg":"kg"},"equations":[{"id":"siri-body-fat-percentage","output":"bodyFatPercentage","expression":{"op":"multiply","args":[{"op":"subtract","left":{"op":"divide","numerator":{"op":"constant","value":4.95},"denominator":{"op":"ifEquals","field":"profileCriteria.sex","expected":"MALE","then":{"op":"subtract","left":{"op":"constant","value":1.17136},"right":{"op":"multiply","args":[{"op":"constant","value":0.06706},{"op":"log10","value":{"op":"variable","name":"skinfoldTotalMm"}}]}},"else":{"op":"subtract","left":{"op":"constant","value":1.1665},"right":{"op":"multiply","args":[{"op":"constant","value":0.07063},{"op":"log10","value":{"op":"variable","name":"skinfoldTotalMm"}}]}}}},"right":{"op":"constant","value":4.5}},{"op":"constant","value":100}]}},{"id":"absolute-fat-mass","output":"fatMassKg","expression":{"op":"divide","numerator":{"op":"multiply","args":[{"op":"variable","name":"weightKg"},{"op":"variable","name":"bodyFatPercentage"}]},"denominator":{"op":"constant","value":100}}},{"id":"lean-mass","output":"leanMassKg","expression":{"op":"subtract","left":{"op":"variable","name":"weightKg"},"right":{"op":"variable","name":"fatMassKg"}}}],"limits":{"blocking":{"weightKg":{"min":0.01,"max":999.99},"tricepsMm":{"min":0.1,"max":80.0},"subscapularMm":{"min":0.1,"max":80.0},"suprailiacMm":{"min":0.1,"max":80.0},"abdominalMm":{"min":0.1,"max":80.0},"thighMm":{"min":0.1,"max":80.0}},"warnings":[{"field":"tricepsMm","min":45.1,"max":80.0,"message":"A medida informada pode exceder a capacidade de alguns adipômetros. Confirme a capacidade do equipamento e a técnica de medição antes de concluir a avaliação."},{"field":"subscapularMm","min":45.1,"max":80.0,"message":"A medida informada pode exceder a capacidade de alguns adipômetros. Confirme a capacidade do equipamento e a técnica de medição antes de concluir a avaliação."},{"field":"suprailiacMm","min":45.1,"max":80.0,"message":"A medida informada pode exceder a capacidade de alguns adipômetros. Confirme a capacidade do equipamento e a técnica de medição antes de concluir a avaliação."},{"field":"abdominalMm","min":45.1,"max":80.0,"message":"A medida informada pode exceder a capacidade de alguns adipômetros. Confirme a capacidade do equipamento e a técnica de medição antes de concluir a avaliação."},{"field":"thighMm","min":45.1,"max":80.0,"message":"A medida informada pode exceder a capacidade de alguns adipômetros. Confirme a capacidade do equipamento e a técnica de medição antes de concluir a avaliação."}]},"precision":{"measurementScale":2,"resultScale":2,"internalScale":8,"skinfoldTotalScale":1,"bodyDensityScale":8},"rounding":{"mode":"HALF_UP","stage":"FINAL_RESULTS_ONLY"},"missingDataBehavior":{"missingRequired":"Bloquear cálculo e conclusão, identificando cada medida obrigatória ausente.","incompatibleProfile":"Bloquear cálculo e conclusão com motivo estruturado.","unusedSkinfold":"Preservar quando informada, sem exigir nem incluir no cálculo."},"testVectors":[{"id":"male-25-50mm","inputs":{"ageAtAssessment":25,"profileCriteria":{"sex":"MALE","maturation":null},"measurements":{"tricepsMm":12.0,"subscapularMm":10.0,"suprailiacMm":18.0,"abdominalMm":20.0,"thighMm":10.0,"weightKg":80.0}},"expectedResults":{"skinfoldTotalMm":50.0,"bodyFatPercentage":18.12,"fatMassKg":14.49,"leanMassKg":65.51},"tolerance":{"skinfoldTotalMm":0.01,"bodyFatPercentage":0.01,"fatMassKg":0.01,"leanMassKg":0.01}},{"id":"female-27-60mm","inputs":{"ageAtAssessment":27,"profileCriteria":{"sex":"FEMALE","maturation":null},"measurements":{"tricepsMm":10.0,"subscapularMm":15.0,"suprailiacMm":20.0,"abdominalMm":10.0,"thighMm":25.0,"weightKg":65.0}},"expectedResults":{"skinfoldTotalMm":60.0,"bodyFatPercentage":25.55,"fatMassKg":16.6,"leanMassKg":48.4},"tolerance":{"skinfoldTotalMm":0.01,"bodyFatPercentage":0.01,"fatMassKg":0.01,"leanMassKg":0.01}},{"id":"male-half-up-87.3mm","inputs":{"ageAtAssessment":25,"profileCriteria":{"sex":"MALE","maturation":null},"measurements":{"tricepsMm":20.0,"subscapularMm":10.0,"suprailiacMm":30.0,"abdominalMm":37.3,"thighMm":10.0,"weightKg":70.0}},"expectedResults":{"skinfoldTotalMm":87.3,"bodyFatPercentage":25.42,"fatMassKg":17.79,"leanMassKg":52.21},"tolerance":{"skinfoldTotalMm":0.01,"bodyFatPercentage":0.01,"fatMassKg":0.01,"leanMassKg":0.01}}],"protocolSex":{"allowedValues":["male","female"],"selection":"Required confirmation by the authenticated professional. Profile sex is retained as a separate snapshot; divergence requires a reason."}}$guedes$::JSONB,
  'GUEDES, Dartagnan Pinto; GUEDES, Joana Elisabete Ribeiro Pinto. Proposição de equações para predição de quantidade de gordura corporal em adultos jovens. Semina: Ciências Biológicas e da Saúde, v. 12, n. 2, p. 61–70, 1991. DOI: https://doi.org/10.5433/1679-0367.1991v12n2p61',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT (code, version) DO UPDATE SET
  name = EXCLUDED.name,
  status = 'DRAFT',
  "definitionSnapshot" = EXCLUDED."definitionSnapshot",
  reference = EXCLUDED.reference,
  "approvedAt" = NULL,
  "approvedByUserId" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "AdipometryAssessment"
  ADD COLUMN "protocolSex" TEXT,
  ADD COLUMN "profileSexSnapshot" TEXT,
  ADD COLUMN "protocolSexSource" TEXT,
  ADD COLUMN "protocolSexConfirmedByUserId" TEXT,
  ADD COLUMN "protocolSexConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "protocolSexOverrideReason" TEXT,
  ADD COLUMN "skinfoldCapacityWarningConfirmedByUserId" TEXT,
  ADD COLUMN "skinfoldCapacityWarningConfirmedAt" TIMESTAMP(3);

ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_protocol_sex_check" CHECK (
    "protocolSex" IS NULL OR "protocolSex" IN ('male', 'female')
  ),
  ADD CONSTRAINT "AdipometryAssessment_profile_sex_snapshot_check" CHECK (
    "profileSexSnapshot" IS NULL OR "profileSexSnapshot" IN ('male', 'female', 'other')
  ),
  ADD CONSTRAINT "AdipometryAssessment_protocol_sex_source_check" CHECK (
    "protocolSexSource" IS NULL OR "protocolSexSource" IN (
      'profile', 'professional_confirmation', 'professional_override'
    )
  ),
  ADD CONSTRAINT "AdipometryAssessment_protocol_sex_confirmation_check" CHECK (
    (
      "protocolSex" IS NULL
      AND "protocolSexSource" IS NULL
      AND "protocolSexConfirmedByUserId" IS NULL
      AND "protocolSexConfirmedAt" IS NULL
      AND "protocolSexOverrideReason" IS NULL
    )
    OR
    (
      "protocolSex" IS NOT NULL
      AND "protocolSexSource" IS NOT NULL
      AND "protocolSexConfirmedByUserId" IS NOT NULL
      AND "protocolSexConfirmedAt" IS NOT NULL
      AND (
        "protocolSexSource" <> 'professional_override'
        OR NULLIF(BTRIM("protocolSexOverrideReason"), '') IS NOT NULL
      )
    )
  ),
  ADD CONSTRAINT "AdipometryAssessment_capacity_warning_confirmation_check" CHECK (
    ("skinfoldCapacityWarningConfirmedByUserId" IS NULL AND "skinfoldCapacityWarningConfirmedAt" IS NULL)
    OR
    ("skinfoldCapacityWarningConfirmedByUserId" IS NOT NULL AND "skinfoldCapacityWarningConfirmedAt" IS NOT NULL)
  );

ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_protocolSexConfirmedByUserId_fkey"
  FOREIGN KEY ("protocolSexConfirmedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_capacityWarningConfirmedByUserId_fkey"
  FOREIGN KEY ("skinfoldCapacityWarningConfirmedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdipometryAssessment"
  DROP CONSTRAINT "AdipometryAssessment_completion_check";
ALTER TABLE "AdipometryAssessment"
  ADD CONSTRAINT "AdipometryAssessment_completion_check" CHECK (
    (
      status = 'DRAFT'
      AND "completedAt" IS NULL
      AND "skinfoldTotalMm" IS NULL
      AND "bodyFatPercentage" IS NULL
      AND "fatMassKg" IS NULL
      AND "leanMassKg" IS NULL
      AND "calculationSnapshot" IS NULL
    )
    OR
    (
      status = 'COMPLETED'
      AND "completedAt" IS NOT NULL
      AND "protocolId" IS NOT NULL
      AND "protocolCode" IS NOT NULL
      AND "protocolVersion" IS NOT NULL
      AND "weightKg" IS NOT NULL
      AND "protocolSex" IN ('male','female')
      AND "profileSexSnapshot" IS NOT NULL
      AND "protocolSexSource" IS NOT NULL
      AND "protocolSexConfirmedByUserId" IS NOT NULL
      AND "protocolSexConfirmedAt" IS NOT NULL
      AND (
        (
          "protocolSex" = 'male'
          AND "tricepsMm" IS NOT NULL
          AND "suprailiacMm" IS NOT NULL
          AND "abdominalMm" IS NOT NULL
          AND ABS("skinfoldTotalMm" - ("tricepsMm" + "suprailiacMm" + "abdominalMm")) <= 0.0001
        )
        OR
        (
          "protocolSex" = 'female'
          AND "subscapularMm" IS NOT NULL
          AND "suprailiacMm" IS NOT NULL
          AND "thighMm" IS NOT NULL
          AND ABS("skinfoldTotalMm" - ("subscapularMm" + "suprailiacMm" + "thighMm")) <= 0.0001
        )
      )
      AND "skinfoldTotalMm" IS NOT NULL
      AND "bodyFatPercentage" IS NOT NULL
      AND "fatMassKg" IS NOT NULL
      AND "leanMassKg" IS NOT NULL
      AND ABS(("fatMassKg" + "leanMassKg") - "weightKg") <= 0.02
      AND "calculationSnapshot" IS NOT NULL
      AND JSONB_TYPEOF("calculationSnapshot") = 'object'
    )
  );

CREATE OR REPLACE FUNCTION "validateAdipometryCanonicalProtocolProfile"()
RETURNS trigger
LANGUAGE plpgsql
AS $profile$
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

  IF TG_OP = 'UPDATE' AND OLD."status" = 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  SELECT approval."protocolDefinitionSnapshot"
    INTO v_definition
  FROM "AdipometryProtocolApproval" approval
  JOIN "AdipometryProtocol" protocol
    ON protocol."id" = approval."protocolId"
   AND protocol."code" = approval."protocolCode"
   AND protocol."version" = approval."protocolVersion"
  WHERE approval."contractId" = NEW."contractId"
    AND approval."protocolId" = NEW."protocolId"
    AND approval."protocolCode" = NEW."protocolCode"
    AND approval."protocolVersion" = NEW."protocolVersion"
    AND protocol."status" <> 'DISABLED';

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
  ELSIF v_mode = 'NOT_REQUIRED' THEN
    IF v_maturation IS NOT NULL THEN
      RAISE EXCEPTION 'ADIPOMETRY_MATURATION_NOT_APPLICABLE' USING ERRCODE = '23514';
    END IF;
  ELSE
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
$profile$;

CREATE OR REPLACE FUNCTION "validateAdipometryAssessmentState"()
RETURNS trigger
LANGUAGE plpgsql
AS $state$
DECLARE
  v_original "AdipometryAssessment"%ROWTYPE;
  v_actor_user_id TEXT;
BEGIN
  v_actor_user_id := "requireAdipometryActorUserId"(NEW."contractId", NEW."professorId");

  IF NEW."status" = 'COMPLETED' AND NOT EXISTS (
    SELECT 1
    FROM "AdipometryProtocolApproval" approval
    JOIN "AdipometryProtocol" protocol
      ON protocol."id" = approval."protocolId"
     AND protocol."code" = approval."protocolCode"
     AND protocol."version" = approval."protocolVersion"
    WHERE approval."contractId" = NEW."contractId"
      AND approval."protocolId" = NEW."protocolId"
      AND approval."protocolCode" = NEW."protocolCode"
      AND approval."protocolVersion" = NEW."protocolVersion"
      AND protocol."status" <> 'DISABLED'
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_NOT_APPROVED_FOR_CONTRACT' USING ERRCODE = '23514';
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
$state$;

CREATE OR REPLACE FUNCTION "canonicalizeAdipometryCompletion"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_definition JSONB;
  v_approval JSONB;
  v_profile JSONB;
  v_vector JSONB;
  v_actual JSONB;
  v_limit JSONB;
  v_age NUMERIC;
  v_profile_sex TEXT;
  v_protocol_sex_upper TEXT;
  v_measurement NUMERIC;
  v_field TEXT;
  v_required JSONB;
  v_total NUMERIC;
  v_body_fat NUMERIC;
  v_fat_mass NUMERIC;
  v_lean_mass NUMERIC;
  v_warning_required BOOLEAN := FALSE;
BEGIN
  IF NEW.status <> 'COMPLETED' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'COMPLETED' THEN RETURN NEW; END IF;

  SELECT approval."protocolDefinitionSnapshot",
         JSONB_BUILD_OBJECT(
           'id', approval.id,
           'responsibilityId', approval."responsibilityId",
           'approvedAt', TO_CHAR(approval."approvedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'approvedByProfessorId', approval."approvedByProfessorId",
           'approvedByName', approval."approvedByNameSnapshot",
           'approvedByCref', approval."approvedByCrefSnapshot",
           'approvedSpecificationHash', approval."approvedSpecificationHash"
         )
    INTO v_definition, v_approval
  FROM "AdipometryProtocolApproval" approval
  JOIN "AdipometryProtocol" protocol
    ON protocol.id = approval."protocolId"
   AND protocol.code = approval."protocolCode"
   AND protocol.version = approval."protocolVersion"
  WHERE approval."contractId" = NEW."contractId"
    AND approval."protocolId" = NEW."protocolId"
    AND approval."protocolCode" = NEW."protocolCode"
    AND approval."protocolVersion" = NEW."protocolVersion"
    AND protocol.status <> 'DISABLED';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_NOT_APPROVED_FOR_CONTRACT' USING ERRCODE = '23514';
  END IF;

  IF JSONB_TYPEOF(NEW."calculationSnapshot") IS DISTINCT FROM 'object'
     OR JSONB_TYPEOF(NEW."calculationSnapshot" -> 'ageAtAssessment') IS DISTINCT FROM 'number'
     OR JSONB_TYPEOF(NEW."calculationSnapshot" -> 'profileCriteria') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROFILE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  v_age := (NEW."calculationSnapshot" ->> 'ageAtAssessment')::NUMERIC;
  v_profile := NEW."calculationSnapshot" -> 'profileCriteria';
  v_profile_sex := LOWER(NULLIF(BTRIM(v_profile ->> 'sex'), ''));
  IF v_profile_sex NOT IN ('male','female','other') THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROFILE_SEX_REQUIRED' USING ERRCODE = '23514';
  END IF;
  NEW."profileSexSnapshot" := v_profile_sex;

  IF NEW."protocolSex" NOT IN ('male','female')
     OR NEW."protocolSexSource" NOT IN ('profile','professional_confirmation','professional_override')
     OR NEW."protocolSexConfirmedByUserId" IS NULL
     OR NEW."protocolSexConfirmedAt" IS NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_SEX_CONFIRMATION_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Professor" professor
    WHERE professor."contractId" = NEW."contractId"
      AND professor."userId" = NEW."protocolSexConfirmedByUserId"
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_SEX_CONFIRMER_OUTSIDE_CONTRACT' USING ERRCODE = '23514';
  END IF;
  IF v_profile_sex <> NEW."protocolSex" THEN
    IF NEW."protocolSexSource" <> 'professional_override'
       OR NULLIF(BTRIM(NEW."protocolSexOverrideReason"), '') IS NULL THEN
      RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_SEX_DIVERGENCE_REQUIRES_REASON' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."protocolSexSource" = 'professional_override' THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_SEX_OVERRIDE_WITHOUT_DIVERGENCE' USING ERRCODE = '23514';
  END IF;

  IF v_age <> TRUNC(v_age)
     OR v_age < (v_definition #>> '{population,ageMinYears}')::NUMERIC
     OR v_age > (v_definition #>> '{population,ageMaxYears}')::NUMERIC THEN
    RAISE EXCEPTION 'ADIPOMETRY_AGE_NOT_APPLICABLE' USING ERRCODE = '23514';
  END IF;

  v_protocol_sex_upper := UPPER(NEW."protocolSex");
  v_required := v_definition #> ARRAY['calculationSkinfoldsBySex', v_protocol_sex_upper];
  IF JSONB_TYPEOF(v_required) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_SEX_NOT_APPLICABLE' USING ERRCODE = '23514';
  END IF;

  IF NEW."weightKg" IS NULL OR NEW."weightKg" <> ROUND(NEW."weightKg", 2) THEN
    RAISE EXCEPTION 'ADIPOMETRY_WEIGHT_PRECISION_INVALID' USING ERRCODE = '23514';
  END IF;
  v_limit := v_definition #> '{limits,blocking,weightKg}';
  IF NEW."weightKg" < (v_limit ->> 'min')::NUMERIC OR NEW."weightKg" > (v_limit ->> 'max')::NUMERIC THEN
    RAISE EXCEPTION 'ADIPOMETRY_MEASUREMENT_OUT_OF_RANGE: weightKg' USING ERRCODE = '23514';
  END IF;

  FOREACH v_field IN ARRAY ARRAY['tricepsMm','subscapularMm','suprailiacMm','abdominalMm','thighMm'] LOOP
    v_measurement := CASE v_field
      WHEN 'tricepsMm' THEN NEW."tricepsMm"
      WHEN 'subscapularMm' THEN NEW."subscapularMm"
      WHEN 'suprailiacMm' THEN NEW."suprailiacMm"
      WHEN 'abdominalMm' THEN NEW."abdominalMm"
      WHEN 'thighMm' THEN NEW."thighMm"
    END;

    IF (v_required @> JSONB_BUILD_ARRAY(v_field)) AND v_measurement IS NULL THEN
      RAISE EXCEPTION 'ADIPOMETRY_MEASUREMENT_REQUIRED: %', v_field USING ERRCODE = '23514';
    END IF;
    IF v_measurement IS NOT NULL THEN
      IF v_measurement <> ROUND(v_measurement, 1) THEN
        RAISE EXCEPTION 'ADIPOMETRY_SKINFOLD_PRECISION_INVALID: %', v_field USING ERRCODE = '23514';
      END IF;
      v_limit := v_definition #> ARRAY['limits','blocking',v_field];
      IF v_measurement < (v_limit ->> 'min')::NUMERIC OR v_measurement > (v_limit ->> 'max')::NUMERIC THEN
        RAISE EXCEPTION 'ADIPOMETRY_MEASUREMENT_OUT_OF_RANGE: %', v_field USING ERRCODE = '23514';
      END IF;
      IF v_measurement > 45 THEN v_warning_required := TRUE; END IF;
    END IF;
  END LOOP;

  IF v_warning_required AND (
    NEW."skinfoldCapacityWarningConfirmedByUserId" IS NULL
    OR NEW."skinfoldCapacityWarningConfirmedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_SKINFOLD_CAPACITY_WARNING_CONFIRMATION_REQUIRED' USING ERRCODE = '23514';
  END IF;

  v_profile := v_profile || JSONB_BUILD_OBJECT(
    'profileSex', UPPER(v_profile_sex),
    'sex', v_protocol_sex_upper,
    'protocolSex', NEW."protocolSex",
    'protocolSexSource', NEW."protocolSexSource"
  );
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

  v_actual := "evaluateAdipometryContractProtocolVector"(v_definition, v_vector);
  v_total := "roundAdipometryValue"((v_actual ->> 'skinfoldTotalMm')::NUMERIC, 1, 'HALF_UP');
  v_body_fat := "roundAdipometryValue"((v_actual ->> 'bodyFatPercentage')::NUMERIC, 2, 'HALF_UP');
  v_fat_mass := "roundAdipometryValue"((v_actual ->> 'fatMassKg')::NUMERIC, 2, 'HALF_UP');
  v_lean_mass := "roundAdipometryValue"((v_actual ->> 'leanMassKg')::NUMERIC, 2, 'HALF_UP');

  IF v_body_fat NOT BETWEEN 0 AND 100 OR v_fat_mass < 0 OR v_lean_mass < 0
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
    'protocolApproval', v_approval,
    'assessmentDate', TO_CHAR(NEW."assessmentDate", 'YYYY-MM-DD'),
    'ageAtAssessment', v_age,
    'profileCriteria', v_profile,
    'protocolSexDecision', JSONB_BUILD_OBJECT(
      'protocolSex', NEW."protocolSex",
      'profileSexSnapshot', NEW."profileSexSnapshot",
      'source', NEW."protocolSexSource",
      'confirmedByUserId', NEW."protocolSexConfirmedByUserId",
      'confirmedAt', TO_CHAR(NEW."protocolSexConfirmedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'overrideReason', NEW."protocolSexOverrideReason"
    ),
    'inputs', v_vector #> '{inputs,measurements}',
    'rules', JSONB_BUILD_OBJECT(
      'calculationSkinfolds', v_required,
      'equations', v_definition -> 'equations',
      'limits', v_definition -> 'limits',
      'precision', v_definition -> 'precision',
      'rounding', v_definition -> 'rounding'
    ),
    'warningConfirmation', CASE WHEN v_warning_required THEN JSONB_BUILD_OBJECT(
      'confirmedByUserId', NEW."skinfoldCapacityWarningConfirmedByUserId",
      'confirmedAt', TO_CHAR(NEW."skinfoldCapacityWarningConfirmedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) ELSE NULL END,
    'results', JSONB_BUILD_OBJECT(
      'skinfoldTotalMm', v_total,
      'bodyFatPercentage', v_body_fat,
      'fatMassKg', v_fat_mass,
      'leanMassKg', v_lean_mass
    ),
    'implementationVersion', 'db-adipometry-guedes-v1',
    'calculatedAt', TO_CHAR(CLOCK_TIMESTAMP() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_definition JSONB;
  v_vector JSONB;
  v_actual JSONB;
BEGIN
  SELECT "definitionSnapshot" INTO v_definition
  FROM "AdipometryProtocol"
  WHERE code = 'GUEDES_1991_ADULT_YOUNG' AND version = 1;

  IF NOT "isValidAdipometryContractProtocolDefinition"(v_definition) THEN
    RAISE EXCEPTION 'GUEDES_1991_ADULT_YOUNG definition is not executable';
  END IF;
  IF "roundAdipometryValue"(18.245, 2, 'HALF_UP') <> 18.25 THEN
    RAISE EXCEPTION 'HALF_UP control failed';
  END IF;
  FOR v_vector IN SELECT value FROM JSONB_ARRAY_ELEMENTS(v_definition -> 'testVectors') LOOP
    v_actual := "evaluateAdipometryContractProtocolVector"(v_definition, v_vector);
    IF v_actual IS NULL THEN RAISE EXCEPTION 'Canonical vector did not execute'; END IF;
  END LOOP;
END;
$$;

COMMIT;
