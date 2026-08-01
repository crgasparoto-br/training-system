#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/training_system_test}"
BASE_URL="${BASE_URL%%\?*}"
SERVER_URL="${BASE_URL%/*}"
TEMP_DB="training_system_issue246_approval_lock_${GITHUB_RUN_ID:-local}_$$"
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

wait_for_marker() {
  local marker="$1"
  local process_id="$2"
  local output="$3"
  for _ in $(seq 1 600); do
    [[ -f "$marker" ]] && return 0
    if ! kill -0 "$process_id" 2>/dev/null; then
      wait "$process_id" || true
      cat "$output" >&2
      echo "Concurrency session exited before creating marker: $marker" >&2
      return 1
    fi
    sleep 0.05
  done
  cat "$output" >&2
  echo "Timed out waiting for concurrency marker: $marker" >&2
  return 1
}

docker run --rm --network host postgres:16-alpine \
  psql "${SERVER_URL}/postgres" -v ON_ERROR_STOP=1 -X -q \
  -c "CREATE DATABASE \"${TEMP_DB}\";"

DATABASE_URL="$TEMP_URL" pnpm --filter @corrida/api exec prisma migrate deploy

cat > "$TMP_DIR/setup.sql" <<'SQL'
BEGIN;

DO $$
DECLARE
  v_contract_type TEXT;
  v_user_type TEXT;
  v_protocol "AdipometryProtocol"%ROWTYPE;
