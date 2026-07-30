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
  local statement="$1"
  printf '%s\n' "$statement" > "$TMP_DIR/command.sql"
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
    'INSERT INTO "Contract" ("id", "type", "document", "name", "createdAt", "updatedAt") VALUES
      (%L, %L::"ContractType", %L, %L, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      (%L, %L::"ContractType", %L, %L, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    'issue246-contract-a', contract_type, 'issue246-doc-a', 'Issue 246 A',
    'issue246-contract-b', contract_type, 'issue246-doc-b', 'Issue 246 B'
  );

  INSERT INTO "CollaboratorFunctionOption" (
    "id", "contractId", "name", "code", "isActive", "isSystem", "createdAt", "updatedAt"
  ) VALUES
    ('issue246-function-a', 'issue246-contract-a', 'Issue 246 A', 'ISSUE246-A', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-function-b', 'issue246-contract-b', 'Issue 246 B', 'ISSUE246-B', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  EXECUTE format(
    'INSERT INTO "User" ("id", "email", "passwordHash", "type", "createdAt", "updatedAt", "isActive") VALUES
      (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true),
      (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true)',
    'issue246-user-a', 'issue246-a@example.invalid', 'not-a-password', user_type,
    'issue246-user-b', 'issue246-b@example.invalid', 'not-a-password', user_type
  );

  INSERT INTO "Professor" (
    "id", "userId", "contractId", "collaboratorFunctionId", "createdAt", "updatedAt"
  ) VALUES
    ('issue246-professor-a', 'issue246-user-a', 'issue246-contract-a', 'issue246-function-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-professor-b', 'issue246-user-b', 'issue246-contract-b', 'issue246-function-b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  INSERT INTO "Aluno" ("id", "contractId", "createdAt", "updatedAt") VALUES
    ('issue246-aluno-a1', 'issue246-contract-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-aluno-a2', 'issue246-contract-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-aluno-overflow', 'issue246-contract-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-aluno-b1', 'issue246-contract-b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  INSERT INTO "AnthropometryAssessment" (
    "id", "contractId", "alunoId", "professorId", "code", "assessmentDate", "createdAt", "updatedAt"
  ) VALUES
    ('issue246-anthro-a1', 'issue246-contract-a', 'issue246-aluno-a1', 'issue246-professor-a', 'ANT-ISSUE246-A1', DATE '2026-07-20', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-anthro-b1', 'issue246-contract-b', 'issue246-aluno-b1', 'issue246-professor-b', 'ANT-ISSUE246-B1', DATE '2026-07-20', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
END $$;

INSERT INTO "AdipometryProtocol" (
  "id", "code", "version", "name", "status", "definitionSnapshot", "reference",
  "approvedAt", "approvedByUserId", "createdAt", "updatedAt"
) VALUES (
  'issue246-protocol-approved',
  'ISSUE246_TEST',
  1,
  'Protocol only for structural verification',
  'APPROVED',
  '{
    "population":{"fixture":true},
    "requiredSkinfolds":["tricepsMm","subscapularMm","suprailiacMm","abdominalMm","thighMm"],
    "inputUnits":{"weightKg":"kg","skinfolds":"mm"},
    "outputUnits":{"bodyFatPercentage":"percent","mass":"kg"},
    "equations":[{"id":"fixture"}],
    "limits":{"fixture":true},
    "precision":{"internal":4},
    "rounding":{"mode":"HALF_UP"},
    "missingDataBehavior":"Block incomplete fixture data",
    "testVectors":[{"id":"fixture-vector"}]
  }'::jsonb,
  'Non-clinical CI fixture',
  CURRENT_TIMESTAMP,
  'issue246-user-a',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION issue246_snapshot(
  p_protocol_code TEXT,
  p_protocol_version INTEGER,
  p_assessment_date DATE,
  p_weight NUMERIC,
  p_triceps NUMERIC,
  p_subscapular NUMERIC,
  p_suprailiac NUMERIC,
  p_abdominal NUMERIC,
  p_thigh NUMERIC,
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
    'profileCriteria', jsonb_build_object('fixture', true),
    'inputs', jsonb_build_object(
      'weightKg', p_weight,
      'tricepsMm', p_triceps,
      'subscapularMm', p_subscapular,
      'suprailiacMm', p_suprailiac,
      'abdominalMm', p_abdominal,
      'thighMm', p_thigh
    ),
    'rules', jsonb_build_object(
      'equations', jsonb_build_array('fixture'),
      'limits', jsonb_build_object('fixture', true),
      'precision', jsonb_build_object('internal', 4),
      'rounding', jsonb_build_object('mode', 'HALF_UP')
    ),
    'results', jsonb_build_object(
      'skinfoldTotalMm', p_total,
      'bodyFatPercentage', p_body_fat,
      'fatMassKg', p_fat_mass,
      'leanMassKg', p_lean_mass
    ),
    'implementationVersion', 'issue246-ci-v1',
    'calculatedAt', '2026-07-30T13:00:00.000Z'
  );
$$;
SQL
psql_run -f /work/setup.sql

echo "positive-control OK: complete approved protocol accepted"

expect_failure \
  "approved protocol missing clinical metadata" \
  "AdipometryProtocol_approval_check" \
  "INSERT INTO \"AdipometryProtocol\" (
     \"id\", \"code\", \"version\", \"name\", \"status\", \"definitionSnapshot\", \"reference\",
     \"approvedAt\", \"approvedByUserId\", \"createdAt\", \"updatedAt\"
   ) VALUES (
     'issue246-invalid-approved', 'INVALID', 1, 'Invalid', 'APPROVED', '{}'::jsonb,
     'Reference only', CURRENT_TIMESTAMP, 'issue246-user-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
   );"

expect_failure \
  "approved protocol update" \
  "Approved adipometry protocols are immutable" \
  "UPDATE \"AdipometryProtocol\" SET \"name\" = 'mutated' WHERE \"id\" = 'issue246-protocol-approved';"

expect_failure \
  "approved protocol delete" \
  "Approved adipometry protocols are immutable" \
  "DELETE FROM \"AdipometryProtocol\" WHERE \"id\" = 'issue246-protocol-approved';"

cat > "$TMP_DIR/concurrent-a.sql" <<'SQL'
BEGIN;
SELECT * FROM "createAdipometryDraft"(
  'issue246-concurrent-a', 'issue246-contract-a', 'issue246-aluno-a1',
  'issue246-professor-a', DATE '2026-07-30', CURRENT_TIMESTAMP
);
SELECT pg_sleep(1);
COMMIT;
SQL

cat > "$TMP_DIR/concurrent-b.sql" <<'SQL'
BEGIN;
SELECT * FROM "createAdipometryDraft"(
  'issue246-concurrent-b', 'issue246-contract-a', 'issue246-aluno-a1',
  'issue246-professor-a', DATE '2026-07-30', CURRENT_TIMESTAMP
);
COMMIT;
SQL

psql_run -f /work/concurrent-a.sql >"$TMP_DIR/concurrent-a.out" 2>&1 &
pid_a=$!
psql_run -f /work/concurrent-b.sql >"$TMP_DIR/concurrent-b.out" 2>&1 &
pid_b=$!
wait "$pid_a"
wait "$pid_b"

sql "DO \$\$ BEGIN
  IF (SELECT COUNT(*) FROM \"AdipometryAssessment\" WHERE \"id\" IN ('issue246-concurrent-a','issue246-concurrent-b')) <> 2 THEN
    RAISE EXCEPTION 'concurrent inserts missing';
  END IF;
  IF (SELECT COUNT(DISTINCT \"code\") FROM \"AdipometryAssessment\" WHERE \"id\" IN ('issue246-concurrent-a','issue246-concurrent-b')) <> 2 THEN
    RAISE EXCEPTION 'duplicate concurrent codes';
  END IF;
END \$\$;"
echo "positive-control OK: concurrent draft creation"

sql "BEGIN;
SELECT * FROM \"createAdipometryDraft\"(
  'issue246-rolled-back', 'issue246-contract-a', 'issue246-aluno-a1',
  'issue246-professor-a', DATE '2026-07-30', CURRENT_TIMESTAMP
);
ROLLBACK;"

sql "SELECT * FROM \"createAdipometryDraft\"(
  'issue246-after-rollback', 'issue246-contract-a', 'issue246-aluno-a1',
  'issue246-professor-a', DATE '2026-07-30', CURRENT_TIMESTAMP
);"

sql "DO \$\$ BEGIN
  IF EXISTS (SELECT 1 FROM \"AdipometryAssessment\" WHERE \"id\" = 'issue246-rolled-back') THEN
    RAISE EXCEPTION 'rolled-back assessment persisted';
  END IF;
  IF (SELECT \"sequenceNumber\" FROM \"AdipometryAssessment\" WHERE \"id\" = 'issue246-after-rollback') <> 3 THEN
    RAISE EXCEPTION 'rollback consumed sequence';
  END IF;
END \$\$;"
echo "positive-control OK: rollback preserves sequence"

sql "SELECT * FROM \"createAdipometryDraft\"(
  'issue246-a2-first', 'issue246-contract-a', 'issue246-aluno-a2',
  'issue246-professor-a', DATE '2026-07-30', CURRENT_TIMESTAMP
);
SELECT * FROM \"createAdipometryDraft\"(
  'issue246-b1-first', 'issue246-contract-b', 'issue246-aluno-b1',
  'issue246-professor-b', DATE '2026-07-30', CURRENT_TIMESTAMP
);"

sql "DO \$\$ BEGIN
  IF (SELECT \"code\" FROM \"AdipometryAssessment\" WHERE \"id\" = 'issue246-a2-first') <> 'ADPT-001'
     OR (SELECT \"code\" FROM \"AdipometryAssessment\" WHERE \"id\" = 'issue246-b1-first') <> 'ADPT-001' THEN
    RAISE EXCEPTION 'student or contract sequences are not independent';
  END IF;
END \$\$;"
echo "positive-control OK: contract and student sequences are independent"

sql "INSERT INTO \"AdipometrySequence\" (
  \"contractId\", \"alunoId\", \"lastValue\", \"updatedAt\"
) VALUES ('issue246-contract-a', 'issue246-aluno-overflow', 999, CURRENT_TIMESTAMP);
SELECT * FROM \"createAdipometryDraft\"(
  'issue246-overflow', 'issue246-contract-a', 'issue246-aluno-overflow',
  'issue246-professor-a', DATE '2026-07-30', CURRENT_TIMESTAMP
);"

sql "DO \$\$ BEGIN
  IF (SELECT \"sequenceNumber\" FROM \"AdipometryAssessment\" WHERE \"id\" = 'issue246-overflow') <> 1000
     OR (SELECT \"code\" FROM \"AdipometryAssessment\" WHERE \"id\" = 'issue246-overflow') <> 'ADPT-1000' THEN
    RAISE EXCEPTION 'ADPT-1000 formatting failed';
  END IF;
END \$\$;"
echo "positive-control OK: ADPT-1000"

expect_failure \
  "manual code inconsistent with sequence" \
  "AdipometryAssessment_code_matches_sequence_check" \
  "INSERT INTO \"AdipometryAssessment\" (
     \"id\", \"contractId\", \"alunoId\", \"professorId\", \"sequenceNumber\", \"code\",
     \"assessmentDate\", \"status\", \"createdAt\", \"updatedAt\"
   ) VALUES (
     'issue246-invalid-code', 'issue246-contract-a', 'issue246-aluno-a1', 'issue246-professor-a',
     9999, 'ADPT-999', DATE '2026-07-30', 'DRAFT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
   );"

expect_failure \
  "cross-tenant student draft" \
  "AdipometrySequence_alunoId_contractId_fkey" \
  "SELECT * FROM \"createAdipometryDraft\"(
     'issue246-cross-student', 'issue246-contract-a', 'issue246-aluno-b1',
     'issue246-professor-a', DATE '2026-07-30', CURRENT_TIMESTAMP
   );"

expect_failure \
  "cross-tenant professor draft" \
  "ADIPOMETRY_AUDIT_ACTOR_CROSS_TENANT" \
  "SELECT * FROM \"createAdipometryDraft\"(
     'issue246-cross-professor', 'issue246-contract-a', 'issue246-aluno-a1',
     'issue246-professor-b', DATE '2026-07-30', CURRENT_TIMESTAMP
   );"

expect_failure \
  "derived result written to draft" \
  "AdipometryAssessment_completion_check" \
  "UPDATE \"AdipometryAssessment\"
   SET \"bodyFatPercentage\" = 20, \"updatedAt\" = CURRENT_TIMESTAMP
   WHERE \"id\" = 'issue246-after-rollback';"

expect_failure \
  "cross-tenant anthropometry support" \
  "AdipometryAssessment_anthropometry_contract_aluno_fkey" \
  "UPDATE \"AdipometryAssessment\"
   SET \"anthropometryAssessmentId\" = 'issue246-anthro-b1', \"updatedAt\" = CURRENT_TIMESTAMP
   WHERE \"id\" = 'issue246-after-rollback';"

sql "SELECT * FROM \"createAdipometryDraft\"(
  'issue246-completed', 'issue246-contract-a', 'issue246-aluno-a1',
  'issue246-professor-a', DATE '2026-07-30', CURRENT_TIMESTAMP
);"

sql "DO \$\$ BEGIN
  IF (SELECT \"sequenceNumber\" FROM \"AdipometryAssessment\" WHERE \"id\" = 'issue246-completed') <> 4 THEN
    RAISE EXCEPTION 'failed cross-tenant draft consumed sequence';
  END IF;
END \$\$;"
echo "positive-control OK: failed draft creation rolls sequence back"

expect_failure \
  "completed assessment with draft protocol" \
  "ADIPOMETRY_PROTOCOL_NOT_APPROVED" \
  "UPDATE \"AdipometryAssessment\"
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
     \"protocolId\" = 'adpt_protocol_guedes_adult_v1',
     \"protocolCode\" = 'GUEDES_ADULT',
     \"protocolVersion\" = 1,
     \"calculationSnapshot\" = issue246_snapshot('GUEDES_ADULT', 1, DATE '2026-07-30', 70, 10, 10, 10, 10, 10, 50, 20, 14, 56),
     \"completedAt\" = CURRENT_TIMESTAMP,
     \"updatedAt\" = CURRENT_TIMESTAMP
   WHERE \"id\" = 'issue246-completed';"

expect_failure \
  "snapshot differs from persisted result" \
  "AdipometryAssessment_completion_check" \
  "UPDATE \"AdipometryAssessment\"
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
     \"protocolId\" = 'issue246-protocol-approved',
     \"protocolCode\" = 'ISSUE246_TEST',
     \"protocolVersion\" = 1,
     \"calculationSnapshot\" = issue246_snapshot('ISSUE246_TEST', 1, DATE '2026-07-30', 70, 10, 10, 10, 10, 10, 50, 21, 14, 56),
     \"completedAt\" = CURRENT_TIMESTAMP,
     \"updatedAt\" = CURRENT_TIMESTAMP
   WHERE \"id\" = 'issue246-completed';"

sql "UPDATE \"AdipometryAssessment\"
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
  \"protocolId\" = 'issue246-protocol-approved',
  \"protocolCode\" = 'ISSUE246_TEST',
  \"protocolVersion\" = 1,
  \"calculationSnapshot\" = issue246_snapshot('ISSUE246_TEST', 1, DATE '2026-07-30', 70, 10, 10, 10, 10, 10, 50, 20, 14, 56),
  \"anthropometryAssessmentId\" = 'issue246-anthro-a1',
  \"completedAt\" = CURRENT_TIMESTAMP,
  \"updatedAt\" = CURRENT_TIMESTAMP
WHERE \"id\" = 'issue246-completed';"

echo "positive-control OK: completed assessment with approved protocol"

sql "DO \$\$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM \"AdipometryAuditEvent\"
    WHERE \"assessmentId\" = 'issue246-completed' AND \"action\" = 'COMPLETED'
  ) THEN
    RAISE EXCEPTION 'completion audit event missing';
  END IF;
END \$\$;"
echo "positive-control OK: completion audit event"

expect_failure \
  "common update of completed assessment" \
  "Completed adipometry assessments are immutable" \
  "UPDATE \"AdipometryAssessment\" SET \"notes\" = 'mutated' WHERE \"id\" = 'issue246-completed';"

expect_failure \
  "physical delete of completed assessment" \
  "Completed adipometry assessments cannot be physically deleted" \
  "DELETE FROM \"AdipometryAssessment\" WHERE \"id\" = 'issue246-completed';"

sql "SELECT * FROM \"createAdipometryDraft\"(
  'issue246-correction', 'issue246-contract-a', 'issue246-aluno-a1',
  'issue246-professor-a', DATE '2026-07-31', CURRENT_TIMESTAMP
);
UPDATE \"AdipometryAssessment\"
SET
  \"status\" = 'COMPLETED',
  \"weightKg\" = 70,
  \"tricepsMm\" = 11,
  \"subscapularMm\" = 10,
  \"suprailiacMm\" = 10,
  \"abdominalMm\" = 10,
  \"thighMm\" = 10,
  \"skinfoldTotalMm\" = 51,
  \"bodyFatPercentage\" = 20,
  \"fatMassKg\" = 14,
  \"leanMassKg\" = 56,
  \"protocolId\" = 'issue246-protocol-approved',
  \"protocolCode\" = 'ISSUE246_TEST',
  \"protocolVersion\" = 1,
  \"calculationSnapshot\" = issue246_snapshot('ISSUE246_TEST', 1, DATE '2026-07-31', 70, 11, 10, 10, 10, 10, 51, 20, 14, 56),
  \"correctsAssessmentId\" = 'issue246-completed',
  \"correctionReason\" = 'Measurement transcription corrected',
  \"correctionAuthorUserId\" = 'issue246-user-a',
  \"completedAt\" = CURRENT_TIMESTAMP,
  \"updatedAt\" = CURRENT_TIMESTAMP
