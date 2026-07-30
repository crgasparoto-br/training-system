#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/training_system_test}"
DB_URL="${DB_URL%%\?*}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

psql_run() {
  docker run --rm --network host \
    -v "$TMP_DIR:/work" \
    -e PGPASSWORD=postgres \
    postgres:16-alpine \
    psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q "$@"
}

sql() {
  printf '%s\n' "$1" > "$TMP_DIR/command.sql"
  psql_run -f /work/command.sql
}

expect_failure() {
  local label="$1"
  local pattern="$2"
  local statement="$3"
  printf '%s\n' "$statement" > "$TMP_DIR/expected-failure.sql"
  if psql_run -f /work/expected-failure.sql >"$TMP_DIR/failure.out" 2>&1; then
    echo "Expected failure did not occur: $label" >&2
    cat "$TMP_DIR/failure.out" >&2
    exit 1
  fi
  if ! grep -q "$pattern" "$TMP_DIR/failure.out"; then
    echo "Failure did not contain expected evidence for: $label" >&2
    cat "$TMP_DIR/failure.out" >&2
    exit 1
  fi
  echo "negative-control OK: $label"
}

cat > "$TMP_DIR/setup.sql" <<'SQL'
DO $$
DECLARE
  contract_type TEXT;
  user_type TEXT;
