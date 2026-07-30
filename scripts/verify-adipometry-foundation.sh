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
  local statement="$2"
  printf '%s\n' "$statement" > "$TMP_DIR/expected-failure.sql"
  if psql_run -f /work/expected-failure.sql >"$TMP_DIR/failure.out" 2>&1; then
    echo "Expected failure did not occur: $label" >&2
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
    ('issue246-function-a', 'issue246-contract-a', 'Issue 246', 'ISSUE246-A', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-function-b', 'issue246-contract-b', 'Issue 246', 'ISSUE246-B', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

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
    ('issue246-anthro-a1', 'issue246-contract-a', 'issue246-aluno-a1', 'issue246-professor-a', 'ANT-ISSUE246-A1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-anthro-b1', 'issue246-contract-b', 'issue246-aluno-b1', 'issue246-professor-b', 'ANT-ISSUE246-B1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
END $$;

INSERT INTO "AdipometryProtocolVersion" (
  "id", "code", "name", "version", "status", "reference", "populationCriteria",
  "requiredSkinfolds", "inputUnits", "outputUnits", "equations", "limits",
  "precisionRules", "missingDataBehavior", "testVectors", "approvedAt", "approvedBy",
  "createdAt", "updatedAt"
) VALUES (
  'issue246-protocol-approved',
  'ISSUE246-TEST',
  'Protocol only for structural migration verification',
  '1.0-test',
  'APPROVED',
  'Non-clinical CI fixture',
  '{"fixture":true}'::jsonb,
  ARRAY['triceps','subscapular','suprailiac','abdominal','thigh'],
  '{"weight":"kg","skinfolds":"mm"}'::jsonb,
  '{"bodyFat":"percent","mass":"kg"}'::jsonb,
  '["fixture"]'::jsonb,
  '{"fixture":true}'::jsonb,
  '{"fixture":true}'::jsonb,
  'CI fixture only',
  '[{"inputs":{"fixture":true},"expected":{"fixture":true}}]'::jsonb,
  CURRENT_TIMESTAMP,
  'CI fixture',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
SQL
psql_run -f /work/setup.sql

cat > "$TMP_DIR/concurrent-a.sql" <<'SQL'
BEGIN;
WITH reserved AS (
  SELECT * FROM reserve_adipometry_code('issue246-contract-a', 'issue246-aluno-a1')
)
INSERT INTO "AdipometryAssessment" (
  "id", "contractId", "alunoId", "professorId", "code", "sequenceNumber",
  "assessmentDate", "status", "notes", "createdAt", "updatedAt"
)
SELECT 'issue246-concurrent-a', 'issue246-contract-a', 'issue246-aluno-a1', 'issue246-professor-a',
       "code", "sequenceNumber", CURRENT_TIMESTAMP, 'DRAFT', 'concurrent-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM reserved;
SELECT pg_sleep(1);
COMMIT;
SQL

cat > "$TMP_DIR/concurrent-b.sql" <<'SQL'
BEGIN;
WITH reserved AS (
  SELECT * FROM reserve_adipometry_code('issue246-contract-a', 'issue246-aluno-a1')
)
INSERT INTO "AdipometryAssessment" (
  "id", "contractId", "alunoId", "professorId", "code", "sequenceNumber",
  "assessmentDate", "status", "notes", "createdAt", "updatedAt"
)
SELECT 'issue246-concurrent-b', 'issue246-contract-a', 'issue246-aluno-a1', 'issue246-professor-a',
       "code", "sequenceNumber", CURRENT_TIMESTAMP, 'DRAFT', 'concurrent-b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM reserved;
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

echo "positive-control OK: concurrent reservations"

sql "BEGIN;
WITH reserved AS (SELECT * FROM reserve_adipometry_code('issue246-contract-a', 'issue246-aluno-a1'))
INSERT INTO \"AdipometryAssessment\" (
  \"id\", \"contractId\", \"alunoId\", \"professorId\", \"code\", \"sequenceNumber\", \"assessmentDate\", \"status\", \"createdAt\", \"updatedAt\"
)
SELECT 'issue246-rolled-back', 'issue246-contract-a', 'issue246-aluno-a1', 'issue246-professor-a', \"code\", \"sequenceNumber\", CURRENT_TIMESTAMP, 'DRAFT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM reserved;
ROLLBACK;"

sql "DO \$\$ DECLARE r RECORD; BEGIN
  SELECT * INTO r FROM reserve_adipometry_code('issue246-contract-a', 'issue246-aluno-a1');
  IF r.\"sequenceNumber\" <> 3 THEN RAISE EXCEPTION 'rollback consumed sequence: %', r.\"sequenceNumber\"; END IF;
  INSERT INTO \"AdipometryAssessment\" (
    \"id\", \"contractId\", \"alunoId\", \"professorId\", \"code\", \"sequenceNumber\", \"assessmentDate\", \"status\", \"createdAt\", \"updatedAt\"
  ) VALUES ('issue246-after-rollback', 'issue246-contract-a', 'issue246-aluno-a1', 'issue246-professor-a', r.\"code\", r.\"sequenceNumber\", CURRENT_TIMESTAMP, 'DRAFT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
END \$\$;"

echo "positive-control OK: rollback preserves sequence"

sql "DO \$\$ DECLARE a2 RECORD; b1 RECORD; BEGIN
  SELECT * INTO a2 FROM reserve_adipometry_code('issue246-contract-a', 'issue246-aluno-a2');
  SELECT * INTO b1 FROM reserve_adipometry_code('issue246-contract-b', 'issue246-aluno-b1');
  IF a2.\"code\" <> 'ADPT-001' OR b1.\"code\" <> 'ADPT-001' THEN
    RAISE EXCEPTION 'sequences are not independent: %, %', a2.\"code\", b1.\"code\";
  END IF;
END \$\$;"

echo "positive-control OK: contract/student independent sequences"

sql "INSERT INTO \"AdipometrySequence\" (\"id\", \"contractId\", \"alunoId\", \"lastValue\", \"createdAt\", \"updatedAt\")
VALUES ('issue246-overflow-sequence', 'issue246-contract-a', 'issue246-aluno-overflow', 999, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
DO \$\$ DECLARE r RECORD; BEGIN
  SELECT * INTO r FROM reserve_adipometry_code('issue246-contract-a', 'issue246-aluno-overflow');
  IF r.\"sequenceNumber\" <> 1000 OR r.\"code\" <> 'ADPT-1000' THEN
    RAISE EXCEPTION 'overflow formatting failed: %, %', r.\"sequenceNumber\", r.\"code\";
  END IF;
END \$\$;"

echo "positive-control OK: ADPT-1000"

expect_failure "approved protocol missing gate metadata" "INSERT INTO \"AdipometryProtocolVersion\" (
  \"id\", \"code\", \"name\", \"version\", \"status\", \"missingDataBehavior\", \"createdAt\", \"updatedAt\"
) VALUES ('issue246-invalid-protocol', 'ISSUE246-INVALID', 'Invalid', '1', 'APPROVED', 'none', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);"

expect_failure "completed assessment with draft protocol" "BEGIN;
WITH reserved AS (SELECT * FROM reserve_adipometry_code('issue246-contract-a', 'issue246-aluno-a1'))
INSERT INTO \"AdipometryAssessment\" (
  \"id\", \"contractId\", \"alunoId\", \"professorId\", \"code\", \"sequenceNumber\", \"assessmentDate\", \"status\",
  \"weightKg\", \"tricepsMm\", \"subscapularMm\", \"suprailiacMm\", \"abdominalMm\", \"thighMm\", \"sumSkinfoldsMm\",
  \"bodyFatPercentage\", \"fatMassKg\", \"leanMassKg\", \"protocolCode\", \"protocolVersion\", \"calculationSnapshot\", \"createdAt\", \"updatedAt\"
)
SELECT 'issue246-draft-protocol-final', 'issue246-contract-a', 'issue246-aluno-a1', 'issue246-professor-a', \"code\", \"sequenceNumber\", CURRENT_TIMESTAMP, 'COMPLETED',
  70, 10, 10, 10, 10, 10, 50, 20, 14, 56, 'GUEDES-ADULT', '0.1-draft', '{\"schemaVersion\":1}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM reserved;
COMMIT;"

expect_failure "completed assessment missing derived results" "BEGIN;
WITH reserved AS (SELECT * FROM reserve_adipometry_code('issue246-contract-a', 'issue246-aluno-a1'))
INSERT INTO \"AdipometryAssessment\" (
  \"id\", \"contractId\", \"alunoId\", \"professorId\", \"code\", \"sequenceNumber\", \"assessmentDate\", \"status\", \"createdAt\", \"updatedAt\"
)
SELECT 'issue246-incomplete-final', 'issue246-contract-a', 'issue246-aluno-a1', 'issue246-professor-a', \"code\", \"sequenceNumber\", CURRENT_TIMESTAMP, 'COMPLETED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM reserved;
COMMIT;"

