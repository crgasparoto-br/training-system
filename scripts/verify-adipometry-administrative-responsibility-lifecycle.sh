#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
PSQL_DATABASE_URL="${DATABASE_URL%%\?*}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_PATH="/workspace/apps/api/prisma/migrations/20260817192000_allow_administrative_manage_adipometry_responsibility/migration.sql"

docker run --rm -i --network host \
  -v "$ROOT_DIR:/workspace:ro" \
  postgres:16-alpine \
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -X -q <<SQL
BEGIN;

DO \$\$
DECLARE
  v_contract_type TEXT;
BEGIN
  SELECT enumlabel INTO v_contract_type
  FROM pg_enum enum_row
  JOIN pg_type enum_type ON enum_type.oid = enum_row.enumtypid
  WHERE enum_type.typname = 'ContractType'
  ORDER BY enum_row.enumsortorder
  LIMIT 1;

  EXECUTE FORMAT(
    'INSERT INTO "Contract" (
       id, type, document, name, "createdAt", "updatedAt"
     ) VALUES (%L, %L::"ContractType", %L, %L, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    'admin-adpt-lifecycle-contract',
    v_contract_type,
    'admin-adpt-lifecycle-document',
    'Administrative ADPT lifecycle control'
  );
END;
\$\$;

-- Literal case: a built-in administrative function created after deploy must
-- receive screen + management grants from the persistent trigger, while
-- approval remains denied.
INSERT INTO "CollaboratorFunctionOption" (
  id, "contractId", name, code, "isActive", "isSystem", "createdAt", "updatedAt"
) VALUES (
  'admin-adpt-lifecycle-administrative',
  'admin-adpt-lifecycle-contract',
  'Administrativo',
  'administrative',
  TRUE,
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Sibling case: other functions keep both sensitive clinical capabilities
-- deny-by-default.
INSERT INTO "CollaboratorFunctionOption" (
  id, "contractId", name, code, "isActive", "isSystem", "createdAt", "updatedAt"
) VALUES (
  'admin-adpt-lifecycle-manager',
  'admin-adpt-lifecycle-contract',
  'Gestor',
  'manager',
  TRUE,
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

DO \$\$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AccessPermission"
    WHERE "collaboratorFunctionId" = 'admin-adpt-lifecycle-administrative'
      AND "screenKey" = 'settings.contract'
      AND "blockKey" = ''
      AND "canView" = TRUE
  ) THEN
    RAISE EXCEPTION 'ADMIN_ADPT_SCREEN_GRANT_MISSING_AFTER_FUNCTION_CREATION';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "AccessPermission"
    WHERE "collaboratorFunctionId" = 'admin-adpt-lifecycle-administrative'
      AND "screenKey" = 'settings.contract'
      AND "blockKey" = 'settings.contract.actions.manageClinicalTechnicalResponsibility'
      AND "canView" = TRUE
  ) THEN
    RAISE EXCEPTION 'ADMIN_ADPT_MANAGEMENT_GRANT_MISSING_AFTER_FUNCTION_CREATION';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "AccessPermission"
    WHERE "collaboratorFunctionId" = 'admin-adpt-lifecycle-administrative'
      AND "screenKey" = 'settings.contract'
      AND "blockKey" = 'settings.contract.adipometryProtocolApproval'
      AND "canView" = TRUE
  ) THEN
    RAISE EXCEPTION 'ADMIN_ADPT_APPROVAL_MUST_REMAIN_DENIED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "AccessPermission"
    WHERE "collaboratorFunctionId" = 'admin-adpt-lifecycle-manager'
      AND "screenKey" = 'settings.contract'
      AND "blockKey" = 'settings.contract.actions.manageClinicalTechnicalResponsibility'
      AND "canView" = TRUE
  ) THEN
    RAISE EXCEPTION 'NON_ADMIN_ADPT_MANAGEMENT_MUST_REMAIN_DENIED';
  END IF;
END;
\$\$;

-- Rerun control: simulate persisted rows drifting to false, reapply the exact
-- migration from this delivery, and require convergence without duplicates.
UPDATE "AccessPermission"
SET "canView" = FALSE, "updatedAt" = CURRENT_TIMESTAMP
WHERE "collaboratorFunctionId" = 'admin-adpt-lifecycle-administrative'
  AND "screenKey" = 'settings.contract'
  AND "blockKey" IN ('', 'settings.contract.actions.manageClinicalTechnicalResponsibility');

\i $MIGRATION_PATH

DO \$\$
DECLARE
  v_screen_count INTEGER;
  v_manage_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_screen_count
  FROM "AccessPermission"
  WHERE "collaboratorFunctionId" = 'admin-adpt-lifecycle-administrative'
    AND "screenKey" = 'settings.contract'
    AND "blockKey" = '';

  SELECT COUNT(*) INTO v_manage_count
  FROM "AccessPermission"
  WHERE "collaboratorFunctionId" = 'admin-adpt-lifecycle-administrative'
    AND "screenKey" = 'settings.contract'
    AND "blockKey" = 'settings.contract.actions.manageClinicalTechnicalResponsibility';

  IF v_screen_count <> 1 OR v_manage_count <> 1 THEN
    RAISE EXCEPTION 'ADMIN_ADPT_RERUN_DUPLICATED_PERMISSION_ROWS';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "AccessPermission"
    WHERE "collaboratorFunctionId" = 'admin-adpt-lifecycle-administrative'
      AND "screenKey" = 'settings.contract'
      AND "blockKey" IN ('', 'settings.contract.actions.manageClinicalTechnicalResponsibility')
      AND "canView" = TRUE
    GROUP BY "collaboratorFunctionId"
    HAVING COUNT(*) = 2
  ) THEN
    RAISE EXCEPTION 'ADMIN_ADPT_RERUN_DID_NOT_RESTORE_REQUIRED_GRANTS';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "AccessPermission"
    WHERE "collaboratorFunctionId" = 'admin-adpt-lifecycle-manager'
      AND "screenKey" = 'settings.contract'
      AND "blockKey" IN (
        'settings.contract.adipometryProtocolApproval',
        'settings.contract.actions.manageClinicalTechnicalResponsibility'
      )
      AND "canView" = TRUE
  ) THEN
    RAISE EXCEPTION 'ADMIN_ADPT_RERUN_BROADENED_NON_ADMIN_CLINICAL_ACCESS';
  END IF;
END;
\$\$;

ROLLBACK;
SQL

echo "administrative adipometry responsibility lifecycle controls OK"
