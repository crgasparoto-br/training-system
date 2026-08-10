BEGIN;

-- Issue #246 audit remediation.
-- Approval must be backed by a complete, machine-verifiable clinical contract,
-- not merely by non-empty JSON placeholders.
CREATE OR REPLACE FUNCTION "isValidAdipometryProtocolDefinition"(
  p_definition JSONB,
  p_approved_by_user_id TEXT,
  p_approved_at TIMESTAMP(3)
) RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  v_required_skinfolds CONSTANT JSONB := '["tricepsMm","subscapularMm","suprailiacMm","abdominalMm","thighMm"]'::JSONB;
  v_field TEXT;
  v_vector JSONB;
  v_limit JSONB;
BEGIN
  IF JSONB_TYPEOF(p_definition) IS DISTINCT FROM 'object'
     OR JSONB_TYPEOF(p_definition -> 'schemaVersion') IS DISTINCT FROM 'number'
     OR (p_definition ->> 'schemaVersion')::INTEGER < 1
  THEN
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
     OR JSONB_TYPEOF(p_definition #> '{population,maturationCriteria}') IS DISTINCT FROM 'string'
     OR NULLIF(BTRIM(p_definition #>> '{population,maturationCriteria}'), '') IS NULL
  THEN
    RETURN FALSE;
  END IF;

  IF JSONB_TYPEOF(p_definition -> 'requiredSkinfolds') IS DISTINCT FROM 'array'
     OR JSONB_ARRAY_LENGTH(p_definition -> 'requiredSkinfolds') <> 5
     OR NOT ((p_definition -> 'requiredSkinfolds') @> v_required_skinfolds)
     OR NOT (v_required_skinfolds @> (p_definition -> 'requiredSkinfolds'))
  THEN
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
     OR p_definition #>> '{outputUnits,leanMassKg}' IS DISTINCT FROM 'kg'
  THEN
    RETURN FALSE;
  END IF;

  IF JSONB_TYPEOF(p_definition -> 'equations') IS DISTINCT FROM 'array'
     OR JSONB_ARRAY_LENGTH(p_definition -> 'equations') < 3
  THEN
    RETURN FALSE;
  END IF;

  FOREACH v_field IN ARRAY ARRAY['bodyFatPercentage', 'fatMassKg', 'leanMassKg']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'equations') equation
      WHERE equation ->> 'output' = v_field
        AND NULLIF(BTRIM(equation ->> 'id'), '') IS NOT NULL
        AND NULLIF(BTRIM(equation ->> 'expression'), '') IS NOT NULL
        AND JSONB_TYPEOF(equation -> 'variables') = 'array'
        AND JSONB_ARRAY_LENGTH(equation -> 'variables') > 0
    ) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  IF JSONB_TYPEOF(p_definition #> '{limits,blocking}') IS DISTINCT FROM 'object'
     OR JSONB_TYPEOF(p_definition #> '{limits,warnings}') IS DISTINCT FROM 'array'
  THEN
    RETURN FALSE;
  END IF;

  FOREACH v_field IN ARRAY ARRAY[
    'weightKg', 'tricepsMm', 'subscapularMm', 'suprailiacMm', 'abdominalMm', 'thighMm'
  ]
  LOOP
    v_limit := p_definition #> ARRAY['limits', 'blocking', v_field];
    IF JSONB_TYPEOF(v_limit) IS DISTINCT FROM 'object'
       OR JSONB_TYPEOF(v_limit -> 'min') IS DISTINCT FROM 'number'
       OR JSONB_TYPEOF(v_limit -> 'max') IS DISTINCT FROM 'number'
       OR (v_limit ->> 'max')::NUMERIC <= (v_limit ->> 'min')::NUMERIC
    THEN
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
        (p_definition #>> '{precision,resultScale}')::INTEGER
  THEN
    RETURN FALSE;
  END IF;

  IF p_definition #>> '{rounding,mode}' IS NULL
     OR p_definition #>> '{rounding,mode}' NOT IN ('HALF_UP', 'HALF_EVEN')
     OR p_definition #>> '{rounding,stage}' IS DISTINCT FROM 'FINAL_RESULTS_ONLY'
  THEN
    RETURN FALSE;
  END IF;

  IF JSONB_TYPEOF(p_definition -> 'missingDataBehavior') IS DISTINCT FROM 'object'
     OR NULLIF(BTRIM(p_definition #>> '{missingDataBehavior,missingRequired}'), '') IS NULL
     OR NULLIF(BTRIM(p_definition #>> '{missingDataBehavior,incompatibleProfile}'), '') IS NULL
  THEN
    RETURN FALSE;
  END IF;

  IF JSONB_TYPEOF(p_definition -> 'testVectors') IS DISTINCT FROM 'array'
     OR JSONB_ARRAY_LENGTH(p_definition -> 'testVectors') < 2
  THEN
    RETURN FALSE;
  END IF;

  FOR v_vector IN
    SELECT value FROM JSONB_ARRAY_ELEMENTS(p_definition -> 'testVectors')
  LOOP
    IF NULLIF(BTRIM(v_vector ->> 'id'), '') IS NULL
       OR JSONB_TYPEOF(v_vector #> '{inputs,ageAtAssessment}') IS DISTINCT FROM 'number'
       OR JSONB_TYPEOF(v_vector #> '{inputs,profileCriteria}') IS DISTINCT FROM 'object'
       OR JSONB_TYPEOF(v_vector #> '{inputs,measurements}') IS DISTINCT FROM 'object'
       OR JSONB_TYPEOF(v_vector #> '{expectedResults,skinfoldTotalMm}') IS DISTINCT FROM 'number'
       OR JSONB_TYPEOF(v_vector #> '{expectedResults,bodyFatPercentage}') IS DISTINCT FROM 'number'
       OR JSONB_TYPEOF(v_vector #> '{expectedResults,fatMassKg}') IS DISTINCT FROM 'number'
       OR JSONB_TYPEOF(v_vector #> '{expectedResults,leanMassKg}') IS DISTINCT FROM 'number'
       OR JSONB_TYPEOF(v_vector #> '{tolerance,skinfoldTotalMm}') IS DISTINCT FROM 'number'
       OR JSONB_TYPEOF(v_vector #> '{tolerance,bodyFatPercentage}') IS DISTINCT FROM 'number'
       OR JSONB_TYPEOF(v_vector #> '{tolerance,fatMassKg}') IS DISTINCT FROM 'number'
       OR JSONB_TYPEOF(v_vector #> '{tolerance,leanMassKg}') IS DISTINCT FROM 'number'
    THEN
      RETURN FALSE;
    END IF;

    FOREACH v_field IN ARRAY ARRAY[
      'weightKg', 'tricepsMm', 'subscapularMm', 'suprailiacMm', 'abdominalMm', 'thighMm'
    ]
    LOOP
      IF JSONB_TYPEOF(v_vector #> ARRAY['inputs', 'measurements', v_field]) IS DISTINCT FROM 'number' THEN
        RETURN FALSE;
      END IF;
    END LOOP;
  END LOOP;

  IF p_definition #>> '{clinicalApproval,status}' IS DISTINCT FROM 'approved'
     OR p_definition #>> '{clinicalApproval,approverUserId}' IS DISTINCT FROM p_approved_by_user_id
     OR NULLIF(BTRIM(p_definition #>> '{clinicalApproval,approvalRecordId}'), '') IS NULL
     OR COALESCE(p_definition #>> '{clinicalApproval,artifactSha256}', '') !~ '^[0-9a-f]{64}$'
     OR JSONB_TYPEOF(p_definition #> '{clinicalApproval,approvedAt}') IS DISTINCT FROM 'string'
     OR (p_definition #>> '{clinicalApproval,approvedAt}')::TIMESTAMPTZ IS DISTINCT FROM p_approved_at::TIMESTAMPTZ
  THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

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

-- Approved definitions remain immutable, but operational availability can move
-- once from APPROVED to DISABLED without changing the clinical definition.
CREATE OR REPLACE FUNCTION "protectApprovedAdipometryProtocol"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" IN ('APPROVED', 'DISABLED') THEN
    RAISE EXCEPTION 'Approved or disabled adipometry protocols cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" = 'APPROVED' THEN
    IF NEW."status" = 'DISABLED'
       AND (TO_JSONB(NEW) - ARRAY['status', 'updatedAt']) =
           (TO_JSONB(OLD) - ARRAY['status', 'updatedAt'])
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Approved adipometry protocol definitions are immutable; only disabling is allowed'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" = 'DISABLED' THEN
    RAISE EXCEPTION 'Disabled adipometry protocols are immutable and cannot be reactivated'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- correctedByAssessmentId is managed exclusively by the reciprocal correction
-- trigger. Direct writes on drafts or unrelated records are rejected.
CREATE OR REPLACE FUNCTION "validateAdipometryAssessmentState"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_original "AdipometryAssessment"%ROWTYPE;
BEGIN
  IF NEW."status" = 'COMPLETED' AND NOT EXISTS (
    SELECT 1
    FROM "AdipometryProtocol" p
    WHERE p."id" = NEW."protocolId"
      AND p."code" = NEW."protocolCode"
      AND p."version" = NEW."protocolVersion"
      AND p."status" = 'APPROVED'
  ) THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_NOT_APPROVED'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."correctsAssessmentId" = NEW."id"
     OR NEW."correctedByAssessmentId" = NEW."id" THEN
    RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_SELF_REFERENCE'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' AND NEW."correctedByAssessmentId" IS NOT NULL THEN
    RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_LINK_IS_MANAGED'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW."correctedByAssessmentId" IS DISTINCT FROM OLD."correctedByAssessmentId"
  THEN
    IF OLD."status" <> 'COMPLETED'
       OR OLD."correctedByAssessmentId" IS NOT NULL
       OR NEW."correctedByAssessmentId" IS NULL
    THEN
      RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_LINK_IS_MANAGED'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM "AdipometryAssessment" correction
      WHERE correction."id" = NEW."correctedByAssessmentId"
        AND correction."correctsAssessmentId" = OLD."id"
        AND correction."contractId" = OLD."contractId"
        AND correction."alunoId" = OLD."alunoId"
        AND correction."status" = 'COMPLETED'
    ) THEN
      RAISE EXCEPTION 'ADIPOMETRY_INVALID_CORRECTION_LINK'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."correctsAssessmentId" IS NOT NULL THEN
    SELECT * INTO v_original
    FROM "AdipometryAssessment"
    WHERE "id" = NEW."correctsAssessmentId"
    FOR UPDATE;

    IF NOT FOUND
       OR v_original."contractId" <> NEW."contractId"
       OR v_original."alunoId" <> NEW."alunoId"
       OR v_original."status" <> 'COMPLETED'
       OR v_original."correctedByAssessmentId" IS NOT NULL
    THEN
      RAISE EXCEPTION 'ADIPOMETRY_INVALID_CORRECTION_TARGET'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM "Professor" professor
      WHERE professor."userId" = NEW."correctionAuthorUserId"
        AND professor."contractId" = NEW."contractId"
    ) THEN
      RAISE EXCEPTION 'ADIPOMETRY_CORRECTION_AUTHOR_CROSS_TENANT'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