WHERE \"id\" = 'issue246-correction';"

sql "DO \$\$ BEGIN
  IF (SELECT \"correctedByAssessmentId\" FROM \"AdipometryAssessment\" WHERE \"id\" = 'issue246-completed') <> 'issue246-correction' THEN
    RAISE EXCEPTION 'correction link missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM \"AdipometryAuditEvent\"
    WHERE \"assessmentId\" = 'issue246-correction'
      AND \"action\" = 'CORRECTION_CREATED'
      AND \"reason\" = 'Measurement transcription corrected'
  ) THEN
    RAISE EXCEPTION 'correction audit event missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM \"AdipometryAuditEvent\"
    WHERE \"assessmentId\" = 'issue246-completed'
      AND \"action\" = 'CORRECTION_LINKED'
  ) THEN
    RAISE EXCEPTION 'correction link audit event missing';
  END IF;
END \$\$;"
echo "positive-control OK: atomic audited correction"

expect_failure \
  "second correction of same original" \
  "ADIPOMETRY_INVALID_CORRECTION_TARGET" \
  "BEGIN;
   SELECT * FROM \"createAdipometryDraft\"(
     'issue246-second-correction', 'issue246-contract-a', 'issue246-aluno-a1',
     'issue246-professor-a', DATE '2026-08-01', CURRENT_TIMESTAMP
   );
   UPDATE \"AdipometryAssessment\"
   SET
     \"status\" = 'COMPLETED',
     \"weightKg\" = 70, \"tricepsMm\" = 11, \"subscapularMm\" = 10,
     \"suprailiacMm\" = 10, \"abdominalMm\" = 10, \"thighMm\" = 10,
     \"skinfoldTotalMm\" = 51, \"bodyFatPercentage\" = 20,
     \"fatMassKg\" = 14, \"leanMassKg\" = 56,
     \"protocolId\" = 'issue246-protocol-approved', \"protocolCode\" = 'ISSUE246_TEST', \"protocolVersion\" = 1,
     \"calculationSnapshot\" = issue246_snapshot('ISSUE246_TEST', 1, DATE '2026-08-01', 70, 11, 10, 10, 10, 10, 51, 20, 14, 56),
     \"correctsAssessmentId\" = 'issue246-completed', \"correctionReason\" = 'Second correction',
     \"correctionAuthorUserId\" = 'issue246-user-a', \"completedAt\" = CURRENT_TIMESTAMP, \"updatedAt\" = CURRENT_TIMESTAMP
   WHERE \"id\" = 'issue246-second-correction';
   COMMIT;"

