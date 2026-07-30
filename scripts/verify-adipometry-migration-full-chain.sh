#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/training_system_test}"
BASE_URL="${BASE_URL%%\?*}"
SERVER_URL="${BASE_URL%/*}"
TEMP_DB="training_system_issue246_full_chain_${GITHUB_RUN_ID:-local}_$$"
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

is_adpt_migration() {
  case "$1" in
    20260730093000_add_adipometry_foundation|\
    20260730093100_add_adipometry_guards|\
    20260730093200_enforce_adipometry_tenant_scope|\
    20260730132000_harden_adipometry_foundation|\
    20260730141000_add_adipometry_relation_uniques|\
    20260730142000_add_adipometry_draft_date_overload|\
    20260730150000_fix_issue_246_audit_findings|\
    20260730170000_remediate_issue_246_audit_round_2)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

psql_command "${SERVER_URL}/postgres" "CREATE DATABASE \"${TEMP_DB}\";"

mkdir -p "$TMP_DIR/prisma/migrations"
cp "$ROOT_DIR/apps/api/prisma/schema.prisma" "$TMP_DIR/prisma/schema.prisma"
cp "$ROOT_DIR/apps/api/prisma/migrations/migration_lock.toml" "$TMP_DIR/prisma/migrations/migration_lock.toml"

while IFS= read -r migration_dir; do
  migration_name="$(basename "$migration_dir")"
  if is_adpt_migration "$migration_name"; then
    continue
  fi
  cp -R "$migration_dir" "$TMP_DIR/prisma/migrations/$migration_name"
done < <(find "$ROOT_DIR/apps/api/prisma/migrations" -mindepth 1 -maxdepth 1 -type d | sort)

# Build the true baseline first: all develop-era migrations, no ADPT migration.
DATABASE_URL="$TEMP_URL" pnpm --filter @corrida/api exec prisma migrate deploy \
  --schema "$TMP_DIR/prisma/schema.prisma"

cat > "$TMP_DIR/legacy.sql" <<'SQL'
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
    'issue246-full-chain-contract', contract_type, 'issue246-full-chain-document', 'Issue 246 full chain'
  );

  INSERT INTO "CollaboratorFunctionOption" (
    "id", "contractId", "name", "code", "isActive", "isSystem", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-full-chain-function', 'issue246-full-chain-contract', 'Issue 246 full chain',
    'ISSUE246-FULL-CHAIN', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  EXECUTE format(
    'INSERT INTO "User" ("id", "email", "passwordHash", "type", "createdAt", "updatedAt", "isActive")
     VALUES (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true)',
    'issue246-full-chain-user', 'issue246-full-chain@example.invalid', 'not-a-password', user_type
  );

  INSERT INTO "Professor" (
    "id", "userId", "contractId", "collaboratorFunctionId", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-full-chain-professor', 'issue246-full-chain-user', 'issue246-full-chain-contract',
    'issue246-full-chain-function', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  INSERT INTO "Aluno" ("id", "contractId", "createdAt", "updatedAt")
  VALUES ('issue246-full-chain-aluno', 'issue246-full-chain-contract', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  INSERT INTO "AnthropometryAssessment" (
    "id", "contractId", "alunoId", "professorId", "code", "assessmentDate", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-full-chain-anthro', 'issue246-full-chain-contract', 'issue246-full-chain-aluno',
    'issue246-full-chain-professor', 'ANT-FULL-CHAIN', DATE '2026-07-29', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );
END $$;

INSERT INTO "Bank" ("id", "code", "description", "createdAt", "updatedAt")
VALUES ('issue246-full-chain-bank', 'I246FC', 'Legacy row before every ADPT migration', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
SQL
psql_file "$TEMP_URL" "$TMP_DIR/legacy.sql" legacy.sql

# Apply the ADPT chain exactly in repository order. Insert a draft after the
# initial foundation to prove later hardening migrations preserve live ADPT data.
for migration_name in \
  20260730093000_add_adipometry_foundation \
  20260730093100_add_adipometry_guards \
  20260730093200_enforce_adipometry_tenant_scope
do
  psql_file \
    "$TEMP_URL" \
    "$ROOT_DIR/apps/api/prisma/migrations/$migration_name/migration.sql" \
    "$migration_name.sql"
done

cat > "$TMP_DIR/pre_hardening.sql" <<'SQL'
SELECT * FROM "createAdipometryDraft"(
  'issue246-full-chain-draft'::text,
  'issue246-full-chain-contract'::text,
  'issue246-full-chain-aluno'::text,
  'issue246-full-chain-professor'::text,
  TIMESTAMP '2026-07-30 00:00:00',
  CURRENT_TIMESTAMP::timestamp
);
SQL
psql_file "$TEMP_URL" "$TMP_DIR/pre_hardening.sql" pre_hardening.sql

for migration_name in \
  20260730132000_harden_adipometry_foundation \
  20260730141000_add_adipometry_relation_uniques \
  20260730142000_add_adipometry_draft_date_overload \
  20260730150000_fix_issue_246_audit_findings \
  20260730170000_remediate_issue_246_audit_round_2
do
  psql_file \
    "$TEMP_URL" \
    "$ROOT_DIR/apps/api/prisma/migrations/$migration_name/migration.sql" \
    "$migration_name.sql"
done

cat > "$TMP_DIR/verify.sql" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Bank"
    WHERE "id" = 'issue246-full-chain-bank'
      AND "description" = 'Legacy row before every ADPT migration'
  ) THEN
    RAISE EXCEPTION 'legacy unrelated data was not preserved through the full ADPT chain';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "AnthropometryAssessment"
    WHERE "id" = 'issue246-full-chain-anthro'
      AND "contractId" = 'issue246-full-chain-contract'
      AND "alunoId" = 'issue246-full-chain-aluno'
  ) THEN
    RAISE EXCEPTION 'legacy anthropometry data was not preserved through the full ADPT chain';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryAssessment"
    WHERE "id" = 'issue246-full-chain-draft'
      AND "status" = 'DRAFT'
      AND "code" = 'ADPT-001'
      AND "calculationSnapshot" IS NULL
  ) THEN
    RAISE EXCEPTION 'pre-hardening ADPT draft was not preserved';
  END IF;

  IF "formatAdipometryCode"(1000) <> 'ADPT-1000' THEN
    RAISE EXCEPTION 'minimum-width formatter was not installed';
  END IF;

  IF TO_REGPROCEDURE('"isValidAdipometryProtocolDefinition"(jsonb,text,timestamp without time zone)') IS NULL THEN
    RAISE EXCEPTION 'strict protocol validator was not installed';
  END IF;

  IF TO_REGPROCEDURE('"evaluateAdipometryExpression"(jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'executable equation evaluator was not installed';
  END IF;

  IF TO_REGPROCEDURE('"createAdipometryDraft"(text,text,text,text,date,text,timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'explicit actor draft overload was not installed';
  END IF;
END $$;
SQL
psql_file "$TEMP_URL" "$TMP_DIR/verify.sql" verify.sql

echo "adipometry full migration chain verification OK"
