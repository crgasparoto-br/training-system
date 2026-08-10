#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/training_system_test}"
BASE_URL="${BASE_URL%%\?*}"
SERVER_URL="${BASE_URL%/*}"
TEMP_DB="training_system_issue246_round2_${GITHUB_RUN_ID:-local}_$$"
TEMP_URL="${SERVER_URL}/${TEMP_DB}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  docker run --rm --network host postgres:16-alpine \
    psql "${SERVER_URL}/postgres" -v ON_ERROR_STOP=1 -X -q \
    -c "DROP DATABASE IF EXISTS \"${TEMP_DB}\" WITH (FORCE);" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

psql_file() {
  local path="$1"
  local mounted_name="$2"
  docker run --rm --network host \
    -v "$path:/work/$mounted_name:ro" \
    postgres:16-alpine \
    psql "$TEMP_URL" -v ON_ERROR_STOP=1 -X -q -f "/work/$mounted_name"
}

expect_failure() {
  local label="$1"
  local pattern="$2"
  local statement="$3"
  printf '%s\n' "$statement" > "$TMP_DIR/expected-failure.sql"
  if psql_file "$TMP_DIR/expected-failure.sql" expected-failure.sql >"$TMP_DIR/failure.out" 2>&1; then
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

docker run --rm --network host postgres:16-alpine \
  psql "${SERVER_URL}/postgres" -v ON_ERROR_STOP=1 -X -q \
  -c "CREATE DATABASE \"${TEMP_DB}\";"

DATABASE_URL="$TEMP_URL" pnpm --filter @corrida/api exec prisma migrate deploy

cat > "$TMP_DIR/setup.sql" <<'SQL'
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
    'issue246-r2-contract-a', contract_type, 'issue246-r2-doc-a', 'Issue 246 round 2 A',
    'issue246-r2-contract-b', contract_type, 'issue246-r2-doc-b', 'Issue 246 round 2 B'
  );

  INSERT INTO "CollaboratorFunctionOption" (
    "id", "contractId", "name", "code", "isActive", "isSystem", "createdAt", "updatedAt"
  ) VALUES
    ('issue246-r2-function-a', 'issue246-r2-contract-a', 'Round 2 A', 'ISSUE246-R2-A', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-r2-function-b', 'issue246-r2-contract-b', 'Round 2 B', 'ISSUE246-R2-B', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  EXECUTE format(
    'INSERT INTO "User" ("id", "email", "passwordHash", "type", "createdAt", "updatedAt", "isActive") VALUES
      (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true),
      (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true),
      (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true)',
    'issue246-r2-actor', 'issue246-r2-actor@example.invalid', 'not-a-password', user_type,
    'issue246-r2-responsible', 'issue246-r2-responsible@example.invalid', 'not-a-password', user_type,
    'issue246-r2-other', 'issue246-r2-other@example.invalid', 'not-a-password', user_type
  );

  INSERT INTO "Professor" (
    "id", "userId", "contractId", "collaboratorFunctionId", "createdAt", "updatedAt"
  ) VALUES
    ('issue246-r2-professor-actor', 'issue246-r2-actor', 'issue246-r2-contract-a', 'issue246-r2-function-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-r2-professor-responsible', 'issue246-r2-responsible', 'issue246-r2-contract-a', 'issue246-r2-function-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-r2-professor-other', 'issue246-r2-other', 'issue246-r2-contract-b', 'issue246-r2-function-b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  UPDATE "Professor"
  SET "role" = 'master', "currentStatus" = 'active'
  WHERE "id" = 'issue246-r2-professor-responsible';

  INSERT INTO "Profile" ("id", "userId", "name", "cref", "createdAt", "updatedAt") VALUES
    ('issue246-r2-profile-responsible', 'issue246-r2-responsible', 'Responsável clínico R2', 'CREF-R2-0001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  INSERT INTO "Aluno" ("id", "contractId", "createdAt", "updatedAt") VALUES
    ('issue246-r2-aluno-a', 'issue246-r2-contract-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-r2-aluno-concurrent', 'issue246-r2-contract-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-r2-aluno-overflow', 'issue246-r2-contract-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-r2-aluno-b', 'issue246-r2-contract-b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  INSERT INTO "StudentProfile" (
    "id", "alunoId", "contractId", "identificationData", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-r2-student-profile-a', 'issue246-r2-aluno-a', 'issue246-r2-contract-a',
    '{"birthDate":"1996-07-30","gender":"female"}'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  INSERT INTO "AnthropometryAssessment" (
    "id", "contractId", "alunoId", "professorId", "code", "assessmentDate", "createdAt", "updatedAt"
  ) VALUES
    ('issue246-r2-anthro-a', 'issue246-r2-contract-a', 'issue246-r2-aluno-a', 'issue246-r2-professor-responsible', 'ANT-R2-A', DATE '2026-07-29', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-r2-anthro-b', 'issue246-r2-contract-b', 'issue246-r2-aluno-b', 'issue246-r2-professor-other', 'ANT-R2-B', DATE '2026-07-29', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
END $$;

CREATE OR REPLACE FUNCTION issue246_r2_definition(
  p_approver TEXT,
  p_approved_at TEXT
) RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 2,
    'population', jsonb_build_object(
      'ageMinYears', 18,
      'ageMaxYears', 65,
      'sexCriteria', jsonb_build_array('FEMALE', 'MALE'),
      'maturationCriteria', 'Not required for this structural executable fixture',
      'maturationRule', jsonb_build_object('mode', 'NOT_REQUIRED')
    ),
    'requiredSkinfolds', jsonb_build_array(
      'tricepsMm', 'subscapularMm', 'suprailiacMm', 'abdominalMm', 'thighMm'
    ),
    'inputUnits', jsonb_build_object(
      'weightKg', 'kg', 'tricepsMm', 'mm', 'subscapularMm', 'mm',
      'suprailiacMm', 'mm', 'abdominalMm', 'mm', 'thighMm', 'mm'
    ),
    'outputUnits', jsonb_build_object(
      'skinfoldTotalMm', 'mm', 'bodyFatPercentage', 'percent',
      'fatMassKg', 'kg', 'leanMassKg', 'kg'
    ),
    'equations', jsonb_build_array(
      jsonb_build_object(
        'id', 'body-fat-executable',
        'output', 'bodyFatPercentage',
        'expression', jsonb_build_object(
          'op', 'add',
          'args', jsonb_build_array(
            jsonb_build_object('op', 'constant', 'value', 10),
            jsonb_build_object(
              'op', 'multiply',
              'args', jsonb_build_array(
                jsonb_build_object('op', 'variable', 'name', 'skinfoldTotalMm'),
                jsonb_build_object('op', 'constant', 'value', 0.2)
              )
            )
          )
        )
      ),
      jsonb_build_object(
        'id', 'fat-mass-executable',
        'output', 'fatMassKg',
        'expression', jsonb_build_object(
          'op', 'divide',
          'numerator', jsonb_build_object(
            'op', 'multiply',
            'args', jsonb_build_array(
              jsonb_build_object('op', 'variable', 'name', 'weightKg'),
              jsonb_build_object('op', 'variable', 'name', 'bodyFatPercentage')
            )
          ),
          'denominator', jsonb_build_object('op', 'constant', 'value', 100)
        )
      ),
      jsonb_build_object(
        'id', 'lean-mass-executable',
        'output', 'leanMassKg',
        'expression', jsonb_build_object(
          'op', 'subtract',
          'left', jsonb_build_object('op', 'variable', 'name', 'weightKg'),
          'right', jsonb_build_object('op', 'variable', 'name', 'fatMassKg')
        )
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
        jsonb_build_object('field', 'bodyFatPercentage', 'message', 'Review extreme result')
      )
    ),
    'precision', jsonb_build_object('measurementScale', 2, 'resultScale', 4, 'internalScale', 6),
    'rounding', jsonb_build_object('mode', 'HALF_UP', 'stage', 'FINAL_RESULTS_ONLY'),
    'missingDataBehavior', jsonb_build_object(
      'missingRequired', 'Block conclusion and return a structured reason',
      'incompatibleProfile', 'Block conclusion without fallback'
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
          'skinfoldTotalMm', 55, 'bodyFatPercentage', 21,
          'fatMassKg', 16.8, 'leanMassKg', 63.2
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
      'approvalRecordId', 'issue246-r2-structural-approval',
      'artifactSha256', repeat('b', 64)
    )
  );
$$;

CREATE OR REPLACE FUNCTION issue246_r2_snapshot(
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
      'weightKg', p_weight, 'tricepsMm', 10, 'subscapularMm', 10,
      'suprailiacMm', 10, 'abdominalMm', 10, 'thighMm', 10
    ),
    'rules', jsonb_build_object(
      'equations', jsonb_build_array('body-fat-executable', 'fat-mass-executable', 'lean-mass-executable'),
      'limits', jsonb_build_object('blocking', true),
      'precision', jsonb_build_object('internalScale', 6),
      'rounding', jsonb_build_object('mode', 'HALF_UP')
    ),
    'results', jsonb_build_object(
      'skinfoldTotalMm', p_total, 'bodyFatPercentage', p_body_fat,
      'fatMassKg', p_fat_mass, 'leanMassKg', p_lean_mass
    ),
    'implementationVersion', 'issue246-r2-expression-v1',
    'calculatedAt', '2026-07-30T14:00:00.000Z'
  );
$$;
SQL
psql_file "$TMP_DIR/setup.sql" setup.sql

expect_failure \
  "plain-text placeholder equation" \
  "AdipometryProtocol_approval_check" \
  "INSERT INTO \"AdipometryProtocol\" (\"id\",\"code\",\"version\",\"name\",\"status\",\"definitionSnapshot\",\"reference\",\"approvedAt\",\"approvedByUserId\",\"createdAt\",\"updatedAt\") VALUES ('issue246-r2-placeholder','R2_PLACEHOLDER',1,'Placeholder','APPROVED',jsonb_set(issue246_r2_definition('issue246-r2-actor','2026-07-30T14:00:00Z'),'{equations,0,expression}',to_jsonb('approved clinical expression is stored verbatim'::text)),'Reference',TIMESTAMP '2026-07-30 14:00:00','issue246-r2-actor',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);"

expect_failure \
  "test vector inconsistent with executable equations" \
  "AdipometryProtocol_approval_check" \
  "INSERT INTO \"AdipometryProtocol\" (\"id\",\"code\",\"version\",\"name\",\"status\",\"definitionSnapshot\",\"reference\",\"approvedAt\",\"approvedByUserId\",\"createdAt\",\"updatedAt\") VALUES ('issue246-r2-vector-mismatch','R2_VECTOR_BAD',1,'Vector mismatch','APPROVED',jsonb_set(issue246_r2_definition('issue246-r2-actor','2026-07-30T14:00:00Z'),'{testVectors,0,expectedResults,bodyFatPercentage}','99'::jsonb),'Reference',TIMESTAMP '2026-07-30 14:00:00','issue246-r2-actor',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);"

expect_failure \
  "duplicate vector inputs" \
  "AdipometryProtocol_approval_check" \
  "INSERT INTO \"AdipometryProtocol\" (\"id\",\"code\",\"version\",\"name\",\"status\",\"definitionSnapshot\",\"reference\",\"approvedAt\",\"approvedByUserId\",\"createdAt\",\"updatedAt\") VALUES ('issue246-r2-duplicate-vectors','R2_DUPLICATE',1,'Duplicate vectors','APPROVED',jsonb_set(issue246_r2_definition('issue246-r2-actor','2026-07-30T14:00:00Z'),'{testVectors,1,inputs}',issue246_r2_definition('issue246-r2-actor','2026-07-30T14:00:00Z')#>'{testVectors,0,inputs}'),'Reference',TIMESTAMP '2026-07-30 14:00:00','issue246-r2-actor',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);"

expect_failure \
  "approval timestamp without explicit timezone" \
  "AdipometryProtocol_approval_check" \
  "INSERT INTO \"AdipometryProtocol\" (\"id\",\"code\",\"version\",\"name\",\"status\",\"definitionSnapshot\",\"reference\",\"approvedAt\",\"approvedByUserId\",\"createdAt\",\"updatedAt\") VALUES ('issue246-r2-no-zone','R2_NO_ZONE',1,'No zone','APPROVED',issue246_r2_definition('issue246-r2-actor','2026-07-30T14:00:00'),'Reference',TIMESTAMP '2026-07-30 14:00:00','issue246-r2-actor',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);"

cat > "$TMP_DIR/positive.sql" <<'SQL'
SET TIME ZONE 'UTC';
INSERT INTO "AdipometryProtocol" (
  "id","code","version","name","status","definitionSnapshot","reference",
  "approvedAt","approvedByUserId","createdAt","updatedAt"
) VALUES (
  'issue246-r2-approved','R2_EXECUTABLE',1,'Executable structural protocol','APPROVED',
  issue246_r2_definition('issue246-r2-actor','2026-07-30T14:00:00Z'),
  'Versioned executable structural reference',TIMESTAMP '2026-07-30 14:00:00',
  'issue246-r2-actor',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);

SET TIME ZONE 'America/Sao_Paulo';
INSERT INTO "AdipometryProtocol" (
  "id","code","version","name","status","definitionSnapshot","reference",
  "approvedAt","approvedByUserId","createdAt","updatedAt"
) VALUES (
  'issue246-r2-approved-zone','R2_EXECUTABLE',2,'Timezone-independent structural protocol','APPROVED',
  issue246_r2_definition('issue246-r2-actor','2026-07-30T14:00:00Z'),
  'Versioned executable structural reference',TIMESTAMP '2026-07-30 14:00:00',
  'issue246-r2-actor',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
);
RESET TIME ZONE;

INSERT INTO "AccessPermission" (
  id, "collaboratorFunctionId", "screenKey", "blockKey", "canView", "createdAt", "updatedAt"
) VALUES
  (
    'issue246-r2-explicit-clinical-grant', 'issue246-r2-function-a',
    'settings.contract', 'settings.contract.adipometryProtocolApproval', TRUE,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'issue246-r2-explicit-responsibility-management-grant', 'issue246-r2-function-a',
    'settings.contract', 'settings.contract.actions.manageClinicalTechnicalResponsibility', TRUE,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
ON CONFLICT ("collaboratorFunctionId", "screenKey", "blockKey")
DO UPDATE SET "canView" = TRUE, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "AdipometryClinicalResponsibility" (
  "id", "contractId", "domain", "professorId", "effectiveFrom",
  "designatedByUserId", "designatedAt", "createdAt", "updatedAt"
) VALUES (
  'issue246-r2-clinical-responsibility', 'issue246-r2-contract-a',
  'ADIPOMETRY_CLINICAL_RESPONSIBLE', 'issue246-r2-professor-responsible',
  TIMESTAMP '2026-07-30 12:00:00', 'issue246-r2-actor',
  TIMESTAMP '2026-07-30 12:00:00', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "AdipometryProtocolApproval" (
  "id", "contractId", "protocolId", "protocolCode", "protocolVersion",
  "responsibilityId", "approvedByProfessorId", "approvedByUserId", "approvedAt",
  "approvalStatement", "approvedByNameSnapshot", "approvedByCrefSnapshot",
  "approvedSpecificationHash", "protocolDefinitionSnapshot", "createdAt"
)
SELECT
  'issue246-r2-contract-approval', 'issue246-r2-contract-a', protocol.id, protocol.code, protocol.version,
  'issue246-r2-clinical-responsibility', 'issue246-r2-professor-responsible',
  'issue246-r2-responsible', TIMESTAMP '2026-07-30 13:00:00',
  'Declaro que revisei e aprovo esta versão do protocolo para uso clínico neste contrato.',
  'Responsável clínico R2', 'CREF-R2-0001', repeat('a', 64),
  protocol."definitionSnapshot", CURRENT_TIMESTAMP
FROM "AdipometryProtocol" protocol
WHERE protocol.id = 'adpt_protocol_guedes_1991_adult_young_v1';

SELECT * FROM "createAdipometryDraft"(
  'issue246-r2-draft', 'issue246-r2-contract-a', 'issue246-r2-aluno-a',
  'issue246-r2-professor-responsible', DATE '2026-07-30',
  'issue246-r2-actor', CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryAuditEvent"
    WHERE "assessmentId" = 'issue246-r2-draft'
      AND "action" = 'DRAFT_CREATED'
      AND "actorUserId" = 'issue246-r2-actor'
  ) THEN
    RAISE EXCEPTION 'explicit actor was not preserved in the audit event';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = '"createAdipometryDraft"(text,text,text,text,date,timestamp with time zone)'::regprocedure
      AND COALESCE(proacl::text, '') LIKE '%=X/%'
  ) THEN
    RAISE EXCEPTION 'legacy draft overload is still executable by PUBLIC';
  END IF;
END $$;
SQL
psql_file "$TMP_DIR/positive.sql" positive.sql
echo "positive-control OK: executable vectors, UTC normalization and explicit actor"

cat > "$TMP_DIR/app-role.sql" <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'issue246_r2_app') THEN
    CREATE ROLE issue246_r2_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO issue246_r2_app;
GRANT SELECT ON "Professor", "User", "AdipometryProtocol", "AdipometryAssessment" TO issue246_r2_app;
GRANT UPDATE ON "AdipometryAssessment" TO issue246_r2_app;
GRANT INSERT ON "AdipometryAuditEvent" TO issue246_r2_app;
GRANT EXECUTE ON FUNCTION "requireAdipometryActorUserId"(TEXT,TEXT) TO issue246_r2_app;
SET ROLE issue246_r2_app;
UPDATE "AdipometryAssessment"
SET "notes" = 'must not persist without actor', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'issue246-r2-draft';
RESET ROLE;
SQL
if psql_file "$TMP_DIR/app-role.sql" app-role.sql >"$TMP_DIR/app-role.out" 2>&1; then
  echo "Expected application write without actor to fail" >&2
  exit 1
fi
if ! grep -q "ADIPOMETRY_ACTOR_REQUIRED" "$TMP_DIR/app-role.out"; then
  cat "$TMP_DIR/app-role.out" >&2
  exit 1
fi
echo "negative-control OK: application role cannot write without actor context"

cat > "$TMP_DIR/update-with-actor.sql" <<'SQL'
BEGIN;
SELECT set_config('app.adipometry_actor_user_id', 'issue246-r2-actor', true);
UPDATE "AdipometryAssessment"
SET "notes" = 'updated by authenticated actor', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'issue246-r2-draft';
COMMIT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryAuditEvent"
    WHERE "assessmentId" = 'issue246-r2-draft'
      AND "action" = 'DRAFT_UPDATED'
      AND "actorUserId" = 'issue246-r2-actor'
  ) THEN
    RAISE EXCEPTION 'draft update actor was not preserved';
  END IF;
END $$;
SQL
psql_file "$TMP_DIR/update-with-actor.sql" update-with-actor.sql
echo "positive-control OK: update audit actor differs from responsible professor"

expect_failure \
  "cross-tenant explicit actor" \
  "ADIPOMETRY_ACTOR_CROSS_TENANT_OR_INACTIVE" \
  "SELECT * FROM \"createAdipometryDraft\"('issue246-r2-cross-actor','issue246-r2-contract-a','issue246-r2-aluno-a','issue246-r2-professor-responsible',DATE '2026-07-30','issue246-r2-other',CURRENT_TIMESTAMP);"

cat > "$TMP_DIR/concurrent-a.sql" <<'SQL'
BEGIN;
SELECT * FROM "createAdipometryDraft"(
  'issue246-r2-concurrent-a','issue246-r2-contract-a','issue246-r2-aluno-concurrent',
  'issue246-r2-professor-responsible',DATE '2026-07-30','issue246-r2-actor',CURRENT_TIMESTAMP
);
SELECT pg_sleep(1);
COMMIT;
SQL
cat > "$TMP_DIR/concurrent-b.sql" <<'SQL'
BEGIN;
SELECT * FROM "createAdipometryDraft"(
  'issue246-r2-concurrent-b','issue246-r2-contract-a','issue246-r2-aluno-concurrent',
  'issue246-r2-professor-responsible',DATE '2026-07-30','issue246-r2-actor',CURRENT_TIMESTAMP
);
COMMIT;
SQL
psql_file "$TMP_DIR/concurrent-a.sql" concurrent-a.sql >"$TMP_DIR/concurrent-a.out" 2>&1 &
pid_a=$!
sleep 0.2
psql_file "$TMP_DIR/concurrent-b.sql" concurrent-b.sql >"$TMP_DIR/concurrent-b.out" 2>&1 &
pid_b=$!
wait "$pid_a"
wait "$pid_b"

cat > "$TMP_DIR/invariants.sql" <<'SQL'
DO $$ BEGIN
  IF (SELECT COUNT(DISTINCT "code") FROM "AdipometryAssessment" WHERE "alunoId" = 'issue246-r2-aluno-concurrent') <> 2 THEN
    RAISE EXCEPTION 'concurrent codes were duplicated';
  END IF;
END $$;

BEGIN;
SELECT * FROM "createAdipometryDraft"(
  'issue246-r2-rollback','issue246-r2-contract-a','issue246-r2-aluno-concurrent',
  'issue246-r2-professor-responsible',DATE '2026-07-30','issue246-r2-actor',CURRENT_TIMESTAMP
);
ROLLBACK;

SELECT * FROM "createAdipometryDraft"(
  'issue246-r2-after-rollback','issue246-r2-contract-a','issue246-r2-aluno-concurrent',
  'issue246-r2-professor-responsible',DATE '2026-07-30','issue246-r2-actor',CURRENT_TIMESTAMP
);

INSERT INTO "AdipometrySequence" ("contractId","alunoId","lastValue","updatedAt")
VALUES ('issue246-r2-contract-a','issue246-r2-aluno-overflow',999,CURRENT_TIMESTAMP);
SELECT * FROM "createAdipometryDraft"(
  'issue246-r2-overflow','issue246-r2-contract-a','issue246-r2-aluno-overflow',
  'issue246-r2-professor-responsible',DATE '2026-07-30','issue246-r2-actor',CURRENT_TIMESTAMP
);

DO $$ BEGIN
  IF (SELECT "code" FROM "AdipometryAssessment" WHERE "id" = 'issue246-r2-overflow') <> 'ADPT-1000' THEN
    RAISE EXCEPTION 'ADPT-1000 formatting failed';
  END IF;
  IF EXISTS (SELECT 1 FROM "AdipometryAssessment" WHERE "id" = 'issue246-r2-rollback') THEN
    RAISE EXCEPTION 'rolled-back draft persisted';
  END IF;
END $$;
SQL
psql_file "$TMP_DIR/invariants.sql" invariants.sql
echo "positive-control OK: concurrency, rollback and ADPT-1000"

expect_failure \
  "cross-tenant anthropometry reference" \
  "AdipometryAssessment_anthropometry_contract_aluno_fkey" \
  "BEGIN; SELECT set_config('app.adipometry_actor_user_id','issue246-r2-actor',true); UPDATE \"AdipometryAssessment\" SET \"anthropometryAssessmentId\"='issue246-r2-anthro-b',\"updatedAt\"=CURRENT_TIMESTAMP WHERE \"id\"='issue246-r2-draft'; COMMIT;"

cat > "$TMP_DIR/complete.sql" <<'SQL'
BEGIN;
SELECT set_config('app.adipometry_actor_user_id','issue246-r2-actor',true);
UPDATE "AdipometryAssessment"
SET
  "status"='COMPLETED', "weightKg"=70,
  "tricepsMm"=10, "subscapularMm"=10, "suprailiacMm"=10, "abdominalMm"=10, "thighMm"=10,
  "skinfoldTotalMm"=50, "bodyFatPercentage"=20, "fatMassKg"=14, "leanMassKg"=56,
  "protocolId"='adpt_protocol_guedes_1991_adult_young_v1', "protocolCode"='GUEDES_1991_ADULT_YOUNG', "protocolVersion"=1, "protocolSex"='female', "protocolSexSource"='professional_confirmation', "protocolSexConfirmedByUserId"='issue246-r2-responsible', "protocolSexConfirmedAt"=CURRENT_TIMESTAMP,
  "calculationSnapshot"=issue246_r2_snapshot('GUEDES_1991_ADULT_YOUNG',1,DATE '2026-07-30',70,50,20,14,56),
  "completedAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP
WHERE "id"='issue246-r2-draft';
COMMIT;
SQL
psql_file "$TMP_DIR/complete.sql" complete.sql

expect_failure \
  "completed assessment common mutation" \
  "Completed adipometry assessments are immutable" \
  "UPDATE \"AdipometryAssessment\" SET \"notes\"='mutated',\"updatedAt\"=CURRENT_TIMESTAMP WHERE \"id\"='issue246-r2-draft';"

expect_failure \
  "completed assessment physical deletion" \
  "Historical adipometry revisions cannot be physically deleted" \
  "DELETE FROM \"AdipometryAssessment\" WHERE \"id\"='issue246-r2-draft';"

cat > "$TMP_DIR/correction.sql" <<'SQL'
CREATE TEMP TABLE issue246_revision_sequence_before AS
SELECT "lastValue"
FROM "AdipometrySequence"
WHERE "contractId" = 'issue246-r2-contract-a'
  AND "alunoId" = 'issue246-r2-aluno-a';

SELECT * FROM "startAdipometryCorrection"(
  'issue246-r2-correction',
  'issue246-r2-draft',
  'MEASUREMENT_TRANSCRIPTION_ERROR',
  'Corrected measurement transcription',
  'issue246-r2-actor',
  CURRENT_TIMESTAMP::timestamp
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "AdipometryAssessment" correction
    JOIN "AdipometryAssessment" original
      ON original.id = correction."previousRevisionId"
    WHERE correction.id = 'issue246-r2-correction'
      AND correction."revisionStatus" = 'DRAFT'
      AND correction."revisionNumber" = 2
      AND correction."rootAssessmentId" = 'issue246-r2-draft'
      AND correction.code = original.code
      AND correction."sequenceNumber" = original."sequenceNumber"
  ) THEN
    RAISE EXCEPTION 'correction draft did not preserve the canonical identity';
  END IF;

  IF (SELECT "lastValue" FROM "AdipometrySequence"
      WHERE "contractId" = 'issue246-r2-contract-a'
        AND "alunoId" = 'issue246-r2-aluno-a')
     IS DISTINCT FROM (SELECT "lastValue" FROM issue246_revision_sequence_before) THEN
    RAISE EXCEPTION 'correction draft consumed the assessment sequence';
  END IF;
END $$;
SQL
psql_file "$TMP_DIR/correction.sql" correction.sql

expect_failure \
  "second open correction" \
  "ADIPOMETRY_CORRECTION_ALREADY_OPEN" \
  "SELECT * FROM \"startAdipometryCorrection\"('issue246-r2-second-open','issue246-r2-draft','OTHER','Second simultaneous correction must be rejected','issue246-r2-actor',CURRENT_TIMESTAMP::timestamp);"

cat > "$TMP_DIR/finalize-correction.sql" <<'SQL'
BEGIN;
SELECT set_config('app.adipometry_actor_user_id','issue246-r2-actor',true);
UPDATE "AdipometryAssessment"
SET
  status = 'COMPLETED',
  "subscapularMm" = 11.0,
  "calculationSnapshot" = issue246_r2_snapshot(
    'GUEDES_1991_ADULT_YOUNG', 1, DATE '2026-07-31', 70, 51, 20, 14, 56
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'issue246-r2-correction';
COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryAssessment"
    WHERE id = 'issue246-r2-draft'
      AND "revisionStatus" = 'SUPERSEDED'
      AND "correctedByAssessmentId" = 'issue246-r2-correction'
  ) THEN
    RAISE EXCEPTION 'original revision was not superseded atomically';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryAssessment"
    WHERE id = 'issue246-r2-correction'
      AND "revisionStatus" = 'FINALIZED'
      AND "revisionNumber" = 2
      AND JSONB_TYPEOF("beforeSnapshot") = 'object'
      AND JSONB_TYPEOF("afterSnapshot") = 'object'
      AND "changedFields" @> '["subscapularMm"]'::JSONB
  ) THEN
    RAISE EXCEPTION 'finalized correction did not preserve before/after/changedFields';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryAuditEvent"
    WHERE "assessmentId" = 'issue246-r2-correction'
      AND action = 'CORRECTION_FINALIZED'
      AND "actorUserId" = 'issue246-r2-actor'
      AND reason = 'Corrected measurement transcription'
  ) OR NOT EXISTS (
    SELECT 1 FROM "AdipometryAuditEvent"
    WHERE "assessmentId" = 'issue246-r2-draft'
      AND action = 'REVISION_SUPERSEDED'
      AND "actorUserId" = 'issue246-r2-actor'
  ) THEN
    RAISE EXCEPTION 'revision lifecycle audit evidence is incomplete';
  END IF;

  IF (SELECT id FROM "AdipometryCurrentAssessment"
      WHERE "rootAssessmentId" = 'issue246-r2-draft')
     IS DISTINCT FROM 'issue246-r2-correction' THEN
    RAISE EXCEPTION 'current revision view did not select R2';
  END IF;