expect_failure \
  "cross-student correction" \
  "ADIPOMETRY_INVALID_CORRECTION_TARGET" \
  "BEGIN;
   SELECT * FROM \"createAdipometryDraft\"(
     'issue246-cross-student-correction', 'issue246-contract-a', 'issue246-aluno-a2',
     'issue246-professor-a', DATE '2026-08-01', CURRENT_TIMESTAMP
   );
   UPDATE \"AdipometryAssessment\"
   SET
     \"status\" = 'COMPLETED',
     \"weightKg\" = 70, \"tricepsMm\" = 11, \"subscapularMm\" = 10,
     \"suprailiacMm\" = 10, \"abdominalMm\" = 10, \"thighMm\" = 10,
     \"skinfoldTotalMm\" = 51, \"bodyFatPercentage\" = 20,
     \"fatMassKg\" = 14, \"leanMassKg\" = 56,
     \"protocolId\" = 'issue246-protocol-approved', \"protocolCode\" = 'ISSUE246_TEST', \"protocolVersion\" = 1,
     \"calculationSnapshot\" = issue246_snapshot('ISSUE246_TEST', 1, DATE '2026-08-01', 70, 11, 10, 10, 10, 10, 51, 20, 14, 56),
     \"correctsAssessmentId\" = 'issue246-correction', \"correctionReason\" = 'Wrong student',
     \"correctionAuthorUserId\" = 'issue246-user-a', \"completedAt\" = CURRENT_TIMESTAMP, \"updatedAt\" = CURRENT_TIMESTAMP
   WHERE \"id\" = 'issue246-cross-student-correction';
   COMMIT;"

