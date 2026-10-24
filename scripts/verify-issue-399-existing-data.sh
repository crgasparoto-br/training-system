#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$ROOT_DIR/apps/api/prisma/migrations"
REPLAY_DIR="$(mktemp -d "${TMPDIR:-/tmp}/issue399-existing-data.XXXXXX")"
DB_URL="${DATABASE_URL%%\?*}"
SCHEMA_FILE="$REPLAY_DIR/schema.prisma"
REPLAY_MIGRATIONS="$REPLAY_DIR/migrations"

cleanup() {
  rm -rf "$REPLAY_DIR"
}
trap cleanup EXIT

mkdir -p "$REPLAY_MIGRATIONS"
cp "$ROOT_DIR/apps/api/prisma/schema.prisma" "$SCHEMA_FILE"

copy_migrations_before_issue399() {
  local migration migration_name
  for migration in "$MIGRATIONS_DIR"/*; do
    migration_name="$(basename "$migration")"
    if [[ "$migration_name" < "20261021200000_issue_399_legacy_release_immutability" ]]; then
      cp -R "$migration" "$REPLAY_MIGRATIONS/"
    fi
  done
}

copy_migrations_after_issue399() {
  local migration migration_name
  for migration in "$MIGRATIONS_DIR"/*; do
    migration_name="$(basename "$migration")"
    if ! [[ "$migration_name" < "20261021200000_issue_399_legacy_release_immutability" ]]; then
      cp -R "$migration" "$REPLAY_MIGRATIONS/"
    fi
  done
}

copy_migrations_before_issue399
DATABASE_URL="$DATABASE_URL" pnpm --filter @corrida/api exec prisma migrate deploy --schema "$SCHEMA_FILE"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/scripts/seed-issue-399-legacy-data.sql"
copy_migrations_after_issue399
DATABASE_URL="$DATABASE_URL" pnpm --filter @corrida/api exec prisma migrate deploy --schema "$SCHEMA_FILE"

psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF (SELECT count(*) FROM "WorkoutTemplate" WHERE "id" = 'issue399-legacy-template') <> 1 THEN
    RAISE EXCEPTION 'legacy workout template was not preserved';
  END IF;
  IF (SELECT count(*) FROM "WorkoutDay" WHERE "id" = 'issue399-legacy-day') <> 1 THEN
    RAISE EXCEPTION 'legacy workout day was not preserved';
  END IF;
  IF (SELECT count(*) FROM "WorkoutExercise" WHERE "id" = 'issue399-legacy-workout-exercise') <> 1 THEN
    RAISE EXCEPTION 'legacy workout exercise was not preserved';
  END IF;
  IF (SELECT count(*) FROM "WorkoutExecution" WHERE "id" = 'issue399-legacy-execution') <> 1 THEN
    RAISE EXCEPTION 'legacy workout execution was not preserved';
  END IF;
  IF to_regclass('public."WorkoutExerciseBlock"') IS NULL
    OR to_regclass('public."WorkoutExercisePlannedSet"') IS NULL THEN
    RAISE EXCEPTION 'issue 399 resistance block tables were not installed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'WorkoutSessionExecutionItem' AND column_name = 'plannedSetId'
  ) THEN
    RAISE EXCEPTION 'issue 399 plannedSetId column was not installed';
  END IF;
END $$;
SQL

echo "Issue #399 existing-data migration replay passed."