END $$;
SQL
psql_file "$TMP_DIR/finalize-correction.sql" finalize-correction.sql

cat > "$TMP_DIR/start-cancelled-r3.sql" <<'SQL'
SELECT * FROM "startAdipometryCorrection"(
  'issue246-r2-cancelled-r3',
  'issue246-r2-correction',
  'OTHER',
  'Review opened and intentionally abandoned',
  'issue246-r2-actor',
  CURRENT_TIMESTAMP::timestamp
);
SQL
psql_file "$TMP_DIR/start-cancelled-r3.sql" start-cancelled-r3.sql

expect_failure \
  "no-op correction finalization" \
  "ADIPOMETRY_CORRECTION_NO_CHANGES" \
  "BEGIN; SELECT set_config('app.adipometry_actor_user_id','issue246-r2-actor',true); UPDATE \"AdipometryAssessment\" SET status='COMPLETED', \"calculationSnapshot\"=issue246_r2_snapshot('GUEDES_1991_ADULT_YOUNG',1,DATE '2026-07-31',70,51,20,14,56), \"updatedAt\"=CURRENT_TIMESTAMP WHERE id='issue246-r2-cancelled-r3'; COMMIT;"

cat > "$TMP_DIR/cancel-and-reopen.sql" <<'SQL'
SELECT "cancelAdipometryCorrection"(
  'issue246-r2-cancelled-r3',
  'No clinical change was required after review',
  'issue246-r2-actor',
  CURRENT_TIMESTAMP::timestamp
);

