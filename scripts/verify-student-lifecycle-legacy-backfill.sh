#!/usr/bin/env bash
set -euo pipefail

readonly DB_NAME="training_system_issue_268_legacy"
readonly TARGET_MIGRATION="20260721120000_student_lifecycle_domain"
readonly ROOT_DIR="${GITHUB_WORKSPACE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

psql_admin() {
  docker run --rm --network host \
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

psql_admin "$DB_NAME" <<'SQL'
INSERT INTO "Contract" ("id", "type", "document", "name", "createdAt", "updatedAt")
VALUES ('legacy-contract', 'academy', 'legacy-contract-document', 'Academia legada', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "User" ("id", "email", "passwordHash", "type", "createdAt", "updatedAt") VALUES
  ('legacy-professor-user', 'legacy-professor@example.com', 'hash', 'professor', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('legacy-student-user', 'legacy-student@example.com', 'hash', 'aluno', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Profile" (
  "id", "userId", "name", "phone", "cpf", "birthDate", "createdAt", "updatedAt"
) VALUES
  ('legacy-professor-profile', 'legacy-professor-user', 'Professor legado', '15999990000', NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('legacy-student-profile', 'legacy-student-user', 'Aluno legado', '15999991111', '12345678901', '1990-05-15', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "CollaboratorFunctionOption" (
  "id", "contractId", "name", "code", "createdAt", "updatedAt"
) VALUES ('legacy-professor-function', 'legacy-contract', 'Professor', 'legacy-professor', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Professor" (
  "id", "userId", "contractId", "role", "collaboratorFunctionId", "createdAt", "updatedAt"
) VALUES (
  'legacy-professor', 'legacy-professor-user', 'legacy-contract', 'professor',
  'legacy-professor-function', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "Aluno" (
  "id", "userId", "professorId", "age", "weight", "height", "vo2Max",
  "anaerobicThreshold", "maxHeartRate", "restingHeartRate", "schedulePlan",
  "createdAt", "updatedAt"
) VALUES (
  'legacy-aluno', 'legacy-student-user', 'legacy-professor', 36, 70, 175, 48,
  12, 190, 60, 'free', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "AlunoIntakeForm" (
  "id", "alunoId", "assessmentDate", "mainGoal", "parqResponses", "formResponses",
  "createdAt", "updatedAt"
) VALUES (
  'legacy-intake', 'legacy-aluno', CURRENT_TIMESTAMP, 'Saúde', '{"q1": false}'::jsonb,
  '{"legacy": true}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "StudentHealthIntake" (
  "id", "alunoId", "contractId", "sourceType", "questionnaireParq",
  "observations", "createdAt", "updatedAt"
) VALUES (
  'legacy-health-intake', 'legacy-aluno', 'legacy-contract', 'student',
  '{"q1": false}'::jsonb, 'Preservar intake segmentado', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "StudentParqSubmission" (
  "id", "alunoId", "contractId", "sourceType", "responses", "positiveItems",
  "declarationAccepted", "createdAt", "updatedAt"
) VALUES (
  'legacy-parq', 'legacy-aluno', 'legacy-contract', 'student', '{"q1": false, "q8": true}'::jsonb,
  '[]'::jsonb, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "TrainingPlan" (
  "id", "professorId", "alunoId", "name", "startDate", "endDate", "createdAt", "updatedAt"
) VALUES (
  'legacy-training-plan', 'legacy-professor', 'legacy-aluno', 'Plano legado',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '90 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "TrainingSpace" (
  "id", "contractId", "name", "capacity", "createdAt", "updatedAt"
) VALUES ('legacy-space', 'legacy-contract', 'Sala legada', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "AgendaBooking" (
  "id", "contractId", "alunoId", "professorId", "spaceId", "bookingType", "status",
  "bookingDate", "startTime", "endTime", "createdAt", "updatedAt"
) VALUES (
  'legacy-booking', 'legacy-contract', 'legacy-aluno', 'legacy-professor', 'legacy-space',
  'free', 'scheduled', CURRENT_TIMESTAMP + INTERVAL '7 days', '08:00', '09:00',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "AssessmentType" (
  "id", "contractId", "name", "code", "scheduleType", "isActive", "createdAt", "updatedAt"
) VALUES (
  'legacy-assessment-type', 'legacy-contract', 'Avaliação legada', 'legacy',
  'fixed_interval', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "Assessment" (
  "id", "alunoId", "typeId", "assessmentDate", "filePath", "originalFileName",
  "mimeType", "fileSize", "extractedData", "createdAt", "updatedAt"
) VALUES (
  'legacy-assessment', 'legacy-aluno', 'legacy-assessment-type', CURRENT_TIMESTAMP,
  '/legacy.pdf', 'legacy.pdf', 'application/pdf', 100, '{"legacy": true}'::jsonb,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "ContractTemplate" (
  "id", "contractId", "name", "version", "status", "headerHtml", "footerHtml",
  "createdAt", "updatedAt"
) VALUES (
  'legacy-template', 'legacy-contract', 'Modelo legado', 1, 'ACTIVE', '', '',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "GeneratedContract" (
  "id", "companyContractId", "templateId", "templateVersion", "alunoId", "partyType",
  "origin", "status", "title", "renderedHtml", "dataSnapshot", "createdAt", "updatedAt"
) VALUES (
  'legacy-generated-contract', 'legacy-contract', 'legacy-template', 1, 'legacy-aluno',
  'STUDENT', 'ELECTRONIC', 'DRAFT', 'Contrato legado', '<p>Contrato</p>',
  '{"legacy": true}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "ProntuarioRecord" (
  "id", "alunoId", "contractId", "professorId", "code", "status", "summary",
  "createdAt", "updatedAt"
) VALUES (
  'legacy-prontuario', 'legacy-aluno', 'legacy-contract', 'legacy-professor',
  'PRNT-LEGACY', 'open', 'Prontuário legado', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
SQL

psql_admin "$DB_NAME" \
  -f "/workspace/apps/api/prisma/migrations/${TARGET_MIGRATION}/migration.sql" >/dev/null

psql_admin "$DB_NAME" <<'SQL'
DO $$
DECLARE
  aluno_row record;
BEGIN
  SELECT * INTO aluno_row FROM "Aluno" WHERE "id" = 'legacy-aluno';
  IF aluno_row."id" IS NULL THEN RAISE EXCEPTION 'legacy Aluno was lost'; END IF;
  IF aluno_row."userId" <> 'legacy-student-user' THEN RAISE EXCEPTION 'legacy user link changed'; END IF;
  IF aluno_row."professorId" <> 'legacy-professor' THEN RAISE EXCEPTION 'legacy professor link changed'; END IF;
  IF aluno_row."contractId" <> 'legacy-contract' THEN RAISE EXCEPTION 'contract backfill failed'; END IF;
  IF aluno_row."status" <> 'ACTIVE_STUDENT' THEN RAISE EXCEPTION 'legacy status backfill failed'; END IF;

  IF NOT EXISTS (SELECT 1 FROM "TrainingPlan" WHERE "id" = 'legacy-training-plan' AND "alunoId" = 'legacy-aluno') THEN
    RAISE EXCEPTION 'training plan link was not preserved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "AgendaBooking" WHERE "id" = 'legacy-booking' AND "alunoId" = 'legacy-aluno') THEN
    RAISE EXCEPTION 'agenda booking link was not preserved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Assessment" WHERE "id" = 'legacy-assessment' AND "alunoId" = 'legacy-aluno') THEN
    RAISE EXCEPTION 'assessment link was not preserved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "GeneratedContract" WHERE "id" = 'legacy-generated-contract' AND "alunoId" = 'legacy-aluno') THEN
    RAISE EXCEPTION 'contract link was not preserved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "ProntuarioRecord" WHERE "id" = 'legacy-prontuario' AND "alunoId" = 'legacy-aluno') THEN
    RAISE EXCEPTION 'PRNT link was not preserved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "AlunoIntakeForm" WHERE "id" = 'legacy-intake' AND "alunoId" = 'legacy-aluno') THEN
    RAISE EXCEPTION 'legacy intake was not preserved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "StudentHealthIntake" WHERE "id" = 'legacy-health-intake' AND "alunoId" = 'legacy-aluno') THEN
    RAISE EXCEPTION 'segmented health intake was not preserved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "StudentParqSubmission" WHERE "id" = 'legacy-parq' AND "alunoId" = 'legacy-aluno') THEN
    RAISE EXCEPTION 'PAR-Q submission was not preserved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "StudentProfile" WHERE "alunoId" = 'legacy-aluno' AND "contractId" = 'legacy-contract') THEN
    RAISE EXCEPTION 'canonical student profile was not backfilled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "StudentOnboardingProcess" WHERE "alunoId" = 'legacy-aluno' AND "contractId" = 'legacy-contract') THEN
    RAISE EXCEPTION 'onboarding process was not backfilled';
  END IF;
  IF EXISTS (SELECT 1 FROM "StudentLifecycleEvent" WHERE "alunoId" = 'legacy-aluno') THEN
    RAISE EXCEPTION 'migration invented lifecycle events';
  END IF;
END $$;
SQL

# A second application must be convergent and leave the populated legacy graph intact.
psql_admin "$DB_NAME" \
  -f "/workspace/apps/api/prisma/migrations/${TARGET_MIGRATION}/migration.sql" >/dev/null

psql_admin "$DB_NAME" -Atc \
  "SELECT CASE WHEN COUNT(*) = 1 THEN 'legacy-backfill-ok' ELSE 'legacy-backfill-invalid' END FROM \"Aluno\" WHERE \"id\" = 'legacy-aluno' AND \"contractId\" = 'legacy-contract' AND \"status\" = 'ACTIVE_STUDENT';" \
  | grep -qx 'legacy-backfill-ok'

echo "Issue #268 legacy backfill verified on a populated pre-migration database."