expect_failure \
  "cross-tenant correction author" \
  "ADIPOMETRY_CORRECTION_AUTHOR_CROSS_TENANT" \
  "BEGIN;
   SELECT * FROM \"createAdipometryDraft\"(
     'issue246-cross-author-correction', 'issue246-contract-a', 'issue246-aluno-a1',
     'issue246-professor-a', DATE '2026-08-01', CURRENT_TIMESTAMP
   );
   UPDATE \"AdipometryAssessment\"
   SET
     \"status\" = 'COMPLETED',
     \"weightKg\" = 70, \"tricepsMm\" = 11, \"subscapularMm\" = 10,
     \"suprailiacMm\" = 10, \"abdominalMm\" = 10, \"thighMm\" = 10,
     \"skinfoldTotalMm\" = 51, \"bodyFatPercentage\" = 20,
     \"fatMassKg\" = 14, \"leanMassKg\" = 56,
     \"protocolId\" = 'issue246-protocol-approved', \"protocolCode\" = 'ISSUE246_TEST', \"protocolVersion\" = 1,
     \"calculationSnapshot\" = issue246_snapshot('ISSUE246_TEST', 1, DATE '2026-08-01', 70, 11, 10, 10, 10, 10, 51, 20, 14, 56),
     \"correctsAssessmentId\" = 'issue246-correction', \"correctionReason\" = 'Wrong actor',
     \"correctionAuthorUserId\" = 'issue246-user-b', \"completedAt\" = CURRENT_TIMESTAMP, \"updatedAt\" = CURRENT_TIMESTAMP
   WHERE \"id\" = 'issue246-cross-author-correction';
   COMMIT;"