BEGIN
  SELECT enumlabel INTO contract_type
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'ContractType'
  ORDER BY e.enumsortorder
  LIMIT 1;

  SELECT enumlabel INTO user_type
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'UserType'
  ORDER BY e.enumsortorder
  LIMIT 1;

  EXECUTE format(
    'INSERT INTO "Contract" ("id", "type", "document", "name", "createdAt", "updatedAt")
     VALUES (%L, %L::"ContractType", %L, %L, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    'issue246-audit-contract', contract_type, 'issue246-audit-document', 'Issue 246 audit remediation'
  );

  INSERT INTO "CollaboratorFunctionOption" (
    "id", "contractId", "name", "code", "isActive", "isSystem", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-audit-function', 'issue246-audit-contract', 'Issue 246 audit',
    'ISSUE246-AUDIT', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  EXECUTE format(
    'INSERT INTO "User" ("id", "email", "passwordHash", "type", "createdAt", "updatedAt", "isActive")
     VALUES (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true)',
    'issue246-audit-user', 'issue246-audit@example.invalid', 'not-a-password', user_type
  );

  INSERT INTO "Professor" (
    "id", "userId", "contractId", "collaboratorFunctionId", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-audit-professor', 'issue246-audit-user', 'issue246-audit-contract',
    'issue246-audit-function', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  INSERT INTO "Aluno" ("id", "contractId", "createdAt", "updatedAt")
  VALUES ('issue246-audit-aluno', 'issue246-audit-contract', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
END $$;

CREATE OR REPLACE FUNCTION issue246_audit_definition(
  p_approver TEXT,
  p_approved_at TEXT
) RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'population', jsonb_build_object(
      'ageMinYears', 18,
      'ageMaxYears', 65,
      'sexCriteria', jsonb_build_array('FEMALE', 'MALE'),
      'maturationCriteria', 'Not required for this structural verification definition'
    ),
    'requiredSkinfolds', jsonb_build_array(
      'tricepsMm', 'subscapularMm', 'suprailiacMm', 'abdominalMm', 'thighMm'
    ),
    'inputUnits', jsonb_build_object(
      'weightKg', 'kg',
      'tricepsMm', 'mm',
      'subscapularMm', 'mm',
      'suprailiacMm', 'mm',
      'abdominalMm', 'mm',
      'thighMm', 'mm'
    ),
    'outputUnits', jsonb_build_object(
      'skinfoldTotalMm', 'mm',
      'bodyFatPercentage', 'percent',
      'fatMassKg', 'kg',
      'leanMassKg', 'kg'
    ),
    'equations', jsonb_build_array(
      jsonb_build_object(
        'id', 'body-fat-structural',
        'output', 'bodyFatPercentage',
        'expression', 'approved clinical expression is stored verbatim',
        'variables', jsonb_build_array('ageAtAssessment', 'profileCriteria', 'skinfolds')
      ),
      jsonb_build_object(
        'id', 'fat-mass',
        'output', 'fatMassKg',
        'expression', 'weightKg * bodyFatPercentage / 100',
        'variables', jsonb_build_array('weightKg', 'bodyFatPercentage')
      ),
      jsonb_build_object(
        'id', 'lean-mass',
        'output', 'leanMassKg',
        'expression', 'weightKg - fatMassKg',
        'variables', jsonb_build_array('weightKg', 'fatMassKg')
      )
    ),
    'limits', jsonb_build_object(
      'blocking', jsonb_build_object(
        'weightKg', jsonb_build_object('min', 20, 'max', 350),
        'tricepsMm', jsonb_build_object('min', 1, 'max', 100),
        'subscapularMm', jsonb_build_object('min', 1, 'max', 100),
        'suprailiacMm', jsonb_build_object('min', 1, 'max', 100),
        'abdominalMm', jsonb_build_object('min', 1, 'max', 100),
        'thighMm', jsonb_build_object('min', 1, 'max', 100)
      ),
      'warnings', jsonb_build_array(
        jsonb_build_object('field', 'bodyFatPercentage', 'message', 'Review extreme result before conclusion')
      )
    ),
    'precision', jsonb_build_object(
      'measurementScale', 2,
      'resultScale', 4,
      'internalScale', 6
    ),
    'rounding', jsonb_build_object(
      'mode', 'HALF_UP',
      'stage', 'FINAL_RESULTS_ONLY'
    ),
    'missingDataBehavior', jsonb_build_object(
      'missingRequired', 'Block conclusion and return a structured incompatibility reason',
      'incompatibleProfile', 'Block conclusion without formula fallback'
    ),
    'testVectors', jsonb_build_array(
      jsonb_build_object(
        'id', 'vector-1',
        'inputs', jsonb_build_object(
          'ageAtAssessment', 30,
          'profileCriteria', jsonb_build_object('sex', 'FEMALE'),
          'measurements', jsonb_build_object(
            'weightKg', 70, 'tricepsMm', 10, 'subscapularMm', 10,
            'suprailiacMm', 10, 'abdominalMm', 10, 'thighMm', 10
          )
        ),
        'expectedResults', jsonb_build_object(
          'skinfoldTotalMm', 50, 'bodyFatPercentage', 20,
          'fatMassKg', 14, 'leanMassKg', 56
        ),
        'tolerance', jsonb_build_object(
          'skinfoldTotalMm', 0.0001, 'bodyFatPercentage', 0.0001,
          'fatMassKg', 0.0001, 'leanMassKg', 0.0001
        )
      ),
      jsonb_build_object(
        'id', 'vector-2',
        'inputs', jsonb_build_object(
          'ageAtAssessment', 40,
          'profileCriteria', jsonb_build_object('sex', 'MALE'),
          'measurements', jsonb_build_object(
            'weightKg', 80, 'tricepsMm', 12, 'subscapularMm', 11,
            'suprailiacMm', 9, 'abdominalMm', 13, 'thighMm', 10
          )
        ),
        'expectedResults', jsonb_build_object(
          'skinfoldTotalMm', 55, 'bodyFatPercentage', 25,
          'fatMassKg', 20, 'leanMassKg', 60
        ),
        'tolerance', jsonb_build_object(
          'skinfoldTotalMm', 0.0001, 'bodyFatPercentage', 0.0001,
          'fatMassKg', 0.0001, 'leanMassKg', 0.0001
        )
      )
    ),
    'clinicalApproval', jsonb_build_object(
      'status', 'approved',
      'approverUserId', p_approver,
      'approvedAt', p_approved_at,
      'approvalRecordId', 'issue246-structural-ci-approval',
      'artifactSha256', repeat('a', 64)
    )
  );
$$;

CREATE OR REPLACE FUNCTION issue246_audit_snapshot(
  p_protocol_code TEXT,
  p_protocol_version INTEGER,
  p_assessment_date DATE,
  p_weight NUMERIC,
  p_total NUMERIC,
  p_body_fat NUMERIC,
  p_fat_mass NUMERIC,
  p_lean_mass NUMERIC
) RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'protocol', jsonb_build_object('code', p_protocol_code, 'version', p_protocol_version),
    'assessmentDate', TO_CHAR(p_assessment_date, 'YYYY-MM-DD'),
    'ageAtAssessment', 30,
    'profileCriteria', jsonb_build_object('sex', 'FEMALE'),
    'inputs', jsonb_build_object(
      'weightKg', p_weight,
      'tricepsMm', 10,
      'subscapularMm', 10,
      'suprailiacMm', 10,
      'abdominalMm', 10,
      'thighMm', 10
    ),
    'rules', jsonb_build_object(
      'equations', jsonb_build_array('body-fat-structural', 'fat-mass', 'lean-mass'),
      'limits', jsonb_build_object('blocking', true),
      'precision', jsonb_build_object('internalScale', 6),
      'rounding', jsonb_build_object('mode', 'HALF_UP')
    ),
    'results', jsonb_build_object(
      'skinfoldTotalMm', p_total,
      'bodyFatPercentage', p_body_fat,
      'fatMassKg', p_fat_mass,
      'leanMassKg', p_lean_mass
    ),
    'implementationVersion', 'issue246-audit-remediation-v1',
    'calculatedAt', '2026-07-30T14:00:00.000Z'
  );
$$;
SQL
psql_run -f /work/setup.sql

expect_failure \
  "placeholder protocol cannot be approved" \
  "AdipometryProtocol_approval_check" \
  "INSERT INTO \"AdipometryProtocol\" (
     \"id\", \"code\", \"version\", \"name\", \"status\", \"definitionSnapshot\", \"reference\",
     \"approvedAt\", \"approvedByUserId\", \"createdAt\", \"updatedAt\"
   ) VALUES (
     'issue246-audit-placeholder', 'PLACEHOLDER', 1, 'Placeholder', 'APPROVED',
     '{\"population\":{\"fixture\":true},\"requiredSkinfolds\":[\"tricepsMm\"],\"inputUnits\":{},\"outputUnits\":{},\"equations\":[{\"id\":\"fixture\"}],\"limits\":{\"fixture\":true},\"precision\":{\"internal\":4},\"rounding\":{\"mode\":\"HALF_UP\"},\"missingDataBehavior\":\"fixture\",\"testVectors\":[{\"id\":\"fixture\"}]}'::jsonb,
     'Non-clinical placeholder', TIMESTAMP '2026-07-30 14:00:00', 'issue246-audit-user',
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
   );"

expect_failure \
  "single test vector is insufficient" \
  "AdipometryProtocol_approval_check" \
  "INSERT INTO \"AdipometryProtocol\" (
     \"id\", \"code\", \"version\", \"name\", \"status\", \"definitionSnapshot\", \"reference\",
     \"approvedAt\", \"approvedByUserId\", \"createdAt\", \"updatedAt\"
   ) VALUES (
     'issue246-audit-one-vector', 'ONE_VECTOR', 1, 'One vector', 'APPROVED',
     jsonb_set(issue246_audit_definition('issue246-audit-user', '2026-07-30T14:00:00+00:00'), '{testVectors}',
       jsonb_build_array((issue246_audit_definition('issue246-audit-user', '2026-07-30T14:00:00+00:00')->'testVectors')->0)),
     'Structural reference', TIMESTAMP '2026-07-30 14:00:00', 'issue246-audit-user',
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
   );"

