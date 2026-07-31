#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

approval_key_count="$(grep -c "settings.contract.adipometryProtocolApproval" "$ROOT_DIR/packages/types/access-control.ts")"
management_key_count="$(grep -c "settings.contract.actions.manageClinicalTechnicalResponsibility" "$ROOT_DIR/packages/types/access-control.ts")"

if [[ "$approval_key_count" -ne 1 ]]; then
  echo "clinical approval capability must appear only in the catalog, never in profile defaults" >&2
  exit 1
fi
if [[ "$management_key_count" -ne 1 ]]; then
  echo "clinical responsibility management capability must appear only in the catalog" >&2
  exit 1
fi

for category in \
  DATA_ENTRY_ERROR \
  MEASUREMENT_TRANSCRIPTION_ERROR \
  EVALUATION_DATE_ERROR \
  PROTOCOL_SEX_ERROR \
  PROTOCOL_SELECTION_ERROR \
  OTHER; do
  grep -q "'$category'" "$ROOT_DIR/packages/types/adipometry.ts" || {
    echo "missing correction category $category in shared contract" >&2
    exit 1
  }
done

if grep -q "MEASUREMENT_OR_TRANSCRIPTION_ERROR\|DEMOGRAPHIC_CONFIRMATION_ERROR" \
  "$ROOT_DIR/packages/types/adipometry.ts"; then
  echo "collapsed correction categories remain in the shared contract" >&2
  exit 1
fi

grep -q "explicitBlockAccessMiddleware" \
  "$ROOT_DIR/apps/api/src/modules/access-control/access-control.middleware.ts"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

DO $$
DECLARE
  v_definition JSONB;
  v_vector JSONB;
  v_actual JSONB;
  v_expected JSONB;
  v_field TEXT;
  v_scale INTEGER;
  v_function_definition TEXT;
  v_constraint_definition TEXT;
BEGIN
  IF TO_REGCLASS('"AdipometryClinicalResponsibility"') IS NULL
     OR TO_REGCLASS('"AdipometryProtocolApproval"') IS NULL THEN
    RAISE EXCEPTION 'adipometry governance tables were not installed';
  END IF;

  SELECT "definitionSnapshot" INTO v_definition
  FROM "AdipometryProtocol"
  WHERE code = 'GUEDES_1991_ADULT_YOUNG' AND version = 1 AND status = 'DRAFT';

  IF v_definition IS NULL OR NOT "isValidAdipometryContractProtocolDefinition"(v_definition) THEN
    RAISE EXCEPTION 'canonical Guedes candidate is absent or invalid';
  END IF;

  IF "isValidAdipometryContractProtocolDefinition"(
    JSONB_SET(
      v_definition,
      '{testVectors,0,expectedResults,bodyFatPercentage}',
      '99'::JSONB
    )
  ) THEN
    RAISE EXCEPTION 'forged clinical vector was accepted';
  END IF;

  IF "roundAdipometryValue"(18.245, 2, 'HALF_UP') <> 18.25 THEN
    RAISE EXCEPTION 'HALF_UP regression';
  END IF;

  FOR v_vector IN SELECT value FROM JSONB_ARRAY_ELEMENTS(v_definition -> 'testVectors') LOOP
    v_actual := "evaluateAdipometryContractProtocolVector"(v_definition, v_vector);
    v_expected := v_vector -> 'expectedResults';
    FOREACH v_field IN ARRAY ARRAY['skinfoldTotalMm','bodyFatPercentage','fatMassKg','leanMassKg'] LOOP
      v_scale := CASE WHEN v_field = 'skinfoldTotalMm' THEN 1 ELSE 2 END;
      IF "roundAdipometryValue"((v_actual ->> v_field)::NUMERIC, v_scale, 'HALF_UP')
         <> (v_expected ->> v_field)::NUMERIC THEN
        RAISE EXCEPTION 'canonical vector % diverged at %', v_vector ->> 'id', v_field;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AdipometryProtocolApproval'
      AND column_name = 'revokedAt'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AdipometryProtocolApproval'
      AND column_name = 'revocationReason'
  ) THEN
    RAISE EXCEPTION 'approval revocation audit columns are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'AdipometryClinicalResponsibility_active_key'
      AND indexdef LIKE '%WHERE ("effectiveTo" IS NULL)%'
  ) THEN
    RAISE EXCEPTION 'single active responsibility index is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'AdipometryProtocolApproval_contract_protocol_key'
      AND indexdef LIKE '%WHERE ("revokedAt" IS NULL)%'
  ) THEN
    RAISE EXCEPTION 'active-only approval uniqueness is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'AdipometryProtocolApproval_guard' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'approval lifecycle guard is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'AdipometryAssessment_active_approval_insert_guard' AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'AdipometryAssessment_active_approval_update_guard' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'active approval completion guards are missing';
  END IF;

  SELECT pg_get_functiondef(procedure.oid)
    INTO v_function_definition
  FROM pg_proc procedure
  WHERE procedure.proname = 'isEligibleAdipometryClinicalResponsible'
  ORDER BY procedure.oid DESC
  LIMIT 1;

  IF v_function_definition IS NULL
     OR v_function_definition NOT LIKE '%hasExplicitAdipometryClinicalPermission%'
     OR v_function_definition LIKE '%professor.role%' THEN
    RAISE EXCEPTION 'clinical eligibility still derives from a role instead of an explicit grant';
  END IF;

  SELECT pg_get_constraintdef(constraint_row.oid)
    INTO v_constraint_definition
  FROM pg_constraint constraint_row
  WHERE constraint_row.conname = 'AdipometryAssessment_correction_category_check';

  IF v_constraint_definition IS NULL
     OR v_constraint_definition NOT LIKE '%DATA_ENTRY_ERROR%'
     OR v_constraint_definition NOT LIKE '%MEASUREMENT_TRANSCRIPTION_ERROR%'
     OR v_constraint_definition NOT LIKE '%EVALUATION_DATE_ERROR%'
     OR v_constraint_definition NOT LIKE '%PROTOCOL_SEX_ERROR%'
     OR v_constraint_definition NOT LIKE '%PROTOCOL_SELECTION_ERROR%'
     OR v_constraint_definition LIKE '%MEASUREMENT_OR_TRANSCRIPTION_ERROR%'
     OR v_constraint_definition LIKE '%DEMOGRAPHIC_CONFIRMATION_ERROR%' THEN
    RAISE EXCEPTION 'database correction taxonomy diverges from the approved contract';
  END IF;
END;
$$;

ROLLBACK;
SQL
