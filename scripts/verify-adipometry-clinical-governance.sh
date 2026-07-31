#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

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
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'AdipometryClinicalResponsibility_active_key'
      AND indexdef LIKE '%WHERE ("effectiveTo" IS NULL)%'
  ) THEN
    RAISE EXCEPTION 'single active responsibility index is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'AdipometryProtocolApproval_guard' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'immutable approval guard is missing';
  END IF;
END;
$$;

ROLLBACK;
SQL
