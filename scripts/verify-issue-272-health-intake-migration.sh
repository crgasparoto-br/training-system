#!/usr/bin/env bash
set -euo pipefail

readonly DB_NAME="training_system_issue_272_audit"
readonly CANONICAL_MIGRATION="20260725010000_issue_272_canonical_health_intake"
readonly REMEDIATION_MIGRATION="20260725123000_issue_272_audit_fixes"
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
  if [[ "$migration_name" == "$CANONICAL_MIGRATION" ]]; then
    break
  fi
  relative_path="${migration#"$ROOT_DIR/"}"
  psql_admin "$DB_NAME" -f "/workspace/${relative_path}" >/dev/null
done < <(find "$ROOT_DIR/apps/api/prisma/migrations" -mindepth 2 -maxdepth 2 -name migration.sql | sort)

psql_admin_stdin "$DB_NAME" <<'SQL'
INSERT INTO "Contract" ("id", "type", "document", "name", "createdAt", "updatedAt")
VALUES ('issue-272-contract', 'academy', 'issue-272-contract-document', 'Academia Issue 272', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Aluno" (
  "id", "contractId", "status", "leadName", "createdAt", "updatedAt", "lastActivityAt"
) VALUES
  ('issue-272-legacy-only', 'issue-272-contract', 'PRE_REGISTRATION_COMPLETED', 'Legado somente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('issue-272-canonical-only', 'issue-272-contract', 'PRE_REGISTRATION_COMPLETED', 'Canônico somente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('issue-272-equivalent', 'issue-272-contract', 'PRE_REGISTRATION_COMPLETED', 'Fontes equivalentes', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('issue-272-divergent', 'issue-272-contract', 'PRE_REGISTRATION_COMPLETED', 'Fontes divergentes', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "StudentOnboardingProcess" ("id", "alunoId", "contractId", "createdAt", "updatedAt") VALUES
  ('onboarding-legacy-only', 'issue-272-legacy-only', 'issue-272-contract', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('onboarding-canonical-only', 'issue-272-canonical-only', 'issue-272-contract', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('onboarding-equivalent', 'issue-272-equivalent', 'issue-272-contract', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('onboarding-divergent', 'issue-272-divergent', 'issue-272-contract', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "AlunoIntakeForm" (
  "id", "alunoId", "assessmentDate", "mainGoal", "medicalHistory",
  "currentMedications", "injuriesHistory", "trainingBackground", "observations",
  "parqResponses", "formResponses", "createdAt", "updatedAt"
) VALUES
  (
    'legacy-only-intake', 'issue-272-legacy-only', '2026-01-10', 'Objetivo legado',
    'Histórico legado', 'Medicação legada', 'Lesão legada', 'Experiência legada',
    'Observação legada', '{"q1": true}'::jsonb, '{"assessment": {"weight": 80}}'::jsonb,
    '2026-01-10', '2026-01-11'
  ),
  (
    'equivalent-legacy-intake', 'issue-272-equivalent', NULL, 'Objetivo equivalente',
    'Histórico equivalente', NULL, NULL, NULL, NULL, NULL, NULL,
    '2026-02-10', '2026-02-11'
  ),
  (
    'divergent-legacy-intake', 'issue-272-divergent', NULL, 'Objetivo legado divergente',
    'Histórico preenchido pelo legado', NULL, NULL, NULL, NULL, NULL, NULL,
    '2026-03-10', '2026-03-11'
  );

INSERT INTO "StudentHealthIntake" (
  "id", "alunoId", "contractId", "sourceType", "sourceReference",
  "clinicalHistoryData", "medicationData", "injuryData", "allergyData",
  "observations", "createdAt", "updatedAt"
) VALUES
  (
    'canonical-only-intake', 'issue-272-canonical-only', 'issue-272-contract', 'student',
    'pre-cutover-canonical-only', '{"mainGoal": "Objetivo canônico existente"}'::jsonb,
    '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, NULL, '2026-01-20', '2026-01-21'
  ),
  (
    'equivalent-canonical-intake', 'issue-272-equivalent', 'issue-272-contract', 'student',
    'pre-cutover-equivalent', '{"mainGoal": "Objetivo equivalente", "medicalHistory": "Histórico equivalente"}'::jsonb,
    '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, NULL, '2026-02-20', '2026-02-21'
  ),
  (
    'divergent-canonical-intake', 'issue-272-divergent', 'issue-272-contract', 'professional',
    'pre-cutover-divergent', '{"mainGoal": "Objetivo canônico prioritário"}'::jsonb,
    '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, NULL, '2026-03-20', '2026-03-21'
  );
SQL

psql_admin "$DB_NAME" \
  -f "/workspace/apps/api/prisma/migrations/${CANONICAL_MIGRATION}/migration.sql" >/dev/null
psql_admin "$DB_NAME" \
  -f "/workspace/apps/api/prisma/migrations/${REMEDIATION_MIGRATION}/migration.sql" >/dev/null

psql_admin_stdin "$DB_NAME" <<'SQL'
DO $$
DECLARE
  legacy_only record;
  canonical_only record;
  equivalent record;
  divergent record;
  onboarding_canonical record;
BEGIN
  SELECT * INTO legacy_only FROM "StudentHealthIntake" WHERE "alunoId" = 'issue-272-legacy-only';
  IF legacy_only."id" IS NULL THEN RAISE EXCEPTION 'legacy-only canonical row was not created'; END IF;
  IF legacy_only."status" <> 'IN_PROGRESS' OR legacy_only."currentStep" <> 'REVIEW' THEN
    RAISE EXCEPTION 'legacy-only state is incorrect: %/%', legacy_only."status", legacy_only."currentStep";
  END IF;
  IF legacy_only."clinicalHistoryData"->>'mainGoal' <> 'Objetivo legado' THEN
    RAISE EXCEPTION 'legacy-only mainGoal was not migrated';
  END IF;
  IF legacy_only."questionnaireParq" IS NOT NULL OR legacy_only."rawFormResponses" IS NOT NULL THEN
    RAISE EXCEPTION 'PAR-Q or generic form responses leaked into the canonical intake';
  END IF;
  IF legacy_only."consentAcceptedAt" IS NOT NULL OR legacy_only."completedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'migration fabricated consent or completion';
  END IF;

  SELECT * INTO canonical_only FROM "StudentHealthIntake" WHERE "alunoId" = 'issue-272-canonical-only';
  IF canonical_only."id" <> 'canonical-only-intake' THEN RAISE EXCEPTION 'canonical-only identity changed'; END IF;
  IF canonical_only."status" <> 'IN_PROGRESS' OR canonical_only."currentStep" <> 'REVIEW' THEN
    RAISE EXCEPTION 'canonical-only content remained NOT_STARTED';
  END IF;
  IF canonical_only."clinicalHistoryData"->>'mainGoal' <> 'Objetivo canônico existente' THEN
    RAISE EXCEPTION 'canonical-only content changed';
  END IF;
  IF EXISTS (SELECT 1 FROM "AlunoIntakeForm" WHERE "alunoId" = 'issue-272-canonical-only') THEN
    RAISE EXCEPTION 'canonical-only migration created a legacy row';
  END IF;
  IF canonical_only."consentAcceptedAt" IS NOT NULL OR canonical_only."completedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'canonical-only migration fabricated consent or completion';
  END IF;

  SELECT * INTO equivalent FROM "StudentHealthIntake" WHERE "alunoId" = 'issue-272-equivalent';
  IF equivalent."id" <> 'equivalent-canonical-intake' THEN RAISE EXCEPTION 'equivalent canonical identity changed'; END IF;
  IF equivalent."migrationReviewRequired" THEN RAISE EXCEPTION 'equivalent sources were flagged as divergent'; END IF;
  IF equivalent."status" <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'equivalent content remained NOT_STARTED'; END IF;

  SELECT * INTO divergent FROM "StudentHealthIntake" WHERE "alunoId" = 'issue-272-divergent';
  IF divergent."clinicalHistoryData"->>'mainGoal' <> 'Objetivo canônico prioritário' THEN
    RAISE EXCEPTION 'legacy data overwrote canonical mainGoal';
  END IF;
  IF divergent."clinicalHistoryData"->>'medicalHistory' <> 'Histórico preenchido pelo legado' THEN
    RAISE EXCEPTION 'legacy data did not fill a canonical gap';
  END IF;
  IF NOT divergent."migrationReviewRequired" OR divergent."migrationStatus" <> 'CONFLICT' THEN
    RAISE EXCEPTION 'divergence was not flagged for review';
  END IF;
  IF NOT (divergent."migrationReviewData"->'fields' ? 'mainGoal') THEN
    RAISE EXCEPTION 'mainGoal divergence was not recorded';
  END IF;

  SELECT * INTO onboarding_canonical
  FROM "StudentOnboardingProcess"
  WHERE "alunoId" = 'issue-272-canonical-only';
  IF onboarding_canonical."healthIntakeId" <> 'canonical-only-intake'
     OR onboarding_canonical."healthModuleStatus" <> 'IN_PROGRESS'
     OR onboarding_canonical."healthStartedAt" IS NULL
     OR onboarding_canonical."healthLastSavedAt" IS NULL THEN
    RAISE EXCEPTION 'canonical-only onboarding metadata was not synchronized';
  END IF;

  IF (SELECT COUNT(*) FROM "StudentHealthIntake" WHERE "alunoId" LIKE 'issue-272-%') <> 4 THEN
    RAISE EXCEPTION 'unexpected canonical row count';
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    UPDATE "AlunoIntakeForm"
    SET "mainGoal" = 'escrita proibida'
    WHERE "id" = 'legacy-only-intake';
    RAISE EXCEPTION 'legacy write unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;
END $$;
SQL

# Both migrations must remain convergent when replayed after the cutover trigger exists.
psql_admin "$DB_NAME" \
  -f "/workspace/apps/api/prisma/migrations/${CANONICAL_MIGRATION}/migration.sql" >/dev/null
psql_admin "$DB_NAME" \
  -f "/workspace/apps/api/prisma/migrations/${REMEDIATION_MIGRATION}/migration.sql" >/dev/null

psql_admin "$DB_NAME" -Atc \
  "SELECT CASE WHEN COUNT(*) = 4 AND COUNT(*) FILTER (WHERE \"status\" = 'IN_PROGRESS') = 4 THEN 'issue-272-migration-ok' ELSE 'issue-272-migration-invalid' END FROM \"StudentHealthIntake\" WHERE \"alunoId\" LIKE 'issue-272-%';" \
  | grep -qx 'issue-272-migration-ok'

echo "Issue #272 canonical/legacy migration verified with discriminant PostgreSQL fixtures."
