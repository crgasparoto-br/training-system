#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/training_system_test}"
BASE_URL="${BASE_URL%%\?*}"
SERVER_URL="${BASE_URL%/*}"
TEMP_DB="training_system_issue246_profile_${GITHUB_RUN_ID:-local}_$$"
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
    'INSERT INTO "Contract" ("id", "type", "document", "name", "createdAt", "updatedAt")
     VALUES (%L, %L::"ContractType", %L, %L, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    'issue246-profile-contract', contract_type,
    'issue246-profile-document', 'Issue 246 canonical profile contract'
  );

  INSERT INTO "CollaboratorFunctionOption" (
    "id", "contractId", "name", "code", "isActive", "isSystem", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-profile-function', 'issue246-profile-contract',
    'Canonical profile evaluator', 'ISSUE246-PROFILE', true, false,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  EXECUTE format(
    'INSERT INTO "User" ("id", "email", "passwordHash", "type", "createdAt", "updatedAt", "isActive")
     VALUES (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true)',
    'issue246-profile-actor', 'issue246-profile-actor@example.invalid',
    'not-a-password', user_type
  );

  INSERT INTO "Professor" (
    "id", "userId", "contractId", "collaboratorFunctionId", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-profile-professor', 'issue246-profile-actor', 'issue246-profile-contract',
    'issue246-profile-function', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  UPDATE "Professor"
  SET "role" = 'master', "currentStatus" = 'active'
  WHERE "id" = 'issue246-profile-professor';

  INSERT INTO "Profile" (
    "id", "userId", "name", "cref", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-profile-user-profile', 'issue246-profile-actor',
    'Canonical profile evaluator', 'CREF-PROFILE-246',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  INSERT INTO "Aluno" (
    "id", "contractId", "birthDate", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-profile-aluno', 'issue246-profile-contract',
    TIMESTAMP '1996-07-31 00:00:00', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  INSERT INTO "StudentProfile" (
    "id", "alunoId", "contractId", "identificationData", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-profile-student', 'issue246-profile-aluno', 'issue246-profile-contract',
    '{"birthDate":"1996-07-31","gender":"female","maturation":"child"}'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );
END $$;

CREATE OR REPLACE FUNCTION issue246_profile_definition()
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT JSONB_BUILD_OBJECT(
    'schemaVersion', 2,
    'population', JSONB_BUILD_OBJECT(
      'ageMinYears', 18,
      'ageMaxYears', 65,
      'sexCriteria', JSONB_BUILD_ARRAY('FEMALE'),
      'maturationCriteria', 'Required canonical adult stage',
      'maturationRule', JSONB_BUILD_OBJECT(
        'mode', 'REQUIRED',
        'allowedValues', JSONB_BUILD_ARRAY('ADULT')
      )
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
          'profileCriteria', JSONB_BUILD_OBJECT('sex', 'FEMALE', 'maturation', 'ADULT'),
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
          'profileCriteria', JSONB_BUILD_OBJECT('sex', 'FEMALE', 'maturation', 'ADULT'),
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
      'approverUserId', 'issue246-profile-actor',
      'approvedAt', '2026-07-30T20:00:00Z',
      'approvalRecordId', 'issue246-profile-record',
      'artifactSha256', REPEAT('d', 64)
    )
  );
$$;
SQL
psql_file "$TMP_DIR/setup.sql" setup.sql

expect_failure \
  "lowercase protocol sex criteria" \
  "AdipometryProtocol_approval_check" \
  "INSERT INTO \"AdipometryProtocol\" (\"id\",\"code\",\"version\",\"name\",\"status\",\"definitionSnapshot\",\"reference\",\"approvedAt\",\"approvedByUserId\",\"createdAt\",\"updatedAt\") VALUES ('issue246-profile-lower-sex','LOWER_SEX',1,'Lower sex','APPROVED',jsonb_set(issue246_profile_definition(),'{population,sexCriteria}','[\"female\"]'::jsonb),'Reference',TIMESTAMP '2026-07-30 20:00:00','issue246-profile-actor',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);"

expect_failure \
  "missing structured maturation rule" \
  "AdipometryProtocol_approval_check" \
  "INSERT INTO \"AdipometryProtocol\" (\"id\",\"code\",\"version\",\"name\",\"status\",\"definitionSnapshot\",\"reference\",\"approvedAt\",\"approvedByUserId\",\"createdAt\",\"updatedAt\") VALUES ('issue246-profile-no-rule','NO_RULE',1,'No rule','APPROVED',issue246_profile_definition() #- '{population,maturationRule}','Reference',TIMESTAMP '2026-07-30 20:00:00','issue246-profile-actor',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);"

expect_failure \
  "expression references noncanonical profile field" \
  "AdipometryProtocol_approval_check" \
  "INSERT INTO \"AdipometryProtocol\" (\"id\",\"code\",\"version\",\"name\",\"status\",\"definitionSnapshot\",\"reference\",\"approvedAt\",\"approvedByUserId\",\"createdAt\",\"updatedAt\") VALUES ('issue246-profile-magic-field','MAGIC_FIELD',1,'Magic field','APPROVED',jsonb_set(issue246_profile_definition(),'{equations,0,expression}','{\"op\":\"ifEquals\",\"field\":\"profileCriteria.magic\",\"expected\":\"YES\",\"then\":{\"op\":\"constant\",\"value\":20},\"else\":{\"op\":\"constant\",\"value\":20}}'::jsonb),'Reference',TIMESTAMP '2026-07-30 20:00:00','issue246-profile-actor',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);"

expect_failure \
  "approval vector uses incompatible maturation" \
  "AdipometryProtocol_approval_check" \
  "INSERT INTO \"AdipometryProtocol\" (\"id\",\"code\",\"version\",\"name\",\"status\",\"definitionSnapshot\",\"reference\",\"approvedAt\",\"approvedByUserId\",\"createdAt\",\"updatedAt\") VALUES ('issue246-profile-bad-vector','BAD_VECTOR',1,'Bad vector','APPROVED',jsonb_set(issue246_profile_definition(),'{testVectors,1,inputs,profileCriteria,maturation}','\"CHILD\"'::jsonb),'Reference',TIMESTAMP '2026-07-30 20:00:00','issue246-profile-actor',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);"

cat > "$TMP_DIR/positive-protocol.sql" <<'SQL'
INSERT INTO "AdipometryProtocol" (
  "id", "code", "version", "name", "status", "definitionSnapshot", "reference",
  "approvedAt", "approvedByUserId", "createdAt", "updatedAt"
) VALUES (
  'issue246-profile-approved', 'CANONICAL_REQUIRED', 1,
  'Canonical required maturity', 'APPROVED', issue246_profile_definition(),
  'Versioned canonical profile reference', TIMESTAMP '2026-07-30 20:00:00',
  'issue246-profile-actor', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "AccessPermission" (
  id, "collaboratorFunctionId", "screenKey", "blockKey", "canView", "createdAt", "updatedAt"
) VALUES (
  'issue246-profile-explicit-clinical-grant', 'issue246-profile-function',
  'settings.contract', 'settings.contract.adipometryProtocolApproval', TRUE,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("collaboratorFunctionId", "screenKey", "blockKey")
DO UPDATE SET "canView" = TRUE, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "AdipometryClinicalResponsibility" (
  "id", "contractId", "domain", "professorId", "effectiveFrom",
  "designatedByUserId", "designatedAt", "createdAt", "updatedAt"
) VALUES (
  'issue246-profile-responsibility', 'issue246-profile-contract',
  'ADIPOMETRY_CLINICAL_RESPONSIBLE', 'issue246-profile-professor',
  TIMESTAMP '2026-07-30 19:00:00', 'issue246-profile-actor',
  TIMESTAMP '2026-07-30 19:00:00', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "AdipometryProtocolApproval" (
  "id", "contractId", "protocolId", "protocolCode", "protocolVersion",
  "responsibilityId", "approvedByProfessorId", "approvedByUserId", "approvedAt",
  "approvalStatement", "approvedByNameSnapshot", "approvedByCrefSnapshot",
  "approvedSpecificationHash", "protocolDefinitionSnapshot", "createdAt"
)
SELECT
  'issue246-profile-contract-approval', 'issue246-profile-contract',
  protocol."id", protocol."code", protocol."version",
  'issue246-profile-responsibility', 'issue246-profile-professor',
  'issue246-profile-actor', TIMESTAMP '2026-07-30 20:00:00',
  'Declaro que revisei e aprovo esta versão do protocolo para uso clínico neste contrato.',
  'Canonical profile evaluator', 'CREF-PROFILE-246', REPEAT('e', 64),
  protocol."definitionSnapshot", CURRENT_TIMESTAMP
FROM "AdipometryProtocol" protocol
WHERE protocol."id" = 'adpt_protocol_guedes_1991_adult_young_v1';

SELECT * FROM "createAdipometryDraft"(
  'issue246-profile-draft', 'issue246-profile-contract', 'issue246-profile-aluno',
  'issue246-profile-professor', DATE '2026-07-31',
  'issue246-profile-actor', CURRENT_TIMESTAMP
);
SQL
psql_file "$TMP_DIR/positive-protocol.sql" positive-protocol.sql

after_profile_update=$(cat <<'SQL'
BEGIN;
SELECT set_config('app.current_user_id', 'issue246-profile-actor', true);
UPDATE "AdipometryAssessment"
SET "status" = 'COMPLETED',
    "protocolSex" = 'female',
    "protocolSexSource" = 'professional_confirmation',
    "protocolSexConfirmedByUserId" = 'issue246-profile-actor',
    "protocolSexConfirmedAt" = CURRENT_TIMESTAMP,
    "weightKg" = 70,
    "tricepsMm" = 10,
    "subscapularMm" = 10,
    "suprailiacMm" = 10,
    "abdominalMm" = 10,
    "thighMm" = 10,
    "protocolId" = 'adpt_protocol_guedes_1991_adult_young_v1',
    "protocolCode" = 'GUEDES_1991_ADULT_YOUNG',
    "protocolVersion" = 1,
    "calculationSnapshot" = '{}'::jsonb
WHERE "id" = 'issue246-profile-draft';
COMMIT;
SQL
)
expect_failure \
  "canonical maturation is present but incompatible" \
  "ADIPOMETRY_MATURATION_NOT_APPLICABLE" \
  "$after_profile_update"

cat > "$TMP_DIR/complete.sql" <<'SQL'
UPDATE "StudentProfile"
SET "identificationData" = "identificationData" - 'maturation',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'issue246-profile-student';

BEGIN;
SELECT set_config('app.adipometry_actor_user_id', 'issue246-profile-actor', true);
UPDATE "AdipometryAssessment"
SET "status" = 'COMPLETED',
    "protocolSex" = 'female',
    "protocolSexSource" = 'professional_confirmation',
    "protocolSexConfirmedByUserId" = 'issue246-profile-actor',
    "protocolSexConfirmedAt" = CURRENT_TIMESTAMP,
    "weightKg" = 70,
    "tricepsMm" = 10,
    "subscapularMm" = 10,
    "suprailiacMm" = 10,
    "abdominalMm" = 10,
    "thighMm" = 10,
    "skinfoldTotalMm" = 999,
    "bodyFatPercentage" = 99,
    "fatMassKg" = 1,
    "leanMassKg" = 69,
    "protocolId" = 'adpt_protocol_guedes_1991_adult_young_v1',
    "protocolCode" = 'GUEDES_1991_ADULT_YOUNG',
    "protocolVersion" = 1,
    "calculationSnapshot" = '{"profileCriteria":{"sex":"OTHER","maturation":"FORGED"}}'::jsonb,
    "completedAt" = TIMESTAMP '2099-01-01 00:00:00',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'issue246-profile-draft';
COMMIT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "AdipometryAssessment"
    WHERE "id" = 'issue246-profile-draft'
      AND "status" = 'COMPLETED'
      AND "skinfoldTotalMm" = 30
      AND "bodyFatPercentage" = 16.03
      AND "fatMassKg" = 11.22
      AND "leanMassKg" = 58.78
      AND "calculationSnapshot" #>> '{profileCriteria,sex}' = 'FEMALE'
      AND "calculationSnapshot" #> '{profileCriteria,maturation}' = 'null'::jsonb
      AND "calculationSnapshot" #>> '{profileCriteria,sources,sex,kind}' = 'STUDENT_PROFILE'
      AND "calculationSnapshot" #> '{profileCriteria,sources,maturation}' = 'null'::jsonb
  ) THEN
    RAISE EXCEPTION 'canonical sex, maturation or calculated results were not persisted';
  END IF;
END $$;
SQL
psql_file "$TMP_DIR/complete.sql" complete.sql

echo "positive-control OK: canonical sex and maturation are normalized and enforced"
echo "adipometry canonical profile contract controls OK"
