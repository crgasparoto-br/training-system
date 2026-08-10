#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/training_system_test}"
DB_URL="${DB_URL%%\?*}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cat > "$TMP_DIR/verify.sql" <<'SQL'
BEGIN;

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
    'issue246-demographic-contract', contract_type,
    'issue246-demographic-document', 'Issue 246 demographic provenance'
  );

  EXECUTE format(
    'INSERT INTO "User" ("id", "email", "passwordHash", "type", "createdAt", "updatedAt", "isActive") VALUES
      (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true),
      (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true),
      (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true),
      (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true)',
    'issue246-demographic-canonical-user', 'issue246-demographic-canonical@example.invalid', 'not-a-password', user_type,
    'issue246-demographic-missing-gender-user', 'issue246-demographic-missing-gender@example.invalid', 'not-a-password', user_type,
    'issue246-demographic-legacy-user', 'issue246-demographic-legacy@example.invalid', 'not-a-password', user_type,
    'issue246-demographic-invalid-user', 'issue246-demographic-invalid@example.invalid', 'not-a-password', user_type
  );
END $$;

INSERT INTO "Profile" (
  "id", "userId", "name", "birthDate", "gender", "createdAt", "updatedAt"
) VALUES
  (
    'issue246-demographic-canonical-legacy-profile',
    'issue246-demographic-canonical-user', 'Canonical fallback conflict',
    TIMESTAMP '1990-01-01 00:00:00', 'male'::"Gender", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'issue246-demographic-missing-gender-profile',
    'issue246-demographic-missing-gender-user', 'Missing gender',
    TIMESTAMP '1994-02-10 00:00:00', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'issue246-demographic-legacy-profile',
    'issue246-demographic-legacy-user', 'Legacy fallback',
    TIMESTAMP '1980-06-15 00:00:00', 'male'::"Gender", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'issue246-demographic-invalid-profile',
    'issue246-demographic-invalid-user', 'Invalid canonical payload',
    TIMESTAMP '1985-01-01 00:00:00', 'female'::"Gender", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

INSERT INTO "Aluno" (
  "id", "userId", "contractId", "birthDate", "createdAt", "updatedAt"
) VALUES
  (
    'issue246-demographic-canonical-aluno', 'issue246-demographic-canonical-user',
    'issue246-demographic-contract', TIMESTAMP '1991-01-01 00:00:00',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'issue246-demographic-missing-birth-aluno', NULL,
    'issue246-demographic-contract', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'issue246-demographic-missing-gender-aluno', 'issue246-demographic-missing-gender-user',
    'issue246-demographic-contract', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'issue246-demographic-legacy-aluno', 'issue246-demographic-legacy-user',
    'issue246-demographic-contract', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'issue246-demographic-invalid-aluno', 'issue246-demographic-invalid-user',
    'issue246-demographic-contract', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

INSERT INTO "StudentProfile" (
  "id", "alunoId", "contractId", "identificationData", "createdAt", "updatedAt"
) VALUES
  (
    'issue246-demographic-canonical-student-profile',
    'issue246-demographic-canonical-aluno', 'issue246-demographic-contract',
    '{"birthDate":"1996-07-31","gender":"female","maturation":"ADULT"}'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'issue246-demographic-missing-birth-student-profile',
    'issue246-demographic-missing-birth-aluno', 'issue246-demographic-contract',
    '{"gender":"female"}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'issue246-demographic-missing-gender-student-profile',
    'issue246-demographic-missing-gender-aluno', 'issue246-demographic-contract',
    '{"birthDate":"1994-02-10"}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'issue246-demographic-invalid-student-profile',
    'issue246-demographic-invalid-aluno', 'issue246-demographic-contract',
    '{"birthDate":{"forged":true},"gender":"female"}'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

DO $$
DECLARE
  resolved JSONB;
BEGIN
  resolved := "resolveAdipometryCanonicalProfile"(
    'issue246-demographic-contract',
    'issue246-demographic-canonical-aluno',
    TIMESTAMP '2026-07-30 10:00:00'
  );

  IF (resolved ->> 'ageAtAssessment')::INTEGER <> 29
     OR resolved #>> '{profileCriteria,sex}' <> 'FEMALE'
     OR resolved #>> '{profileCriteria,maturation}' <> 'ADULT'
     OR resolved #>> '{profileCriteria,birthDate}' <> '1996-07-31'
     OR resolved #>> '{profileCriteria,sources,birthDate,kind}' <> 'STUDENT_PROFILE'
     OR resolved #>> '{profileCriteria,sources,sex,kind}' <> 'STUDENT_PROFILE' THEN
    RAISE EXCEPTION 'canonical StudentProfile precedence or age calculation failed';
  END IF;

  resolved := "resolveAdipometryCanonicalProfile"(
    'issue246-demographic-contract',
    'issue246-demographic-canonical-aluno',
    TIMESTAMP '2026-07-31 00:00:00'
  );

  IF (resolved ->> 'ageAtAssessment')::INTEGER <> 30 THEN
    RAISE EXCEPTION 'birthday boundary was not calculated in completed years';
  END IF;
END $$;

DO $$ BEGIN
  BEGIN
    PERFORM "resolveAdipometryCanonicalProfile"(
      'issue246-demographic-contract',
      'issue246-demographic-missing-birth-aluno',
      TIMESTAMP '2026-07-30 10:00:00'
    );
    RAISE EXCEPTION 'missing canonical birth date was accepted';
  EXCEPTION WHEN CHECK_VIOLATION THEN
    IF SQLERRM NOT LIKE '%ADIPOMETRY_BIRTH_DATE_REQUIRED%' THEN RAISE; END IF;
  END;
END $$;

DO $$ BEGIN
  BEGIN
    PERFORM "resolveAdipometryCanonicalProfile"(
      'issue246-demographic-contract',
      'issue246-demographic-missing-gender-aluno',
      TIMESTAMP '2026-07-30 10:00:00'
    );
    RAISE EXCEPTION 'missing canonical gender was accepted';
  EXCEPTION WHEN CHECK_VIOLATION THEN
    IF SQLERRM NOT LIKE '%ADIPOMETRY_SEX_REQUIRED%' THEN RAISE; END IF;
  END;
END $$;

DO $$
DECLARE
  resolved JSONB;
BEGIN
  resolved := "resolveAdipometryCanonicalProfile"(
    'issue246-demographic-contract',
    'issue246-demographic-legacy-aluno',
    TIMESTAMP '2026-07-30 10:00:00'
  );

  IF (resolved ->> 'ageAtAssessment')::INTEGER <> 46
     OR resolved #>> '{profileCriteria,sex}' <> 'MALE'
     OR resolved #>> '{profileCriteria,sources,birthDate,kind}' <> 'LEGACY_PROFILE'
     OR resolved #>> '{profileCriteria,sources,sex,kind}' <> 'LEGACY_PROFILE' THEN
    RAISE EXCEPTION 'legacy demographic fallback failed';
  END IF;
END $$;

DO $$ BEGIN
  BEGIN
    PERFORM "resolveAdipometryCanonicalProfile"(
      'issue246-demographic-contract',
      'issue246-demographic-invalid-aluno',
      TIMESTAMP '2026-07-30 10:00:00'
    );
    RAISE EXCEPTION 'invalid canonical birth date shape was accepted';
  EXCEPTION WHEN INVALID_DATETIME_FORMAT THEN
    IF SQLERRM NOT LIKE '%ADIPOMETRY_BIRTH_DATE_INVALID%' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
SQL

docker run --rm --network host \
  -v "$TMP_DIR:/work" \
  postgres:16-alpine \
  psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q -f /work/verify.sql

echo "adipometry canonical demographic provenance controls OK"