sql "INSERT INTO \"AdipometryProtocol\" (
  \"id\", \"code\", \"version\", \"name\", \"status\", \"definitionSnapshot\", \"reference\",
  \"approvedAt\", \"approvedByUserId\", \"createdAt\", \"updatedAt\"
) VALUES (
  'issue246-audit-approved', 'ISSUE246_AUDIT', 1, 'Strict structural protocol', 'APPROVED',
  issue246_audit_definition('issue246-audit-user', '2026-07-30T14:00:00+00:00'),
  'Versioned structural reference for CI only', TIMESTAMP '2026-07-30 14:00:00',
  'issue246-audit-user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);"
echo "positive-control OK: strict approval contract accepted"

expect_failure \
  "approved definition mutation" \
  "only disabling is allowed" \
  "UPDATE \"AdipometryProtocol\" SET \"name\" = 'mutated', \"updatedAt\" = CURRENT_TIMESTAMP
   WHERE \"id\" = 'issue246-audit-approved';"

sql "SELECT * FROM \"createAdipometryDraft\"(
  'issue246-audit-completed', 'issue246-audit-contract', 'issue246-audit-aluno',
  'issue246-audit-professor', DATE '2026-07-30', CURRENT_TIMESTAMP
);
UPDATE \"AdipometryAssessment\"
SET
  \"status\" = 'COMPLETED',
  \"weightKg\" = 70,
  \"tricepsMm\" = 10,
  \"subscapularMm\" = 10,
  \"suprailiacMm\" = 10,
  \"abdominalMm\" = 10,
  \"thighMm\" = 10,
  \"skinfoldTotalMm\" = 50,
  \"bodyFatPercentage\" = 20,
  \"fatMassKg\" = 14,
  \"leanMassKg\" = 56,
  \"protocolId\" = 'issue246-audit-approved',
  \"protocolCode\" = 'ISSUE246_AUDIT',
  \"protocolVersion\" = 1,
  \"calculationSnapshot\" = issue246_audit_snapshot('ISSUE246_AUDIT', 1, DATE '2026-07-30', 70, 50, 20, 14, 56),
  \"completedAt\" = CURRENT_TIMESTAMP,
  \"updatedAt\" = CURRENT_TIMESTAMP