sql "DO \$\$ DECLARE r RECORD; BEGIN
  SELECT * INTO r FROM reserve_adipometry_code('issue246-contract-a', 'issue246-aluno-a1');
  INSERT INTO \"AdipometryAssessment\" (
    \"id\", \"contractId\", \"alunoId\", \"professorId\", \"code\", \"sequenceNumber\", \"assessmentDate\", \"status\",
    \"weightKg\", \"tricepsMm\", \"subscapularMm\", \"suprailiacMm\", \"abdominalMm\", \"thighMm\", \"sumSkinfoldsMm\",
    \"bodyFatPercentage\", \"fatMassKg\", \"leanMassKg\", \"protocolCode\", \"protocolVersion\", \"calculationSnapshot\",
    \"supportAnthropometryId\", \"createdAt\", \"updatedAt\"
  ) VALUES (
    'issue246-completed', 'issue246-contract-a', 'issue246-aluno-a1', 'issue246-professor-a', r.\"code\", r.\"sequenceNumber\", CURRENT_TIMESTAMP, 'COMPLETED',
    70, 10, 10, 10, 10, 10, 50, 20, 14, 56, 'ISSUE246-TEST', '1.0-test',
    '{\"schemaVersion\":1,\"protocol\":{\"code\":\"ISSUE246-TEST\",\"version\":\"1.0-test\"}}'::jsonb,
    'issue246-anthro-a1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );
END \$\$;"

echo "positive-control OK: completed assessment with approved protocol"

expect_failure "common update of completed assessment" "UPDATE \"AdipometryAssessment\" SET \"notes\" = 'mutated' WHERE \"id\" = 'issue246-completed';"
expect_failure "physical delete of completed assessment" "DELETE FROM \"AdipometryAssessment\" WHERE \"id\" = 'issue246-completed';"

expect_failure "cross-tenant anthropometry support" "BEGIN;
WITH reserved AS (SELECT * FROM reserve_adipometry_code('issue246-contract-a', 'issue246-aluno-a1'))
INSERT INTO \"AdipometryAssessment\" (
  \"id\", \"contractId\", \"alunoId\", \"professorId\", \"code\", \"sequenceNumber\", \"assessmentDate\", \"status\", \"supportAnthropometryId\", \"createdAt\", \"updatedAt\"
)
SELECT 'issue246-cross-anthro', 'issue246-contract-a', 'issue246-aluno-a1', 'issue246-professor-a', \"code\", \"sequenceNumber\", CURRENT_TIMESTAMP, 'DRAFT', 'issue246-anthro-b1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM reserved;
COMMIT;"

