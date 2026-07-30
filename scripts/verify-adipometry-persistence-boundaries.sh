#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/training_system_test}"
DB_URL="${DB_URL%%\?*}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cat > "$TMP_DIR/verify.sql" <<'SQL'
BEGIN;

DO $$
DECLARE
  contract_type TEXT;
  user_type TEXT;
BEGIN
  SELECT enumlabel INTO contract_type
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'ContractType'
  ORDER BY e.enumsortorder LIMIT 1;

  SELECT enumlabel INTO user_type
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'UserType'
  ORDER BY e.enumsortorder LIMIT 1;

  EXECUTE format(
    'INSERT INTO "Contract" ("id", "type", "document", "name", "createdAt", "updatedAt") VALUES
      (%L, %L::"ContractType", %L, %L, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      (%L, %L::"ContractType", %L, %L, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    'issue246-boundary-contract-a', contract_type, 'issue246-boundary-doc-a', 'Issue 246 boundary A',
    'issue246-boundary-contract-b', contract_type, 'issue246-boundary-doc-b', 'Issue 246 boundary B'
  );

  INSERT INTO "CollaboratorFunctionOption" (
    "id", "contractId", "name", "code", "isActive", "isSystem", "createdAt", "updatedAt"
  ) VALUES
    ('issue246-boundary-function-a', 'issue246-boundary-contract-a', 'Boundary A', 'ISSUE246-BOUNDARY-A', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-boundary-function-b', 'issue246-boundary-contract-b', 'Boundary B', 'ISSUE246-BOUNDARY-B', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  EXECUTE format(
    'INSERT INTO "User" ("id", "email", "passwordHash", "type", "createdAt", "updatedAt", "isActive") VALUES
      (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true),
      (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true)',
    'issue246-boundary-actor-a', 'issue246-boundary-a@example.invalid', 'not-a-password', user_type,
    'issue246-boundary-actor-b', 'issue246-boundary-b@example.invalid', 'not-a-password', user_type
  );

  INSERT INTO "Professor" (
    "id", "userId", "contractId", "collaboratorFunctionId", "createdAt", "updatedAt"
  ) VALUES
    ('issue246-boundary-professor-a', 'issue246-boundary-actor-a', 'issue246-boundary-contract-a', 'issue246-boundary-function-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-boundary-professor-b', 'issue246-boundary-actor-b', 'issue246-boundary-contract-b', 'issue246-boundary-function-b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  INSERT INTO "Aluno" ("id", "contractId", "createdAt", "updatedAt") VALUES
    ('issue246-boundary-aluno-a1', 'issue246-boundary-contract-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-boundary-aluno-a2', 'issue246-boundary-contract-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-boundary-aluno-b1', 'issue246-boundary-contract-b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.issue246_boundary_definition()
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
AS $definition$
  SELECT JSONB_BUILD_OBJECT(
    'schemaVersion', 2,
    'population', JSONB_BUILD_OBJECT(
      'ageMinYears', 18,
      'ageMaxYears', 65,
      'sexCriteria', JSONB_BUILD_ARRAY('FEMALE', 'MALE'),
      'maturationCriteria', 'Not required for this structural fixture'
    ),
    'requiredSkinfolds', JSONB_BUILD_ARRAY(
      'tricepsMm', 'subscapularMm', 'suprailiacMm', 'abdominalMm', 'thighMm'
    ),
    'inputUnits', JSONB_BUILD_OBJECT(
      'weightKg', 'kg', 'tricepsMm', 'mm', 'subscapularMm', 'mm',
      'suprailiacMm', 'mm', 'abdominalMm', 'mm', 'thighMm', 'mm'
    ),
    'outputUnits', JSONB_BUILD_OBJECT(
      'skinfoldTotalMm', 'mm', 'bodyFatPercentage', 'percent',
      'fatMassKg', 'kg', 'leanMassKg', 'kg'
    ),
    'equations', JSONB_BUILD_ARRAY(
      JSONB_BUILD_OBJECT(
        'id', 'body-fat', 'output', 'bodyFatPercentage',
        'expression', JSONB_BUILD_OBJECT(
          'op', 'add', 'args', JSONB_BUILD_ARRAY(
            JSONB_BUILD_OBJECT('op', 'constant', 'value', 10),
            JSONB_BUILD_OBJECT(
              'op', 'multiply', 'args', JSONB_BUILD_ARRAY(
                JSONB_BUILD_OBJECT('op', 'variable', 'name', 'skinfoldTotalMm'),
                JSONB_BUILD_OBJECT('op', 'constant', 'value', 0.2)
              )
            )
          )
        )
      ),
      JSONB_BUILD_OBJECT(
        'id', 'fat-mass', 'output', 'fatMassKg',
        'expression', JSONB_BUILD_OBJECT(
          'op', 'divide',
          'numerator', JSONB_BUILD_OBJECT(
            'op', 'multiply', 'args', JSONB_BUILD_ARRAY(
              JSONB_BUILD_OBJECT('op', 'variable', 'name', 'weightKg'),
              JSONB_BUILD_OBJECT('op', 'variable', 'name', 'bodyFatPercentage')
            )
          ),
          'denominator', JSONB_BUILD_OBJECT('op', 'constant', 'value', 100)
        )
      ),
      JSONB_BUILD_OBJECT(
        'id', 'lean-mass', 'output', 'leanMassKg',
        'expression', JSONB_BUILD_OBJECT(
          'op', 'subtract',
          'left', JSONB_BUILD_OBJECT('op', 'variable', 'name', 'weightKg'),
          'right', JSONB_BUILD_OBJECT('op', 'variable', 'name', 'fatMassKg')
        )
      )
    ),
    'limits', JSONB_BUILD_OBJECT(
      'blocking', JSONB_BUILD_OBJECT(
        'weightKg', JSONB_BUILD_OBJECT('min', 20, 'max', 350),
        'tricepsMm', JSONB_BUILD_OBJECT('min', 1, 'max', 100),
        'subscapularMm', JSONB_BUILD_OBJECT('min', 1, 'max', 100),
        'suprailiacMm', JSONB_BUILD_OBJECT('min', 1, 'max', 100),
        'abdominalMm', JSONB_BUILD_OBJECT('min', 1, 'max', 100),
        'thighMm', JSONB_BUILD_OBJECT('min', 1, 'max', 100)
      ),
      'warnings', JSONB_BUILD_ARRAY()
    ),
    'precision', JSONB_BUILD_OBJECT('measurementScale', 2, 'resultScale', 4, 'internalScale', 6),
    'rounding', JSONB_BUILD_OBJECT('mode', 'HALF_UP', 'stage', 'FINAL_RESULTS_ONLY'),
    'missingDataBehavior', JSONB_BUILD_OBJECT(
      'missingRequired', 'Block conclusion',
      'incompatibleProfile', 'Block conclusion'
    ),
    'testVectors', JSONB_BUILD_ARRAY(
      JSONB_BUILD_OBJECT(
        'id', 'vector-a',
        'inputs', JSONB_BUILD_OBJECT(
          'ageAtAssessment', 30,
          'profileCriteria', JSONB_BUILD_OBJECT('sex', 'FEMALE'),
          'measurements', JSONB_BUILD_OBJECT(
            'weightKg', 70, 'tricepsMm', 10, 'subscapularMm', 10,
            'suprailiacMm', 10, 'abdominalMm', 10, 'thighMm', 10
          )
        ),
        'expectedResults', JSONB_BUILD_OBJECT(
          'skinfoldTotalMm', 50, 'bodyFatPercentage', 20,
          'fatMassKg', 14, 'leanMassKg', 56
        ),
        'tolerance', JSONB_BUILD_OBJECT(
          'skinfoldTotalMm', 0.0001, 'bodyFatPercentage', 0.0001,
          'fatMassKg', 0.0001, 'leanMassKg', 0.0001
        )
      ),
      JSONB_BUILD_OBJECT(
        'id', 'vector-b',
        'inputs', JSONB_BUILD_OBJECT(
          'ageAtAssessment', 40,
          'profileCriteria', JSONB_BUILD_OBJECT('sex', 'MALE'),
          'measurements', JSONB_BUILD_OBJECT(
            'weightKg', 80, 'tricepsMm', 12, 'subscapularMm', 11,
            'suprailiacMm', 9, 'abdominalMm', 13, 'thighMm', 10
          )
        ),
        'expectedResults', JSONB_BUILD_OBJECT(
          'skinfoldTotalMm', 55, 'bodyFatPercentage', 21,
          'fatMassKg', 16.8, 'leanMassKg', 63.2
        ),
        'tolerance', JSONB_BUILD_OBJECT(
          'skinfoldTotalMm', 0.0001, 'bodyFatPercentage', 0.0001,
          'fatMassKg', 0.0001, 'leanMassKg', 0.0001
        )
      )
    ),
    'clinicalApproval', JSONB_BUILD_OBJECT(
      'status', 'approved',
      'approverUserId', 'issue246-boundary-actor-a',
      'approvedAt', '2026-07-30T14:00:00Z',
      'approvalRecordId', 'issue246-boundary-record',
      'artifactSha256', REPEAT('c', 64)
    )
  );
$definition$;

INSERT INTO "AdipometryProtocol" (
  "id", "code", "version", "name", "status", "definitionSnapshot", "reference",
  "approvedAt", "approvedByUserId", "createdAt", "updatedAt"
) VALUES (
  'issue246-boundary-protocol', 'BOUNDARY_EXECUTABLE', 1, 'Boundary executable', 'APPROVED',
  pg_temp.issue246_boundary_definition(), 'Structural boundary reference',
  TIMESTAMP '2026-07-30 14:00:00', 'issue246-boundary-actor-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- Direct assessment INSERT cannot choose the sequence or code.
SELECT SET_CONFIG('app.adipometry_actor_user_id', 'issue246-boundary-actor-a', true);
INSERT INTO "AdipometryAssessment" (
  "id", "contractId", "alunoId", "professorId", "sequenceNumber", "code",
  "assessmentDate", "status", "createdAt", "updatedAt"
) VALUES (
  'issue246-boundary-direct-a1', 'issue246-boundary-contract-a', 'issue246-boundary-aluno-a1',
  'issue246-boundary-professor-a', 500, 'ADPT-500', DATE '2026-07-30', 'DRAFT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryAssessment"
    WHERE "id" = 'issue246-boundary-direct-a1'
      AND "sequenceNumber" = 1
      AND "code" = 'ADPT-001'
  ) THEN
    RAISE EXCEPTION 'direct insert bypassed the sequence allocator';
  END IF;
END $$;

SELECT * FROM "createAdipometryDraft"(
  'issue246-boundary-function-a1', 'issue246-boundary-contract-a', 'issue246-boundary-aluno-a1',
  'issue246-boundary-professor-a', DATE '2026-07-30', 'issue246-boundary-actor-a', CURRENT_TIMESTAMP
);
SELECT * FROM "createAdipometryDraft"(
  'issue246-boundary-a2', 'issue246-boundary-contract-a', 'issue246-boundary-aluno-a2',
  'issue246-boundary-professor-a', DATE '2026-07-30', 'issue246-boundary-actor-a', CURRENT_TIMESTAMP
);
SELECT * FROM "createAdipometryDraft"(
  'issue246-boundary-b1', 'issue246-boundary-contract-b', 'issue246-boundary-aluno-b1',
  'issue246-boundary-professor-b', DATE '2026-07-30', 'issue246-boundary-actor-b', CURRENT_TIMESTAMP
);

DO $$ BEGIN
  IF (SELECT "code" FROM "AdipometryAssessment" WHERE "id" = 'issue246-boundary-function-a1') <> 'ADPT-002'
     OR (SELECT "code" FROM "AdipometryAssessment" WHERE "id" = 'issue246-boundary-a2') <> 'ADPT-001'
     OR (SELECT "code" FROM "AdipometryAssessment" WHERE "id" = 'issue246-boundary-b1') <> 'ADPT-001' THEN
    RAISE EXCEPTION 'contract/student sequence independence failed';
  END IF;
END $$;

SELECT SET_CONFIG('app.adipometry_actor_user_id', 'issue246-boundary-actor-a', true);

-- Missing canonical birth date is rejected even when a caller supplies profile data.
DO $$ BEGIN
  BEGIN
    UPDATE "AdipometryAssessment"
    SET "status" = 'COMPLETED', "weightKg" = 70,
        "tricepsMm" = 10, "subscapularMm" = 10, "suprailiacMm" = 10,
        "abdominalMm" = 10, "thighMm" = 10,
        "skinfoldTotalMm" = 99, "bodyFatPercentage" = 99, "fatMassKg" = 1, "leanMassKg" = 69,
        "protocolId" = 'issue246-boundary-protocol', "protocolCode" = 'BOUNDARY_EXECUTABLE', "protocolVersion" = 1,
        "calculationSnapshot" = JSONB_BUILD_OBJECT(
          'ageAtAssessment', 30,
          'profileCriteria', JSONB_BUILD_OBJECT('sex', 'FEMALE')
        ),
        "completedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = 'issue246-boundary-direct-a1';
    RAISE EXCEPTION 'missing canonical profile was accepted';
  EXCEPTION WHEN CHECK_VIOLATION THEN
    IF SQLERRM NOT LIKE '%ADIPOMETRY_BIRTH_DATE_REQUIRED%' THEN RAISE; END IF;
  END;
END $$;

-- Add canonical demographics only after proving that caller-provided values do not bypass them.
INSERT INTO "StudentProfile" (
  "id", "alunoId", "contractId", "identificationData", "createdAt", "updatedAt"
) VALUES (
  'issue246-boundary-profile-a1', 'issue246-boundary-aluno-a1', 'issue246-boundary-contract-a',
  '{"birthDate":"1996-07-30","gender":"female"}'::jsonb,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- Out-of-range input is rejected against the approved protocol limits.
DO $$ BEGIN
  BEGIN
    UPDATE "AdipometryAssessment"
    SET "status" = 'COMPLETED', "weightKg" = 70,
        "tricepsMm" = 101, "subscapularMm" = 10, "suprailiacMm" = 10,
        "abdominalMm" = 10, "thighMm" = 10,
        "skinfoldTotalMm" = 141, "bodyFatPercentage" = 38.2, "fatMassKg" = 26.74, "leanMassKg" = 43.26,
        "protocolId" = 'issue246-boundary-protocol', "protocolCode" = 'BOUNDARY_EXECUTABLE', "protocolVersion" = 1,
        "calculationSnapshot" = JSONB_BUILD_OBJECT(
          'ageAtAssessment', 45, 'profileCriteria', JSONB_BUILD_OBJECT('sex', 'MALE')
        ),
        "completedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = 'issue246-boundary-direct-a1';
    RAISE EXCEPTION 'out-of-range input was accepted';
  EXCEPTION WHEN CHECK_VIOLATION THEN
    IF SQLERRM NOT LIKE '%ADIPOMETRY_MEASUREMENT_OUT_OF_RANGE%' THEN RAISE; END IF;
  END;
END $$;

-- Caller-supplied derived values, rules and demographics are discarded.
UPDATE "AdipometryAssessment"
SET "status" = 'COMPLETED', "weightKg" = 70,
    "tricepsMm" = 10, "subscapularMm" = 10, "suprailiacMm" = 10,
    "abdominalMm" = 10, "thighMm" = 10,
    "skinfoldTotalMm" = 999, "bodyFatPercentage" = 99, "fatMassKg" = 1, "leanMassKg" = 69,
    "protocolId" = 'issue246-boundary-protocol', "protocolCode" = 'BOUNDARY_EXECUTABLE', "protocolVersion" = 1,
    "calculationSnapshot" = JSONB_BUILD_OBJECT(
      'ageAtAssessment', 45,
      'profileCriteria', JSONB_BUILD_OBJECT('sex', 'MALE'),
      'rules', JSONB_BUILD_OBJECT('forged', true),
      'results', JSONB_BUILD_OBJECT('bodyFatPercentage', 99)
    ),
    "completedAt" = TIMESTAMP '2099-01-01 00:00:00', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'issue246-boundary-direct-a1';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryAssessment"
    WHERE "id" = 'issue246-boundary-direct-a1'
      AND "skinfoldTotalMm" = 50
      AND "bodyFatPercentage" = 20
      AND "fatMassKg" = 14
      AND "leanMassKg" = 56
      AND ("calculationSnapshot" #>> '{results,bodyFatPercentage}')::NUMERIC = 20
      AND ("calculationSnapshot" ->> 'ageAtAssessment')::INTEGER = 30
      AND "calculationSnapshot" #>> '{profileCriteria,sex}' = 'FEMALE'
      AND "calculationSnapshot" #>> '{profileCriteria,sources,birthDate,kind}' = 'STUDENT_PROFILE'
      AND "calculationSnapshot" #>> '{profileCriteria,sources,sex,kind}' = 'STUDENT_PROFILE'
      AND JSONB_TYPEOF("calculationSnapshot" #> '{rules,equations}') = 'array'
      AND NOT ("calculationSnapshot" -> 'rules' ? 'forged')
      AND "calculationSnapshot" ->> 'implementationVersion' = 'db-adipometry-protocol-v2'
  ) THEN
    RAISE EXCEPTION 'derived values, demographics or snapshot rules remained caller-authoritative';
  END IF;
END $$;

-- The application role may have INSERT granted accidentally; the guard still rejects forged audit rows.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'issue246_boundary_app') THEN
    CREATE ROLE issue246_boundary_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO issue246_boundary_app;
GRANT INSERT ON "AdipometryAuditEvent" TO issue246_boundary_app;
SET ROLE issue246_boundary_app;
DO $$ BEGIN
  BEGIN
    INSERT INTO "AdipometryAuditEvent" (
      "id", "contractId", "assessmentId", "actorUserId", "action",
      "beforeSnapshot", "afterSnapshot", "createdAt"
    ) VALUES (
      'issue246-boundary-forged-audit', 'issue246-boundary-contract-a',
      'issue246-boundary-direct-a1', 'issue246-boundary-actor-a', 'COMPLETED',
      NULL, JSONB_BUILD_OBJECT('status', 'COMPLETED'), CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'forged audit event was accepted';
  EXCEPTION WHEN INSUFFICIENT_PRIVILEGE THEN
    IF SQLERRM NOT LIKE '%ADIPOMETRY_AUDIT_INSERT_FORBIDDEN%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

-- Automatically generated events remain valid and append-only.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryAuditEvent"
    WHERE "assessmentId" = 'issue246-boundary-direct-a1'
      AND "action" = 'COMPLETED'
      AND "actorUserId" = 'issue246-boundary-actor-a'
      AND ("afterSnapshot" #>> '{bodyFatPercentage}')::NUMERIC = 20
  ) THEN
    RAISE EXCEPTION 'canonical completion audit event is missing';
  END IF;
END $$;

ROLLBACK;
SQL

docker run --rm --network host \
  -v "$TMP_DIR:/work" \
  postgres:16-alpine \
  psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q -f /work/verify.sql

echo "adipometry persistence boundary controls OK"