WHERE \"id\" = 'issue246-audit-completed';"
echo "positive-control OK: strict approved protocol supports completion"

sql "UPDATE \"AdipometryProtocol\"
SET \"status\" = 'DISABLED', \"updatedAt\" = CURRENT_TIMESTAMP
WHERE \"id\" = 'issue246-audit-approved';"
echo "positive-control OK: approved protocol can be disabled without definition mutation"

expect_failure \
  "disabled protocol reactivation" \
  "cannot be reactivated" \
  "UPDATE \"AdipometryProtocol\" SET \"status\" = 'APPROVED', \"updatedAt\" = CURRENT_TIMESTAMP
   WHERE \"id\" = 'issue246-audit-approved';"

expect_failure \
  "disabled protocol deletion" \
  "cannot be deleted" \
  "DELETE FROM \"AdipometryProtocol\" WHERE \"id\" = 'issue246-audit-approved';"

sql "SELECT * FROM \"createAdipometryDraft\"(
  'issue246-audit-disabled-draft', 'issue246-audit-contract', 'issue246-audit-aluno',
  'issue246-audit-professor', DATE '2026-07-31', CURRENT_TIMESTAMP
);"

expect_failure \
  "disabled protocol cannot finalize a new assessment" \
  "ADIPOMETRY_PROTOCOL_NOT_APPROVED" \
  "UPDATE \"AdipometryAssessment\"
   SET
     \"status\" = 'COMPLETED', \"weightKg\" = 70,
     \"tricepsMm\" = 10, \"subscapularMm\" = 10, \"suprailiacMm\" = 10,
     \"abdominalMm\" = 10, \"thighMm\" = 10, \"skinfoldTotalMm\" = 50,
     \"bodyFatPercentage\" = 20, \"fatMassKg\" = 14, \"leanMassKg\" = 56,
     \"protocolId\" = 'issue246-audit-approved', \"protocolCode\" = 'ISSUE246_AUDIT', \"protocolVersion\" = 1,
     \"calculationSnapshot\" = issue246_audit_snapshot('ISSUE246_AUDIT', 1, DATE '2026-07-31', 70, 50, 20, 14, 56),
     \"completedAt\" = CURRENT_TIMESTAMP, \"updatedAt\" = CURRENT_TIMESTAMP
   WHERE \"id\" = 'issue246-audit-disabled-draft';"

sql "SELECT * FROM \"createAdipometryDraft\"(
  'issue246-audit-link-draft', 'issue246-audit-contract', 'issue246-audit-aluno',
  'issue246-audit-professor', DATE '2026-08-01', CURRENT_TIMESTAMP
);"

expect_failure \
  "draft cannot receive a forged correctedBy link" \
  "ADIPOMETRY_CORRECTION_LINK_IS_MANAGED" \
  "UPDATE \"AdipometryAssessment\"
   SET \"correctedByAssessmentId\" = 'issue246-audit-completed', \"updatedAt\" = CURRENT_TIMESTAMP
   WHERE \"id\" = 'issue246-audit-link-draft';"

sql "DO \$\$ BEGIN
  IF (SELECT \"correctedByAssessmentId\" FROM \"AdipometryAssessment\"
      WHERE \"id\" = 'issue246-audit-link-draft') IS NOT NULL THEN
    RAISE EXCEPTION 'forged correction link persisted';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM \"AdipometryAssessment\"
    WHERE \"id\" = 'issue246-audit-completed'
      AND \"status\" = 'COMPLETED'
      AND \"protocolVersion\" = 1
  ) THEN
    RAISE EXCEPTION 'historical completed assessment was not preserved after disabling';
  END IF;
END \$\$;"
echo "positive-control OK: rejected writes have no effect and history is preserved"