expect_failure \
  "cross-tenant audit actor" \
  "ADIPOMETRY_AUDIT_ACTOR_CROSS_TENANT" \
  "INSERT INTO \"AdipometryAuditEvent\" (
     \"id\", \"contractId\", \"assessmentId\", \"actorUserId\", \"action\", \"createdAt\"
   ) VALUES (
     'issue246-cross-actor-audit', 'issue246-contract-a', 'issue246-after-rollback',
     'issue246-user-b', 'DRAFT_UPDATED', CURRENT_TIMESTAMP
   );"

expect_failure \
  "cross-tenant audit assessment" \
  "AdipometryAuditEvent_assessmentId_contractId_fkey" \
  "INSERT INTO \"AdipometryAuditEvent\" (
     \"id\", \"contractId\", \"assessmentId\", \"actorUserId\", \"action\", \"createdAt\"
   ) VALUES (
     'issue246-cross-assessment-audit', 'issue246-contract-b', 'issue246-after-rollback',
     'issue246-user-b', 'DRAFT_UPDATED', CURRENT_TIMESTAMP
   );"

expect_failure \
  "audit event update" \
  "Adipometry audit events are append-only" \
  "UPDATE \"AdipometryAuditEvent\"
   SET \"reason\" = 'mutated'
   WHERE \"assessmentId\" = 'issue246-completed' AND \"action\" = 'COMPLETED';"

