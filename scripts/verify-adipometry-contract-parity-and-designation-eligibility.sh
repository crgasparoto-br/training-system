#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
PSQL_DATABASE_URL="${DATABASE_URL%%\?*}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
SNAPSHOT_PATH="$TMP_DIR/persisted-calculation-snapshot.json"
trap 'rm -rf "$TMP_DIR"' EXIT

# A-246-10: a valid management actor cannot persist an ineligible target.
# The same transaction also produces an actual completion snapshot so A-246-09
# validates the JSON emitted by PostgreSQL, not a hand-built TypeScript fixture.
docker run --rm --network host \
  -v "$TMP_DIR:/snapshot" \
  postgres:16-alpine \
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -X -q <<'SQL'
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

DO $$
BEGIN
  PERFORM SET_CONFIG(
    'app.adipometry_actor_user_id',
    'issue246-a09-a10-target-user',
    TRUE
  );
END;
$$;

INSERT INTO "AdipometryProtocolApproval" (
  id, "contractId", "protocolId", "protocolCode", "protocolVersion",
  "responsibilityId", "approvedByProfessorId", "approvedByUserId", "approvedAt",
  "approvalStatement", "approvedByNameSnapshot", "approvedByCrefSnapshot",
  "approvedSpecificationHash", "protocolDefinitionSnapshot", "createdAt"
)
SELECT
  'issue246-a09-a10-approval',
  'issue246-a09-a10-contract',
  protocol.id,
  protocol.code,
  protocol.version,
  'issue246-a09-a10-valid-responsibility',
  'issue246-a09-a10-target-professor',
  'issue246-a09-a10-target-user',
  CURRENT_TIMESTAMP,
  'Aprovação clínica explícita para validar o snapshot persistido do contrato.',
  'Responsável clínico alvo',
  'CREF-A09-A10',
  "buildAdipometrySpecificationHash"(
    protocol.code,
    protocol.version,
    protocol.reference,
    protocol."definitionSnapshot"
  ),
  protocol."definitionSnapshot",
  CURRENT_TIMESTAMP
FROM "AdipometryProtocol" protocol
WHERE protocol.code = 'GUEDES_1991_ADULT_YOUNG'
  AND protocol.version = 1;

CREATE TEMP TABLE issue246_a09_a10_snapshot_probe (
  status TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "protocolId" TEXT NOT NULL,
  "protocolCode" TEXT NOT NULL,
  "protocolVersion" INTEGER NOT NULL,
  "calculationSnapshot" JSONB NOT NULL
);

CREATE TRIGGER issue246_a09_a10_snapshot_probe_trigger
BEFORE INSERT OR UPDATE OF
  status,
  "contractId",
  "protocolId",
  "protocolCode",
  "protocolVersion"
ON issue246_a09_a10_snapshot_probe
FOR EACH ROW
EXECUTE FUNCTION "bindActiveAdipometryApprovalSnapshot"();

INSERT INTO issue246_a09_a10_snapshot_probe (
  status,
  "contractId",
  "protocolId",
  "protocolCode",
  "protocolVersion",
  "calculationSnapshot"
)
SELECT
  'COMPLETED',
  'issue246-a09-a10-contract',
  protocol.id,
  protocol.code,
  protocol.version,
  '{"probe":"persisted-contract-parity"}'::JSONB
FROM "AdipometryProtocol" protocol
WHERE protocol.code = 'GUEDES_1991_ADULT_YOUNG'
  AND protocol.version = 1;

\copy (SELECT "calculationSnapshot"::TEXT FROM issue246_a09_a10_snapshot_probe LIMIT 1) TO '/snapshot/persisted-calculation-snapshot.json'

ROLLBACK;
SQL

if [[ ! -s "$SNAPSHOT_PATH" ]]; then
  echo "persisted adipometry completion snapshot was not produced" >&2
  exit 1
fi

# A-246-09: validate the actual JSON emitted by the PostgreSQL completion
# trigger at the shared runtime contract boundary.
(
  cd "$ROOT_DIR"
  ADIPOMETRY_PERSISTED_SNAPSHOT_PATH="$SNAPSHOT_PATH" \
    pnpm --filter @corrida/api exec jest --runInBand --runTestsByPath \
      src/modules/adipometry/adipometry-canonical-definition-contract.test.ts
)

echo "adipometry contract parity and designation eligibility controls OK"
