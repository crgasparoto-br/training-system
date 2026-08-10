#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/training_system_test}"
DB_URL="${DB_URL%%\?*}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cat > "$TMP_DIR/verify.sql" <<'SQL'
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.issue246_final_definition()
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
AS $definition$
  SELECT $json$
  {
    "schemaVersion": 2,
    "population": {
      "ageMinYears": 18,
      "ageMaxYears": 65,
      "sexCriteria": ["FEMALE", "MALE"],
      "maturationCriteria": "Not required for structural verification"
    },
    "requiredSkinfolds": ["tricepsMm", "subscapularMm", "suprailiacMm", "abdominalMm", "thighMm"],
    "inputUnits": {
      "weightKg": "kg", "tricepsMm": "mm", "subscapularMm": "mm",
      "suprailiacMm": "mm", "abdominalMm": "mm", "thighMm": "mm"
    },
    "outputUnits": {
      "skinfoldTotalMm": "mm", "bodyFatPercentage": "percent",
      "fatMassKg": "kg", "leanMassKg": "kg"
    },
    "equations": [
      {
        "id": "body-fat-executable",
        "output": "bodyFatPercentage",
        "expression": {
          "op": "add",
          "args": [
            {"op": "constant", "value": 10},
            {"op": "multiply", "args": [
              {"op": "variable", "name": "skinfoldTotalMm"},
              {"op": "constant", "value": 0.2}
            ]}
          ]
        }
      },
      {
        "id": "fat-mass-executable",
        "output": "fatMassKg",
        "expression": {
          "op": "divide",
          "numerator": {"op": "multiply", "args": [
            {"op": "variable", "name": "weightKg"},
            {"op": "variable", "name": "bodyFatPercentage"}
          ]},
          "denominator": {"op": "constant", "value": 100}
        }
      },
      {
        "id": "lean-mass-executable",
        "output": "leanMassKg",
        "expression": {
          "op": "subtract",
          "left": {"op": "variable", "name": "weightKg"},
          "right": {"op": "variable", "name": "fatMassKg"}
        }
      }
    ],
    "limits": {
      "blocking": {
        "weightKg": {"min": 20, "max": 350},
        "tricepsMm": {"min": 1, "max": 100},
        "subscapularMm": {"min": 1, "max": 100},
        "suprailiacMm": {"min": 1, "max": 100},
        "abdominalMm": {"min": 1, "max": 100},
        "thighMm": {"min": 1, "max": 100}
      },
      "warnings": [{"field": "bodyFatPercentage", "message": "Review extreme result"}]
    },
    "precision": {"measurementScale": 2, "resultScale": 4, "internalScale": 6},
    "rounding": {"mode": "HALF_UP", "stage": "FINAL_RESULTS_ONLY"},
    "missingDataBehavior": {
      "missingRequired": "Block conclusion and return a structured reason",
      "incompatibleProfile": "Block conclusion without fallback"
    },
    "testVectors": [
      {
        "id": "vector-1",
        "inputs": {
          "ageAtAssessment": 30,
          "profileCriteria": {"sex": "FEMALE"},
          "measurements": {
            "weightKg": 70, "tricepsMm": 10, "subscapularMm": 10,
            "suprailiacMm": 10, "abdominalMm": 10, "thighMm": 10
          }
        },
        "expectedResults": {
          "skinfoldTotalMm": 50, "bodyFatPercentage": 20,
          "fatMassKg": 14, "leanMassKg": 56
        },
        "tolerance": {
          "skinfoldTotalMm": 0.0001, "bodyFatPercentage": 0.0001,
          "fatMassKg": 0.0001, "leanMassKg": 0.0001
        }
      },
      {
        "id": "vector-2",
        "inputs": {
          "ageAtAssessment": 40,
          "profileCriteria": {"sex": "MALE"},
          "measurements": {
            "weightKg": 80, "tricepsMm": 12, "subscapularMm": 11,
            "suprailiacMm": 9, "abdominalMm": 13, "thighMm": 10
          }
        },
        "expectedResults": {
          "skinfoldTotalMm": 55, "bodyFatPercentage": 21,
          "fatMassKg": 16.8, "leanMassKg": 63.2
        },
        "tolerance": {
          "skinfoldTotalMm": 0.0001, "bodyFatPercentage": 0.0001,
          "fatMassKg": 0.0001, "leanMassKg": 0.0001
        }
      }
    ],
    "clinicalApproval": {
      "status": "approved",
      "approverUserId": "issue246-validator-actor",
      "approvedAt": "2026-07-30T14:00:00Z",
      "approvalRecordId": "issue246-validator-record",
      "artifactSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
  }
  $json$::JSONB;
$definition$;

DO $$
DECLARE
  definition JSONB := pg_temp.issue246_final_definition();
  invalid JSONB;
BEGIN
  IF NOT "isValidAdipometryProtocolDefinition"(
    definition,
    'issue246-validator-actor',
    TIMESTAMP '2026-07-30 14:00:00'
  ) THEN
    RAISE EXCEPTION 'positive-control failed: executable definition was rejected';
  END IF;

  invalid := JSONB_SET(
    definition,
    '{equations,0,expression}',
    JSONB_BUILD_OBJECT(
      'op', 'ifEquals',
      'field', 'profileCriteria.sex',
      'expected', 'OTHER',
      'then', JSONB_BUILD_OBJECT('op', 'unsupported'),
      'else', definition #> '{equations,0,expression}'
    )
  );
  IF "isValidAdipometryProtocolDefinition"(invalid, 'issue246-validator-actor', TIMESTAMP '2026-07-30 14:00:00') THEN
    RAISE EXCEPTION 'negative-control failed: unselected invalid branch was accepted';
  END IF;

  invalid := JSONB_SET(definition, '{testVectors,0,inputs,ageAtAssessment}', '17'::JSONB);
  IF "isValidAdipometryProtocolDefinition"(invalid, 'issue246-validator-actor', TIMESTAMP '2026-07-30 14:00:00') THEN
    RAISE EXCEPTION 'negative-control failed: age outside population was accepted';
  END IF;

  invalid := JSONB_SET(definition, '{testVectors,0,inputs,profileCriteria,sex}', '"OTHER"'::JSONB);
  IF "isValidAdipometryProtocolDefinition"(invalid, 'issue246-validator-actor', TIMESTAMP '2026-07-30 14:00:00') THEN
    RAISE EXCEPTION 'negative-control failed: sex outside population was accepted';
  END IF;

  invalid := JSONB_SET(definition, '{testVectors,0,inputs,measurements,tricepsMm}', '101'::JSONB);
  IF "isValidAdipometryProtocolDefinition"(invalid, 'issue246-validator-actor', TIMESTAMP '2026-07-30 14:00:00') THEN
    RAISE EXCEPTION 'negative-control failed: measurement outside blocking limit was accepted';
  END IF;

  invalid := JSONB_SET(definition, '{testVectors,0,tolerance,bodyFatPercentage}', '100'::JSONB);
  IF "isValidAdipometryProtocolDefinition"(invalid, 'issue246-validator-actor', TIMESTAMP '2026-07-30 14:00:00') THEN
    RAISE EXCEPTION 'negative-control failed: non-discriminating tolerance was accepted';
  END IF;

  invalid := JSONB_SET(definition, '{equations,0,expression}', TO_JSONB('plain text formula'::TEXT));
  IF "isValidAdipometryProtocolDefinition"(invalid, 'issue246-validator-actor', TIMESTAMP '2026-07-30 14:00:00') THEN
    RAISE EXCEPTION 'negative-control failed: text equation was accepted';
  END IF;
END $$;

ROLLBACK;
SQL

docker run --rm --network host \
  -v "$TMP_DIR:/work" \
  -e PGPASSWORD=postgres \
  postgres:16-alpine \
  psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q -f /work/verify.sql

echo "adipometry protocol validator adversarial controls OK"