BEGIN
  SELECT enumlabel INTO v_contract_type
  FROM pg_enum enum_row
  JOIN pg_type enum_type ON enum_type.oid = enum_row.enumtypid
  WHERE enum_type.typname = 'ContractType'
  ORDER BY enum_row.enumsortorder
  LIMIT 1;

  SELECT enumlabel INTO v_user_type
  FROM pg_enum enum_row
  JOIN pg_type enum_type ON enum_type.oid = enum_row.enumtypid
  WHERE enum_type.typname = 'UserType'
  ORDER BY enum_row.enumsortorder
  LIMIT 1;

  EXECUTE FORMAT(
    'INSERT INTO "Contract" (
       id, type, document, name, "createdAt", "updatedAt"
     ) VALUES (%L, %L::"ContractType", %L, %L, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    'issue246-concurrency-contract',
    v_contract_type,
    'issue246-concurrency-document',
    'Issue 246 approval concurrency'
  );

  INSERT INTO "CollaboratorFunctionOption" (
    id, "contractId", name, code, "isActive", "isSystem", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-concurrency-function',
    'issue246-concurrency-contract',
    'ADPT concurrency authority',
    'ISSUE246-CONCURRENCY',
    TRUE,
    FALSE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

  EXECUTE FORMAT(
    'INSERT INTO "User" (
       id, email, "passwordHash", type, "createdAt", "updatedAt", "isActive"
     ) VALUES
       (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE),
       (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE)',
    'issue246-concurrency-manager-user',
    'issue246-concurrency-manager@example.invalid',
    'not-a-password',
    v_user_type,
    'issue246-concurrency-responsible-user',
    'issue246-concurrency-responsible@example.invalid',
    'not-a-password',
    v_user_type
  );

  INSERT INTO "Professor" (
    id, "userId", "contractId", "collaboratorFunctionId",
    "currentStatus", "createdAt", "updatedAt"
  ) VALUES
    (
      'issue246-concurrency-manager-professor',
      'issue246-concurrency-manager-user',
      'issue246-concurrency-contract',
      'issue246-concurrency-function',
      'active',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'issue246-concurrency-responsible-professor',
      'issue246-concurrency-responsible-user',
      'issue246-concurrency-contract',
      'issue246-concurrency-function',
      'active',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );

  INSERT INTO "Profile" (
    id, "userId", name, cref, "createdAt", "updatedAt"
  ) VALUES
    (
      'issue246-concurrency-manager-profile',
      'issue246-concurrency-manager-user',
      'Gestor da responsabilidade ADPT',
      'CREF-CONCURRENCY-MANAGER',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'issue246-concurrency-responsible-profile',
      'issue246-concurrency-responsible-user',
      'Responsável clínico concorrente',
      'CREF-CONCURRENCY-RESPONSIBLE',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );

  INSERT INTO "AccessPermission" (
    id, "collaboratorFunctionId", "screenKey", "blockKey", "canView", "createdAt", "updatedAt"
  ) VALUES
    (
      'issue246-concurrency-manage-permission',
      'issue246-concurrency-function',
      'settings.contract',
      'settings.contract.actions.manageClinicalTechnicalResponsibility',
      TRUE,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'issue246-concurrency-approve-permission',
      'issue246-concurrency-function',
      'settings.contract',
      'settings.contract.adipometryProtocolApproval',
      TRUE,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  ON CONFLICT ("collaboratorFunctionId", "screenKey", "blockKey")
  DO UPDATE SET "canView" = TRUE, "updatedAt" = CURRENT_TIMESTAMP;

  PERFORM SET_CONFIG(
    'app.adipometry_actor_user_id',
    'issue246-concurrency-manager-user',
    TRUE
  );

  INSERT INTO "AdipometryClinicalResponsibility" (
    id,
    "contractId",
    domain,
    "professorId",
    "effectiveFrom",
    "designatedByUserId",
    "designatedAt",
    "createdAt",
    "updatedAt"
  ) VALUES (
    'issue246-concurrency-responsibility',
    'issue246-concurrency-contract',
    'ADIPOMETRY_CLINICAL_RESPONSIBLE',
    'issue246-concurrency-responsible-professor',
    CURRENT_TIMESTAMP,
    'issue246-concurrency-manager-user',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

  SELECT * INTO v_protocol
  FROM "AdipometryProtocol"
  WHERE code = 'GUEDES_1991_ADULT_YOUNG'
    AND version = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'canonical adipometry protocol is missing';
  END IF;

  PERFORM SET_CONFIG(
    'app.adipometry_actor_user_id',
    'issue246-concurrency-responsible-user',
    TRUE
  );

  INSERT INTO "AdipometryProtocolApproval" (
    id,
    "contractId",
    "protocolId",
    "protocolCode",
    "protocolVersion",
    "responsibilityId",
    "approvedByProfessorId",
    "approvedByUserId",
    "approvedAt",
    "approvalStatement",
    "approvedByNameSnapshot",
    "approvedByCrefSnapshot",
    "approvedSpecificationHash",
    "protocolDefinitionSnapshot",
    "createdAt"
  ) VALUES (
    'issue246-concurrency-approval-active',
    'issue246-concurrency-contract',
    v_protocol.id,
    v_protocol.code,
    v_protocol.version,
    'issue246-concurrency-responsibility',
    'issue246-concurrency-responsible-professor',
    'issue246-concurrency-responsible-user',
    CURRENT_TIMESTAMP,
    'Aprovação clínica vigente para o controle concorrente da Issue 246.',
    'Responsável clínico concorrente',
    'CREF-CONCURRENCY-RESPONSIBLE',
    "buildAdipometrySpecificationHash"(
      v_protocol.code,
      v_protocol.version,
      v_protocol.reference,
      v_protocol."definitionSnapshot"
    ),
    v_protocol."definitionSnapshot",
    CURRENT_TIMESTAMP
  );
END;
$$;

CREATE TABLE issue246_concurrency_probe (
  status TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "protocolId" TEXT NOT NULL,
  "protocolCode" TEXT NOT NULL,
  "protocolVersion" INTEGER NOT NULL,
  "calculationSnapshot" JSONB NOT NULL
);

CREATE TRIGGER issue246_concurrency_probe_trigger
BEFORE INSERT OR UPDATE OF
  status,
  "contractId",
  "protocolId",
  "protocolCode",
  "protocolVersion"
ON issue246_concurrency_probe
FOR EACH ROW
EXECUTE FUNCTION "bindActiveAdipometryApprovalSnapshot"();

COMMIT;
SQL
psql_file "$TMP_DIR/setup.sql" setup.sql

cat > "$TMP_DIR/assert-setup.sql" <<'SQL'
DO $$
DECLARE
  v_definition TEXT;
BEGIN
  IF TO_REGCLASS('issue246_concurrency_probe') IS NULL THEN
    RAISE EXCEPTION 'persistent concurrency probe table was not committed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "AdipometryProtocolApproval"
    WHERE id = 'issue246-concurrency-approval-active'
      AND "revokedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'active approval fixture was not committed';
  END IF;

  SELECT PG_GET_FUNCTIONDEF(
    '"bindActiveAdipometryApprovalSnapshot"()'::REGPROCEDURE
  ) INTO v_definition;

  IF v_definition NOT LIKE '%FOR SHARE OF approval%' THEN
    RAISE EXCEPTION 'active approval binder does not lock the selected approval row';
  END IF;
END;
$$;
SQL
psql_file "$TMP_DIR/assert-setup.sql" assert-setup.sql

# Interleaving 1: completion binds and locks the active approval first. A
# concurrent revocation must not overtake it.
cat > "$TMP_DIR/completion-first.sql" <<'SQL'
BEGIN;
INSERT INTO issue246_concurrency_probe (
  status, "contractId", "protocolId", "protocolCode", "protocolVersion", "calculationSnapshot"
)
SELECT
  'COMPLETED',
  'issue246-concurrency-contract',
  protocol.id,
  protocol.code,
  protocol.version,
  '{"probe":"completion-first"}'::JSONB
FROM "AdipometryProtocol" protocol
WHERE protocol.code = 'GUEDES_1991_ADULT_YOUNG'
  AND protocol.version = 1;
\! touch /work/completion-first.lock
SELECT PG_SLEEP(3);
COMMIT;
SQL

docker run --rm --network host \
  -v "$TMP_DIR:/work" \
  postgres:16-alpine \
  psql "$TEMP_URL" -v ON_ERROR_STOP=1 -X -q -f /work/completion-first.sql \
  >"$TMP_DIR/completion-first.out" 2>&1 &
completion_pid=$!
wait_for_marker \
  "$TMP_DIR/completion-first.lock" \
  "$completion_pid" \
  "$TMP_DIR/completion-first.out"

cat > "$TMP_DIR/revocation-must-wait.sql" <<'SQL'
BEGIN;
SET LOCAL lock_timeout = '500ms';
SELECT SET_CONFIG(
  'app.adipometry_actor_user_id',
  'issue246-concurrency-responsible-user',
  TRUE
);
UPDATE "AdipometryProtocolApproval"
SET "revokedAt" = CURRENT_TIMESTAMP,
    "revokedByProfessorId" = 'issue246-concurrency-responsible-professor',
    "revokedByUserId" = 'issue246-concurrency-responsible-user',
    "revocationReason" = 'Revogação concorrente deve aguardar a conclusão já vinculada.'
WHERE id = 'issue246-concurrency-approval-active';
COMMIT;
SQL

if psql_file "$TMP_DIR/revocation-must-wait.sql" revocation-must-wait.sql \
  >"$TMP_DIR/revocation-must-wait.out" 2>&1; then
  echo "Concurrent revocation overtook a completion that already bound the approval" >&2
  exit 1
fi
if ! grep -q 'lock timeout' "$TMP_DIR/revocation-must-wait.out"; then
  cat "$TMP_DIR/revocation-must-wait.out" >&2
  echo "Concurrent revocation failed for an unexpected reason" >&2
  exit 1
fi
wait "$completion_pid"

cat > "$TMP_DIR/revoke-and-reapprove.sql" <<'SQL'
BEGIN;
SELECT SET_CONFIG(
  'app.adipometry_actor_user_id',
  'issue246-concurrency-responsible-user',
  TRUE
);
UPDATE "AdipometryProtocolApproval"
SET "revokedAt" = CURRENT_TIMESTAMP,
    "revokedByProfessorId" = 'issue246-concurrency-responsible-professor',
    "revokedByUserId" = 'issue246-concurrency-responsible-user',
    "revocationReason" = 'Revogação posterior à conclusão serializada para preparar o segundo controle.'
WHERE id = 'issue246-concurrency-approval-active';

INSERT INTO "AdipometryProtocolApproval" (
  id, "contractId", "protocolId", "protocolCode", "protocolVersion",
  "responsibilityId", "approvedByProfessorId", "approvedByUserId", "approvedAt",
  "approvalStatement", "approvedByNameSnapshot", "approvedByCrefSnapshot",
  "approvedSpecificationHash", "protocolDefinitionSnapshot", "createdAt"
)
SELECT
  'issue246-concurrency-approval-reapproved',
  'issue246-concurrency-contract',
  protocol.id,
  protocol.code,
  protocol.version,
  'issue246-concurrency-responsibility',
  'issue246-concurrency-responsible-professor',
  'issue246-concurrency-responsible-user',
  CURRENT_TIMESTAMP,
  'Reaprovação clínica vigente para testar revogação que começa antes da conclusão.',
  'Responsável clínico concorrente',
  'CREF-CONCURRENCY-RESPONSIBLE',
  "buildAdipometrySpecificationHash"(
    protocol.code, protocol.version, protocol.reference, protocol."definitionSnapshot"
  ),
  protocol."definitionSnapshot",
  CURRENT_TIMESTAMP
FROM "AdipometryProtocol" protocol
WHERE protocol.code = 'GUEDES_1991_ADULT_YOUNG'
  AND protocol.version = 1;
COMMIT;
SQL
psql_file "$TMP_DIR/revoke-and-reapprove.sql" revoke-and-reapprove.sql

# Interleaving 2: revocation obtains the row lock first but remains uncommitted.
# Completion must wait and then fail after the revoked row becomes visible.
cat > "$TMP_DIR/revocation-first.sql" <<'SQL'
BEGIN;
SELECT SET_CONFIG(
  'app.adipometry_actor_user_id',
  'issue246-concurrency-responsible-user',
  TRUE
);
UPDATE "AdipometryProtocolApproval"
SET "revokedAt" = CURRENT_TIMESTAMP,
    "revokedByProfessorId" = 'issue246-concurrency-responsible-professor',
    "revokedByUserId" = 'issue246-concurrency-responsible-user',
    "revocationReason" = 'Revogação concorrente iniciada antes da tentativa de conclusão.'
WHERE id = 'issue246-concurrency-approval-reapproved';
\! touch /work/revocation-first.lock
SELECT PG_SLEEP(3);
COMMIT;
SQL

docker run --rm --network host \
  -v "$TMP_DIR:/work" \
  postgres:16-alpine \
  psql "$TEMP_URL" -v ON_ERROR_STOP=1 -X -q -f /work/revocation-first.sql \
  >"$TMP_DIR/revocation-first.out" 2>&1 &
revocation_pid=$!
wait_for_marker \
  "$TMP_DIR/revocation-first.lock" \
  "$revocation_pid" \
  "$TMP_DIR/revocation-first.out"

cat > "$TMP_DIR/completion-must-fail.sql" <<'SQL'
SET statement_timeout = '10s';
INSERT INTO issue246_concurrency_probe (
  status, "contractId", "protocolId", "protocolCode", "protocolVersion", "calculationSnapshot"
)
SELECT
  'COMPLETED',
  'issue246-concurrency-contract',
  protocol.id,
  protocol.code,
  protocol.version,
  '{"probe":"revocation-first"}'::JSONB
FROM "AdipometryProtocol" protocol
WHERE protocol.code = 'GUEDES_1991_ADULT_YOUNG'
  AND protocol.version = 1;
SQL

if psql_file "$TMP_DIR/completion-must-fail.sql" completion-must-fail.sql \
  >"$TMP_DIR/completion-must-fail.out" 2>&1; then
  echo "Completion succeeded after a concurrent revocation had already started" >&2
  exit 1
fi
wait "$revocation_pid"
if ! grep -q 'ADIPOMETRY_PROTOCOL_NOT_APPROVED_FOR_CONTRACT' \
  "$TMP_DIR/completion-must-fail.out"; then
  cat "$TMP_DIR/completion-must-fail.out" >&2
  echo "Completion did not fail with the expected approval error" >&2
  exit 1
fi

cat > "$TMP_DIR/assert-final-state.sql" <<'SQL'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM issue246_concurrency_probe
    WHERE "calculationSnapshot" #>> '{probe}' = 'revocation-first'
  ) THEN
    RAISE EXCEPTION 'failed concurrent completion left a persisted probe row';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "AdipometryProtocolApproval"
    WHERE "contractId" = 'issue246-concurrency-contract'
      AND "protocolCode" = 'GUEDES_1991_ADULT_YOUNG'
      AND "protocolVersion" = 1
      AND "revokedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'revocation-first control left an active approval unexpectedly';
  END IF;
END;
$$;
SQL
psql_file "$TMP_DIR/assert-final-state.sql" assert-final-state.sql

echo "adipometry approval revocation concurrency control OK"