sql "DO \$\$ DECLARE r RECORD; BEGIN
  SELECT * INTO r FROM reserve_adipometry_code('issue246-contract-a', 'issue246-aluno-a1');
  INSERT INTO \"AdipometryAssessment\" (
    \"id\", \"contractId\", \"alunoId\", \"professorId\", \"code\", \"sequenceNumber\", \"assessmentDate\", \"status\",
    \"weightKg\", \"tricepsMm\", \"subscapularMm\", \"suprailiacMm\", \"abdominalMm\", \"thighMm\", \"sumSkinfoldsMm\",
    \"bodyFatPercentage\", \"fatMassKg\", \"leanMassKg\", \"protocolCode\", \"protocolVersion\", \"calculationSnapshot\",
    \"correctionOfId\", \"correctionReason\", \"correctedByProfessorId\", \"correctedAt\", \"createdAt\", \"updatedAt\"
  ) VALUES (
    'issue246-correction', 'issue246-contract-a', 'issue246-aluno-a1', 'issue246-professor-a', r.\"code\", r.\"sequenceNumber\", CURRENT_TIMESTAMP, 'COMPLETED',
    70, 11, 10, 10, 10, 10, 51, 20, 14, 56, 'ISSUE246-TEST', '1.0-test',
    '{\"schemaVersion\":1,\"correction\":true}'::jsonb,
    'issue246-completed', 'Measurement transcription corrected', 'issue246-professor-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );
  INSERT INTO \"AdipometryAuditLog\" (
    \"id\", \"contractId\", \"assessmentId\", \"actorProfessorId\", \"action\", \"reason\", \"beforeSnapshot\", \"afterSnapshot\", \"createdAt\"
  ) VALUES (
    'issue246-correction-audit', 'issue246-contract-a', 'issue246-correction', 'issue246-professor-a', 'CORRECTION_CREATED',
    'Measurement transcription corrected', '{\"assessmentId\":\"issue246-completed\"}'::jsonb, '{\"assessmentId\":\"issue246-correction\"}'::jsonb, CURRENT_TIMESTAMP
  );