SELECT * FROM "startAdipometryCorrection"(
  'issue246-r2-cancelled-r4',
  'issue246-r2-correction',
  'OTHER',
  'Second review after a cancelled revision',
  'issue246-r2-actor',
  CURRENT_TIMESTAMP::timestamp
);
SELECT "cancelAdipometryCorrection"(
  'issue246-r2-cancelled-r4',
  'Review closed without replacing the current revision',
  'issue246-r2-actor',
  CURRENT_TIMESTAMP::timestamp
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryAssessment"
    WHERE id = 'issue246-r2-cancelled-r3'
      AND "revisionStatus" = 'CANCELLED'
      AND "revisionNumber" = 3
  ) OR NOT EXISTS (
    SELECT 1 FROM "AdipometryAssessment"
    WHERE id = 'issue246-r2-cancelled-r4'
      AND "revisionStatus" = 'CANCELLED'
      AND "revisionNumber" = 4
  ) THEN
    RAISE EXCEPTION 'cancelled revisions were not preserved or numbered monotonically';
  END IF;

  IF (SELECT id FROM "AdipometryCurrentAssessment"
      WHERE "rootAssessmentId" = 'issue246-r2-draft')
     IS DISTINCT FROM 'issue246-r2-correction' THEN
    RAISE EXCEPTION 'cancelled correction changed the current revision';
  END IF;
