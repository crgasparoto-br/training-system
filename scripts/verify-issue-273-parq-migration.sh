#!/usr/bin/env bash
set -euo pipefail

readonly DB_NAME="training_system_issue_273_audit"
readonly TARGET_MIGRATION="20260725201000_issue_273_canonical_parq"
readonly ROOT_DIR="${GITHUB_WORKSPACE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

psql_admin() {
  docker run --rm --network host \
    -v "$ROOT_DIR:/workspace" \
    -e PGPASSWORD="${PGPASSWORD:-postgres}" \
    postgres:16-alpine \
    psql -h localhost -U "${PGUSER:-postgres}" -d "${1}" -v ON_ERROR_STOP=1 "${@:2}"
}

psql_admin_stdin() {
  docker run --rm -i --network host \
    -v "$ROOT_DIR:/workspace" \
    -e PGPASSWORD="${PGPASSWORD:-postgres}" \
    postgres:16-alpine \
    psql -h localhost -U "${PGUSER:-postgres}" -d "${1}" -v ON_ERROR_STOP=1 "${@:2}"
}

cleanup() {
  psql_admin postgres -c "DROP DATABASE IF EXISTS \"${DB_NAME}\" WITH (FORCE);" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
psql_admin postgres -c "CREATE DATABASE \"${DB_NAME}\";"

while IFS= read -r migration; do
  migration_name="$(basename "$(dirname "$migration")")"
  if [[ "$migration_name" == "$TARGET_MIGRATION" ]]; then
    break
  fi
  relative_path="${migration#"$ROOT_DIR/"}"
  psql_admin "$DB_NAME" -f "/workspace/${relative_path}" >/dev/null
done < <(find "$ROOT_DIR/apps/api/prisma/migrations" -mindepth 2 -maxdepth 2 -name migration.sql | sort)

psql_admin_stdin "$DB_NAME" <<'SQL'
INSERT INTO "Contract" ("id", "type", "document", "name", "createdAt", "updatedAt")
VALUES ('issue-273-contract', 'academy', 'issue-273-contract-document', 'Academia Issue 273', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Aluno" ("id", "contractId", "status", "leadName", "createdAt", "updatedAt", "lastActivityAt") VALUES
  ('issue-273-aif-import', 'issue-273-contract', 'PRE_REGISTRATION_COMPLETED', 'AIF importável', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('issue-273-shi-import', 'issue-273-contract', 'PRE_REGISTRATION_COMPLETED', 'SHI importável', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('issue-273-equivalent', 'issue-273-contract', 'PRE_REGISTRATION_COMPLETED', 'Equivalente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('issue-273-divergent', 'issue-273-contract', 'PRE_REGISTRATION_COMPLETED', 'Divergente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('issue-273-incomplete', 'issue-273-contract', 'PRE_REGISTRATION_COMPLETED', 'Incompleto', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('issue-273-no-date', 'issue-273-contract', 'PRE_REGISTRATION_COMPLETED', 'Sem data', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('issue-273-canonical', 'issue-273-contract', 'PRE_REGISTRATION_COMPLETED', 'Canônico', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('issue-273-canonical-legacy', 'issue-273-contract', 'PRE_REGISTRATION_COMPLETED', 'Canônico legado', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "StudentOnboardingProcess" ("id", "alunoId", "contractId", "createdAt", "updatedAt")
SELECT 'onboarding-' || "id", "id", "contractId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Aluno" WHERE "id" LIKE 'issue-273-%';

INSERT INTO "AlunoIntakeForm" ("id", "alunoId", "assessmentDate", "parqResponses", "createdAt", "updatedAt") VALUES
  ('aif-import', 'issue-273-aif-import', '2026-01-10', '{"q1":true,"q2":false,"q3":false,"q4":false,"q5":false,"q6":false,"q7":false,"q8":true}'::jsonb, '2026-01-10', '2026-01-11'),
  ('aif-equivalent', 'issue-273-equivalent', '2026-02-10', '{"q1":false,"q2":false,"q3":false,"q4":false,"q5":false,"q6":false,"q7":false,"q8":true}'::jsonb, '2026-02-10', '2026-02-11'),
  ('aif-divergent', 'issue-273-divergent', '2026-03-10', '{"q1":true,"q2":false,"q3":false,"q4":false,"q5":false,"q6":false,"q7":false,"q8":true}'::jsonb, '2026-03-10', '2026-03-11'),
  ('aif-incomplete', 'issue-273-incomplete', '2026-04-10', '{"q1":false,"q2":false,"q3":false,"q4":false,"q5":false,"q6":false,"q7":false}'::jsonb, '2026-04-10', '2026-04-11'),
  ('aif-no-date', 'issue-273-no-date', NULL, '{"q1":false,"q2":false,"q3":false,"q4":false,"q5":false,"q6":false,"q7":false,"q8":true}'::jsonb, '2026-05-10', '2026-05-11');

INSERT INTO "StudentHealthIntake" (
  "id", "alunoId", "contractId", "sourceType", "assessmentDate", "questionnaireParq", "createdAt", "updatedAt"
) VALUES
  ('shi-import', 'issue-273-shi-import', 'issue-273-contract', 'student', '2026-01-20', '{"q1":false,"q2":false,"q3":false,"q4":false,"q5":false,"q6":false,"q7":false,"q8":true}'::jsonb, '2026-01-20', '2026-01-21'),
  ('shi-divergent', 'issue-273-divergent', 'issue-273-contract', 'student', '2026-03-10', '{"q1":false,"q2":false,"q3":false,"q4":false,"q5":false,"q6":false,"q7":false,"q8":true}'::jsonb, '2026-03-10', '2026-03-11');

INSERT INTO "StudentParqSubmission" (
  "id", "alunoId", "contractId", "sourceType", "submittedAt", "responses", "positiveItems", "declarationAccepted", "createdAt", "updatedAt"
) VALUES
  ('existing-equivalent', 'issue-273-equivalent', 'issue-273-contract', 'student', '2026-02-10', '{"q1":false,"q2":false,"q3":false,"q4":false,"q5":false,"q6":false,"q7":false}'::jsonb, '[]'::jsonb, true, '2026-02-10', '2026-02-10'),
  ('existing-canonical', 'issue-273-canonical', 'issue-273-contract', 'student', '2026-06-10', '{"q1":false,"q2":false,"q3":false,"q4":false,"q5":false,"q6":false,"q7":false}'::jsonb, '[]'::jsonb, true, '2026-06-10', '2026-06-10'),
  ('existing-legacy-eight', 'issue-273-canonical-legacy', 'issue-273-contract', 'student', '2026-06-20', '{"q1":false,"q2":true,"q3":false,"q4":false,"q5":false,"q6":false,"q7":false,"q8":true}'::jsonb, '[{"key":"q2","label":"Dor no peito"}]'::jsonb, true, '2026-06-20', '2026-06-20');
SQL

psql_admin "$DB_NAME" -f "/workspace/apps/api/prisma/migrations/${TARGET_MIGRATION}/migration.sql" >/dev/null

psql_admin_stdin "$DB_NAME" <<'SQL'
DO $$
DECLARE
  imported_aif record;
  imported_shi record;
  existing_legacy record;
BEGIN
  SELECT * INTO imported_aif FROM "StudentParqSubmission" WHERE "legacySourceType" = 'AlunoIntakeForm' AND "legacySourceId" = 'aif-import';
  IF imported_aif."id" IS NULL OR imported_aif."catalogVersion" <> 'parq-legacy-8-declaration-v1' THEN
    RAISE EXCEPTION 'AIF importable record was not migrated';
  END IF;
  IF imported_aif."responses" ? 'q8' OR imported_aif."positiveCount" <> 1 THEN
    RAISE EXCEPTION 'AIF declaration leaked or positives were miscalculated';
  END IF;

  SELECT * INTO imported_shi FROM "StudentParqSubmission" WHERE "legacySourceType" = 'StudentHealthIntake' AND "legacySourceId" = 'shi-import';
  IF imported_shi."id" IS NULL OR imported_shi."positiveCount" <> 0 THEN
    RAISE EXCEPTION 'SHI importable record was not migrated correctly';
  END IF;

  IF (SELECT COUNT(*) FROM "StudentParqSubmission" WHERE "alunoId" = 'issue-273-equivalent') <> 1 THEN
    RAISE EXCEPTION 'equivalent source duplicated canonical history';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "StudentParqLegacyRecord"
    WHERE "sourceId" = 'aif-equivalent' AND "migrationStatus" = 'DUPLICATE_EQUIVALENT' AND "mappedSubmissionId" = 'existing-equivalent'
  ) THEN RAISE EXCEPTION 'equivalent source was not reconciled'; END IF;

  IF (SELECT COUNT(*) FROM "StudentParqLegacyRecord" WHERE "alunoId" = 'issue-273-divergent' AND "migrationStatus" = 'DIVERGENT') <> 2 THEN
    RAISE EXCEPTION 'divergent sources were not preserved';
  END IF;
  IF EXISTS (SELECT 1 FROM "StudentParqSubmission" WHERE "alunoId" = 'issue-273-divergent') THEN
    RAISE EXCEPTION 'divergent source created a false submission';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "StudentParqLegacyRecord" WHERE "sourceId" = 'aif-incomplete' AND "migrationStatus" = 'INCOMPATIBLE' AND "migrationReason" = 'incomplete_question_set') THEN
    RAISE EXCEPTION 'incomplete source was not preserved as incompatible';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "StudentParqLegacyRecord" WHERE "sourceId" = 'aif-no-date' AND "migrationStatus" = 'INCOMPATIBLE' AND "migrationReason" = 'missing_observed_at' AND "observedAt" IS NULL) THEN
    RAISE EXCEPTION 'missing timestamp was fabricated or not classified';
  END IF;

  IF (SELECT "catalogVersion" FROM "StudentParqSubmission" WHERE "id" = 'existing-canonical') <> 'parq-2026-01' THEN
    RAISE EXCEPTION 'existing seven-question history was reclassified incorrectly';
  END IF;
  SELECT * INTO existing_legacy FROM "StudentParqSubmission" WHERE "id" = 'existing-legacy-eight';
  IF existing_legacy."catalogVersion" <> 'parq-legacy-8-declaration-v1' OR existing_legacy."responses" ? 'q8' OR existing_legacy."positiveCount" <> 1 THEN
    RAISE EXCEPTION 'existing eight-key history was not normalized safely';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "StudentParqProfessionalReview" WHERE "submissionId" = imported_aif."id" AND "status" = 'PENDING') THEN
    RAISE EXCEPTION 'positive imported submission lacks professional review';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "StudentParqProfessionalReview" WHERE "submissionId" = 'existing-legacy-eight' AND "status" = 'PENDING') THEN
    RAISE EXCEPTION 'positive canonical history lacks professional review';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "StudentOnboardingProcess"
    WHERE "alunoId" = 'issue-273-aif-import' AND ("parqSubmissionId" IS NULL OR "parqModuleStatus" <> 'COMPLETED')
  ) THEN RAISE EXCEPTION 'onboarding reference/state was not synchronized'; END IF;
  IF NOT (SELECT "parqRequiresProfessionalReview" FROM "Aluno" WHERE "id" = 'issue-273-aif-import') THEN
    RAISE EXCEPTION 'review projection was not synchronized';
  END IF;
END $$;
SQL

psql_admin "$DB_NAME" -f "/workspace/apps/api/prisma/migrations/${TARGET_MIGRATION}/migration.sql" >/dev/null

psql_admin "$DB_NAME" -Atc \
  "SELECT CASE WHEN (SELECT COUNT(*) FROM \"StudentParqSubmission\" WHERE \"alunoId\" LIKE 'issue-273-%') = 5 AND (SELECT COUNT(*) FROM \"StudentParqLegacyRecord\") = 7 THEN 'issue-273-migration-ok' ELSE 'issue-273-migration-invalid' END;" \
  | grep -qx 'issue-273-migration-ok'

echo "Issue #273 PAR-Q migration verified with canonical, importable, equivalent, divergent, incomplete and missing-date fixtures."
