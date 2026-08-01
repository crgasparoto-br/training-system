#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/training_system_test}"
BASE_URL="${BASE_URL%%\?*}"
SERVER_URL="${BASE_URL%/*}"
TEMP_DB="training_system_issue246_approval_lock_${GITHUB_RUN_ID:-local}_$$"
TEMP_URL="${SERVER_URL}/${TEMP_DB}"
TMP_DIR="$(mktemp -d)"
PATCHED_FIXTURE="$TMP_DIR/verify-adipometry-active-approval-snapshot.sh"

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

# Reuse the established lifecycle fixture, but keep its rows committed and its
# probe table visible to the independent PostgreSQL sessions below.
cp "$ROOT_DIR/scripts/verify-adipometry-active-approval-snapshot.sh" "$PATCHED_FIXTURE"
python3 - "$PATCHED_FIXTURE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()

if text.count('CREATE TEMP TABLE issue246_active_snapshot_probe') != 1:
    raise SystemExit('active snapshot probe table marker not found exactly once')
text = text.replace(
    'CREATE TEMP TABLE issue246_active_snapshot_probe',
    'CREATE TABLE issue246_active_snapshot_probe',
    1,
)

start_marker = '''UPDATE "AdipometryProtocolApproval"
SET "revokedAt" = CURRENT_TIMESTAMP,
    "revokedByProfessorId" = 'issue246-active-snapshot-responsible-current-professor' '''
start = text.find(start_marker)
end = text.find('\nROLLBACK;\nSQL', start)
if start < 0 or end < 0:
    raise SystemExit('active approval final revocation marker not found')

# Remove the final sequential revocation control. The concurrency verifier needs
# the second approval to remain active after setup.
text = text[:start] + 'COMMIT;' + text[end + len('\nROLLBACK;'):]

if 'ROLLBACK;' in text:
    raise SystemExit('patched fixture still contains a transaction rollback')
if 'CREATE TEMP TABLE issue246_active_snapshot_probe' in text:
    raise SystemExit('patched fixture still creates a session-local probe table')
if text.count('CREATE TABLE issue246_active_snapshot_probe') != 1:
    raise SystemExit('patched fixture does not create exactly one persistent probe table')

path.write_text(text)
PY

DATABASE_URL="$TEMP_URL" bash "$PATCHED_FIXTURE"

cat > "$TMP_DIR/assert-fixture.sql" <<'SQL'
DO $$
BEGIN
  IF TO_REGCLASS('issue246_active_snapshot_probe') IS NULL THEN
    RAISE EXCEPTION 'persistent active snapshot probe table was not committed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "AdipometryProtocolApproval"
    WHERE id = 'issue246-active-snapshot-approval-current'
      AND "revokedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'active approval fixture was not committed';
  END IF;
END;
$$;
SQL
psql_file "$TMP_DIR/assert-fixture.sql" assert-fixture.sql

cat > "$TMP_DIR/assert-lock.sql" <<'SQL'
DO $$
DECLARE
  v_definition TEXT;
BEGIN
  SELECT PG_GET_FUNCTIONDEF(
    '"bindActiveAdipometryApprovalSnapshot"()'::REGPROCEDURE
  ) INTO v_definition;

  IF v_definition NOT LIKE '%FOR SHARE OF approval%' THEN
    RAISE EXCEPTION 'active approval binder does not lock the selected approval row';
  END IF;
END;
$$;
SQL
psql_file "$TMP_DIR/assert-lock.sql" assert-lock.sql

# Interleaving 1: completion binds and locks the active approval first. A
# concurrent revocation must not overtake it.
cat > "$TMP_DIR/completion-first.sql" <<'SQL'
BEGIN;
INSERT INTO issue246_active_snapshot_probe (
  status, "contractId", "protocolId", "protocolCode", "protocolVersion", "calculationSnapshot"
)
SELECT
  'COMPLETED',
  'issue246-active-snapshot-contract',
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
SET lock_timeout = '500ms';
UPDATE "AdipometryProtocolApproval"
SET "revokedAt" = CURRENT_TIMESTAMP,
    "revokedByProfessorId" = 'issue246-active-snapshot-responsible-current-professor',
    "revokedByUserId" = 'issue246-active-snapshot-responsible-current-user',
    "revocationReason" = 'Revogação concorrente deve aguardar a conclusão já vinculada.'
WHERE id = 'issue246-active-snapshot-approval-current';
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
UPDATE "AdipometryProtocolApproval"
SET "revokedAt" = CURRENT_TIMESTAMP,
    "revokedByProfessorId" = 'issue246-active-snapshot-responsible-current-professor',
    "revokedByUserId" = 'issue246-active-snapshot-responsible-current-user',
    "revocationReason" = 'Revogação posterior à conclusão serializada para preparar o segundo controle.'
WHERE id = 'issue246-active-snapshot-approval-current';

INSERT INTO "AdipometryProtocolApproval" (
  id, "contractId", "protocolId", "protocolCode", "protocolVersion",
  "responsibilityId", "approvedByProfessorId", "approvedByUserId", "approvedAt",
  "approvalStatement", "approvedByNameSnapshot", "approvedByCrefSnapshot",
  "approvedSpecificationHash", "protocolDefinitionSnapshot", "createdAt"
)
SELECT
  'issue246-active-snapshot-approval-concurrent',
  'issue246-active-snapshot-contract',
  protocol.id,
  protocol.code,
  protocol.version,
  'issue246-active-snapshot-responsibility-current',
  'issue246-active-snapshot-responsible-current-professor',
  'issue246-active-snapshot-responsible-current-user',
  CURRENT_TIMESTAMP,
  'Reaprovação clínica vigente para testar revogação que começa antes da conclusão.',
  'Responsável clínico vigente',
  'CREF-ACTIVE-SNAPSHOT-CURRENT',
  "buildAdipometrySpecificationHash"(
    protocol.code, protocol.version, protocol.reference, protocol."definitionSnapshot"
  ),
  protocol."definitionSnapshot",
  CURRENT_TIMESTAMP
FROM "AdipometryProtocol" protocol
WHERE protocol.code = 'GUEDES_1991_ADULT_YOUNG'
  AND protocol.version = 1;
SQL
psql_file "$TMP_DIR/revoke-and-reapprove.sql" revoke-and-reapprove.sql

# Interleaving 2: revocation obtains the row lock first but remains uncommitted.
# Completion must wait and then fail after the revoked row becomes visible.
cat > "$TMP_DIR/revocation-first.sql" <<'SQL'
BEGIN;
UPDATE "AdipometryProtocolApproval"
SET "revokedAt" = CURRENT_TIMESTAMP,
    "revokedByProfessorId" = 'issue246-active-snapshot-responsible-current-professor',
    "revokedByUserId" = 'issue246-active-snapshot-responsible-current-user',
    "revocationReason" = 'Revogação concorrente iniciada antes da tentativa de conclusão.'
WHERE id = 'issue246-active-snapshot-approval-concurrent';
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
INSERT INTO issue246_active_snapshot_probe (
  status, "contractId", "protocolId", "protocolCode", "protocolVersion", "calculationSnapshot"
)
SELECT
  'COMPLETED',
  'issue246-active-snapshot-contract',
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
    FROM issue246_active_snapshot_probe
    WHERE "calculationSnapshot" #>> '{probe}' = 'revocation-first'
  ) THEN
    RAISE EXCEPTION 'failed concurrent completion left a persisted probe row';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "AdipometryProtocolApproval"
    WHERE "contractId" = 'issue246-active-snapshot-contract'
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
