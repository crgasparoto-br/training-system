#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/training_system_test}"
BASE_URL="${BASE_URL%%\?*}"
SERVER_URL="${BASE_URL%/*}"
TEMP_DB="training_system_issue246_existing_${GITHUB_RUN_ID:-local}_$$"
TEMP_URL="${SERVER_URL}/${TEMP_DB}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  docker run --rm --network host postgres:16-alpine \
    psql "${SERVER_URL}/postgres" -v ON_ERROR_STOP=1 -X -q \
    -c "DROP DATABASE IF EXISTS \"${TEMP_DB}\" WITH (FORCE);" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

psql_command() {
  local database_url="$1"
  local statement="$2"
  docker run --rm --network host postgres:16-alpine \
    psql "$database_url" -v ON_ERROR_STOP=1 -X -q -c "$statement"
}

psql_file() {
  local database_url="$1"
  local host_path="$2"
  local mounted_name="$3"
  docker run --rm --network host \
    -v "$host_path:/work/$mounted_name:ro" \
    postgres:16-alpine \
    psql "$database_url" -v ON_ERROR_STOP=1 -X -q -f "/work/$mounted_name"
}

psql_command "${SERVER_URL}/postgres" "CREATE DATABASE \"${TEMP_DB}\";"

mkdir -p "$TMP_DIR/prisma/migrations"
cp "$ROOT_DIR/apps/api/prisma/schema.prisma" "$TMP_DIR/prisma/schema.prisma"
cp "$ROOT_DIR/apps/api/prisma/migrations/migration_lock.toml" "$TMP_DIR/prisma/migrations/migration_lock.toml"

while IFS= read -r migration_dir; do
  migration_name="$(basename "$migration_dir")"
  if [[ "$migration_name" == "20260730132000_harden_adipometry_foundation" ]]; then
    continue
  fi
  cp -R "$migration_dir" "$TMP_DIR/prisma/migrations/$migration_name"
done < <(find "$ROOT_DIR/apps/api/prisma/migrations" -mindepth 1 -maxdepth 1 -type d | sort)

DATABASE_URL="$TEMP_URL" pnpm --filter @corrida/api exec prisma migrate deploy \
  --schema "$TMP_DIR/prisma/schema.prisma"

cat > "$TMP_DIR/preexisting.sql" <<'SQL'
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
    'issue246-existing-contract', contract_type, 'issue246-existing-document', 'Issue 246 existing data'
  );

  INSERT INTO "CollaboratorFunctionOption" (
    "id", "contractId", "name", "code", "isActive", "isSystem", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-existing-function', 'issue246-existing-contract', 'Issue 246 existing',
    'ISSUE246-EXISTING', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  EXECUTE format(
    'INSERT INTO "User" ("id", "email", "passwordHash", "type", "createdAt", "updatedAt", "isActive")
     VALUES (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true)',
    'issue246-existing-user', 'issue246-existing@example.invalid', 'not-a-password', user_type
  );

  INSERT INTO "Professor" (
    "id", "userId", "contractId", "collaboratorFunctionId", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-existing-professor', 'issue246-existing-user', 'issue246-existing-contract',
    'issue246-existing-function', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  INSERT INTO "Aluno" ("id", "contractId", "createdAt", "updatedAt")
  VALUES ('issue246-existing-aluno', 'issue246-existing-contract', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
END $$;

INSERT INTO "Bank" ("id", "code", "description", "createdAt", "updatedAt")
VALUES ('issue246-existing-bank', 'I246', 'Preexisting unrelated row', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

SELECT * FROM "createAdipometryDraft"(
  'issue246-existing-draft',
  'issue246-existing-contract',
  'issue246-existing-aluno',
  'issue246-existing-professor',
  DATE '2026-07-29',
  CURRENT_TIMESTAMP
);
SQL
psql_file "$TEMP_URL" "$TMP_DIR/preexisting.sql" preexisting.sql

psql_file \
  "$TEMP_URL" \
  "$ROOT_DIR/apps/api/prisma/migrations/20260730132000_harden_adipometry_foundation/migration.sql" \
  hardening.sql

cat > "$TMP_DIR/verify.sql" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Bank"
    WHERE "id" = 'issue246-existing-bank' AND "description" = 'Preexisting unrelated row'
  ) THEN
    RAISE EXCEPTION 'preexisting unrelated data was not preserved';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryAssessment"
    WHERE "id" = 'issue246-existing-draft'
      AND "status" = 'DRAFT'
      AND "code" = 'ADPT-001'
  ) THEN
    RAISE EXCEPTION 'preexisting ADPT draft was not preserved';
  END IF;

  IF "formatAdipometryCode"(1000) <> 'ADPT-1000' THEN
    RAISE EXCEPTION 'minimum-width formatter was not installed';
  END IF;
END $$;
SQL
psql_file "$TEMP_URL" "$TMP_DIR/verify.sql" verify.sql

echo "adipometry migration existing-data verification OK"