expect_failure \
  "audit event delete" \
  "Adipometry audit events are append-only" \
  "DELETE FROM \"AdipometryAuditEvent\"
   WHERE \"assessmentId\" = 'issue246-completed' AND \"action\" = 'COMPLETED';"

sql "INSERT INTO \"AdipometryProtocol\" (
  \"id\", \"code\", \"version\", \"name\", \"status\", \"definitionSnapshot\", \"reference\",
  \"approvedAt\", \"approvedByUserId\", \"createdAt\", \"updatedAt\"
)
SELECT
  'issue246-protocol-approved-v2', \"code\", 2, \"name\", \"status\",
  JSONB_SET(\"definitionSnapshot\", '{equations}', '[{\"id\":\"fixture-v2\"}]'::jsonb),
  \"reference\", CURRENT_TIMESTAMP, \"approvedByUserId\", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM \"AdipometryProtocol\"
WHERE \"id\" = 'issue246-protocol-approved';"

sql "DO \$\$ BEGIN
  IF (SELECT \"protocolVersion\" FROM \"AdipometryAssessment\" WHERE \"id\" = 'issue246-completed') <> 1 THEN
    RAISE EXCEPTION 'historical protocol version changed';
  END IF;
  IF (SELECT \"calculationSnapshot\" #>> '{protocol,version}' FROM \"AdipometryAssessment\" WHERE \"id\" = 'issue246-completed') <> '1' THEN
    RAISE EXCEPTION 'historical snapshot changed';
  END IF;
END \$\$;"
echo "positive-control OK: new protocol version preserves historical assessment"

sql "DO \$\$ BEGIN
  IF (SELECT COUNT(*) FROM \"AdipometryAuditEvent\" WHERE \"assessmentId\" = 'issue246-after-rollback' AND \"action\" = 'DRAFT_CREATED') <> 1 THEN
    RAISE EXCEPTION 'draft creation audit missing or duplicated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM \"AdipometryAssessment\" WHERE \"id\" = 'issue246-completed') THEN
    RAISE EXCEPTION 'completed assessment missing';
  END IF;
  IF (SELECT \"tricepsMm\" FROM \"AdipometryAssessment\" WHERE \"id\" = 'issue246-completed') <> 10 THEN
    RAISE EXCEPTION 'original assessment was overwritten';
  END IF;
END \$\$;"

echo "adipometry foundation verification OK"
