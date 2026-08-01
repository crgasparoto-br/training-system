#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
PSQL_DATABASE_URL="${DATABASE_URL%%\?*}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# A-246-09: the canonical JSONB definition must be accepted by the shared
# runtime contract without requiring contract approval metadata inside it.
(
  cd "$ROOT_DIR"
  pnpm --filter @corrida/api exec vitest run \
    src/modules/adipometry/adipometry-canonical-definition-contract.test.ts
)

# A-246-10: a valid management actor cannot persist an ineligible target.
docker run --rm --network host \
  postgres:16-alpine \
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -X <<'SQL'
BEGIN;

DO $$
DECLARE
  v_contract_type TEXT;
  v_user_type TEXT;
  v_function_definition TEXT;
BEGIN
  SELECT PG_GET_FUNCTIONDEF(
    '"isEligibleAdipometryClinicalDesignation"(text,text,timestamp without time zone)'::REGPROCEDURE
  ) INTO v_function_definition;

  IF v_function_definition NOT LIKE '%isEligibleAdipometryClinicalResponsible%' THEN
    RAISE EXCEPTION 'designation eligibility is not aligned with clinical approval eligibility';
  END IF;

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
    'issue246-a09-a10-contract',
    v_contract_type,
    'issue246-a09-a10-document',
    'Issue 246 A-246-09/A-246-10 control'
  );

  INSERT INTO "CollaboratorFunctionOption" (
    id, "contractId", name, code, "isActive", "isSystem", "createdAt", "updatedAt"
  ) VALUES
    (
      'issue246-a09-a10-manager-function',
      'issue246-a09-a10-contract',
      'ADPT management actor',
      'ISSUE246-A09-A10-MANAGER',
      TRUE,
      FALSE,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'issue246-a09-a10-target-function',
      'issue246-a09-a10-contract',
      'ADPT target without approval grant',
      'ISSUE246-A09-A10-TARGET',
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
    'issue246-a09-a10-manager-user',
    'issue246-a09-a10-manager@example.invalid',
    'not-a-password',
    v_user_type,
    'issue246-a09-a10-target-user',
    'issue246-a09-a10-target@example.invalid',
    'not-a-password',
    v_user_type
  );

  INSERT INTO "Professor" (
    id, "userId", "contractId", "collaboratorFunctionId",
    "currentStatus", "createdAt", "updatedAt"
  ) VALUES
    (
      'issue246-a09-a10-manager-professor',
      'issue246-a09-a10-manager-user',
      'issue246-a09-a10-contract',
      'issue246-a09-a10-manager-function',
      'active',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'issue246-a09-a10-target-professor',
      'issue246-a09-a10-target-user',
      'issue246-a09-a10-contract',
      'issue246-a09-a10-target-function',
      'active',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );

  INSERT INTO "Profile" (
    id, "userId", name, cref, "createdAt", "updatedAt"
  ) VALUES (
    'issue246-a09-a10-target-profile',
    'issue246-a09-a10-target-user',
    'Responsável clínico alvo',
    'CREF-A09-A10',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

  INSERT INTO "AccessPermission" (
    id, "collaboratorFunctionId", "screenKey", "blockKey",
    "canView", "createdAt", "updatedAt"
  ) VALUES
    (
      'issue246-a09-a10-manager-grant',
      'issue246-a09-a10-manager-function',
      'settings.contract',
      'settings.contract.actions.manageClinicalTechnicalResponsibility',
      TRUE,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'issue246-a09-a10-target-denied-grant',
      'issue246-a09-a10-target-function',
      'settings.contract',
      'settings.contract.adipometryProtocolApproval',
      FALSE,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  ON CONFLICT ("collaboratorFunctionId", "screenKey", "blockKey")
  DO UPDATE SET "canView" = EXCLUDED."canView", "updatedAt" = CURRENT_TIMESTAMP;

  PERFORM SET_CONFIG(
    'app.adipometry_actor_user_id',
    'issue246-a09-a10-manager-user',
    TRUE
  );

  BEGIN
    INSERT INTO "AdipometryClinicalResponsibility" (
      id, "contractId", domain, "professorId", "effectiveFrom",
      "designatedByUserId", "designatedAt", "createdAt", "updatedAt"
    ) VALUES (
      'issue246-a09-a10-denied-responsibility',
      'issue246-a09-a10-contract',
      'ADIPOMETRY_CLINICAL_RESPONSIBLE',
      'issue246-a09-a10-target-professor',
      CURRENT_TIMESTAMP,
      'issue246-a09-a10-manager-user',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'target without approval grant was designated';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%ADIPOMETRY_RESPONSIBLE_NOT_ELIGIBLE%' THEN
        RAISE;
      END IF;
  END;

  UPDATE "AccessPermission"
  SET "canView" = TRUE, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "collaboratorFunctionId" = 'issue246-a09-a10-target-function'
    AND "screenKey" = 'settings.contract'
    AND "blockKey" = 'settings.contract.adipometryProtocolApproval';

  INSERT INTO "AdipometryClinicalResponsibility" (
    id, "contractId", domain, "professorId", "effectiveFrom",
    "designatedByUserId", "designatedAt", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-a09-a10-valid-responsibility',
    'issue246-a09-a10-contract',
    'ADIPOMETRY_CLINICAL_RESPONSIBLE',
    'issue246-a09-a10-target-professor',
    CURRENT_TIMESTAMP,
    'issue246-a09-a10-manager-user',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );
END;
$$;

ROLLBACK;
SQL

echo "adipometry contract parity and designation eligibility controls OK"