END $$;
SQL
psql_file "$TMP_DIR/cancel-and-reopen.sql" cancel-and-reopen.sql

cat > "$TMP_DIR/void-current.sql" <<'SQL'
SELECT "voidAdipometryAssessment"(
  'issue246-r2-correction',
  'Assessment linked to an invalid enrollment context',
  'issue246-r2-actor',
  CURRENT_TIMESTAMP::timestamp
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryAssessment"
    WHERE id = 'issue246-r2-correction'
      AND "revisionStatus" = 'VOIDED'
      AND "voidedByUserId" = 'issue246-r2-actor'
      AND NULLIF(BTRIM("voidReason"), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'current revision was not voided auditably';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "AdipometryCurrentAssessment"
    WHERE "rootAssessmentId" = 'issue246-r2-draft'
  ) THEN
    RAISE EXCEPTION 'voided chain still exposes a current clinical revision';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryAuditEvent"
    WHERE "assessmentId" = 'issue246-r2-correction'
      AND action = 'VOIDED'
      AND "actorUserId" = 'issue246-r2-actor'
  ) THEN
    RAISE EXCEPTION 'void audit event is missing';
  END IF;
END $$;
SQL
psql_file "$TMP_DIR/void-current.sql" void-current.sql

echo "positive-control OK: immutable revision chain, cancellation, current selection and voiding"

expect_failure \
  "audit event mutation" \
  "append-only" \
  "UPDATE \"AdipometryAuditEvent\" SET \"reason\"='forged' WHERE \"assessmentId\"='issue246-r2-correction';"

echo "adipometry foundation v2 verification OK"
