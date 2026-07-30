#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/training_system_test}"
BASE_URL="${BASE_URL%%\?*}"
SERVER_URL="${BASE_URL%/*}"
TEMP_DB="training_system_issue246_no_text_inference_${GITHUB_RUN_ID:-local}_$$"
TEMP_URL="${SERVER_URL}/${TEMP_DB}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  docker run --rm --network host postgres:16-alpine \
    psql "${SERVER_URL}/postgres" -v ON_ERROR_STOP=1 -X -q \
    -c "DROP DATABASE IF EXISTS \"${TEMP_DB}\" WITH (FORCE);" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

docker run --rm --network host postgres:16-alpine \
  psql "${SERVER_URL}/postgres" -v ON_ERROR_STOP=1 -X -q \
  -c "CREATE DATABASE \"${TEMP_DB}\";"

DATABASE_URL="$TEMP_URL" pnpm --filter @corrida/api exec prisma migrate deploy

cat > "$TMP_DIR/verify.sql" <<'SQL'
DO $$
DECLARE
  textual_definition JSONB := '{
    "population": {
      "sexCriteria": ["FEMALE"],
      "maturationCriteria": "Not required for this protocol"
    }
  }'::JSONB;
  explicit_definition JSONB := '{
    "population": {
      "sexCriteria": ["FEMALE"],
      "maturationCriteria": "Not required for this protocol",
      "maturationRule": {"mode": "NOT_REQUIRED"}
    }
  }'::JSONB;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'AdipometryProtocol_00_canonicalize_maturation_rule'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'negative-control failed: textual maturation trigger is installed';
  END IF;

  IF TO_REGPROCEDURE('"canonicalizeAdipometryLegacyMaturationRule"()') IS NOT NULL THEN
    RAISE EXCEPTION 'negative-control failed: textual maturation function is installed';
  END IF;

  IF COALESCE("isValidAdipometryCanonicalPopulation"(textual_definition), FALSE) THEN
    RAISE EXCEPTION 'negative-control failed: descriptive text satisfied the executable maturation contract';
  END IF;

  IF NOT COALESCE("isValidAdipometryCanonicalPopulation"(explicit_definition), FALSE) THEN
    RAISE EXCEPTION 'positive-control failed: explicit NOT_REQUIRED maturation rule was rejected';
  END IF;
END $$;
SQL

docker run --rm --network host \
  -v "$TMP_DIR:/work:ro" \
  postgres:16-alpine \
  psql "$TEMP_URL" -v ON_ERROR_STOP=1 -X -q -f /work/verify.sql

echo "negative-control OK: descriptive maturation text cannot become an executable rule"
echo "positive-control OK: explicit structured NOT_REQUIRED rule remains valid"