END \$\$;"

echo "positive-control OK: linked audited correction preserves original"

expect_failure "second direct correction of same original" "BEGIN;
WITH reserved AS (SELECT * FROM reserve_adipometry_code('issue246-contract-a', 'issue246-aluno-a1'))
INSERT INTO \"AdipometryAssessment\" (
  \"id\", \"contractId\", \"alunoId\", \"professorId\", \"code\", \"sequenceNumber\", \"assessmentDate\", \"status\",
  \"weightKg\", \"tricepsMm\", \"subscapularMm\", \"suprailiacMm\", \"abdominalMm\", \"thighMm\", \"sumSkinfoldsMm\",
  \"bodyFatPercentage\", \"fatMassKg\", \"leanMassKg\", \"protocolCode\", \"protocolVersion\", \"calculationSnapshot\",
  \"correctionOfId\", \"correctionReason\", \"correctedByProfessorId\", \"correctedAt\", \"createdAt\", \"updatedAt\"
)
SELECT 'issue246-second-correction', 'issue246-contract-a', 'issue246-aluno-a1', 'issue246-professor-a', \"code\", \"sequenceNumber\", CURRENT_TIMESTAMP, 'COMPLETED',
  70, 11, 10, 10, 10, 10, 51, 20, 14, 56, 'ISSUE246-TEST', '1.0-test', '{\"schemaVersion\":1}'::jsonb,
  'issue246-completed', 'Second correction', 'issue246-professor-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM reserved;
COMMIT;"

expect_failure "cross-tenant audit actor" "INSERT INTO \"AdipometryAuditLog\" (
  \"id\", \"contractId\", \"assessmentId\", \"actorProfessorId\", \"action\", \"createdAt\"
) VALUES ('issue246-cross-audit', 'issue246-contract-a', 'issue246-concurrent-a', 'issue246-professor-b', 'DRAFT_UPDATED', CURRENT_TIMESTAMP);"

sql "DO \$\$ BEGIN
  IF EXISTS (SELECT 1 FROM \"AdipometryAssessment\" WHERE \"id\" = 'issue246-rolled-back') THEN
    RAISE EXCEPTION 'rolled back assessment persisted';
  END IF;
  IF (SELECT \"notes\" FROM \"AdipometryAssessment\" WHERE \"id\" = 'issue246-completed') IS NOT NULL THEN
    RAISE EXCEPTION 'completed assessment was mutated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM \"AdipometryAssessment\" WHERE \"id\" = 'issue246-completed') THEN
    RAISE EXCEPTION 'completed assessment was deleted';
  END IF;
END \$\$;"

echo "adipometry foundation verification OK"
