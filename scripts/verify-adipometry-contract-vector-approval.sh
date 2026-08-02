#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/training_system_test}"
BASE_URL="${BASE_URL%%\?*}"
SERVER_URL="${BASE_URL%/*}"
TEMP_DB="training_system_issue246_contract_vectors_${GITHUB_RUN_ID:-local}_$$"
TEMP_URL="${SERVER_URL}/${TEMP_DB}"

cleanup() {
  docker run --rm --network host postgres:16-alpine \
    psql "${SERVER_URL}/postgres" -v ON_ERROR_STOP=1 -X -q \
    -c "DROP DATABASE IF EXISTS \"${TEMP_DB}\" WITH (FORCE);" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# This database is intentionally created and populated only by the repository
# migration chain. It cannot inherit a function replacement from another gate.
docker run --rm --network host postgres:16-alpine \
  psql "${SERVER_URL}/postgres" -v ON_ERROR_STOP=1 -X -q \
  -c "CREATE DATABASE \"${TEMP_DB}\";"

DATABASE_URL="${TEMP_URL}?schema=public&connection_limit=1&pool_timeout=30" \
  pnpm --filter @corrida/api exec prisma migrate deploy

docker run --rm -i --network host postgres:16-alpine \
  psql "$TEMP_URL" -v ON_ERROR_STOP=1 -X -q <<'SQL'
BEGIN;

DO $$
DECLARE
  v_contract_type TEXT;
  v_user_type TEXT;
  v_valid_definition JSONB;
  v_bad_result_definition JSONB;
  v_bad_tolerance_definition JSONB;
  v_reference TEXT;
BEGIN
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
    'issue246-vector-contract',
    v_contract_type,
    'issue246-vector-document',
    'Issue 246 isolated vector approval control'
  );

  INSERT INTO "CollaboratorFunctionOption" (
    id, "contractId", name, code, "isActive", "isSystem", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-vector-function',
    'issue246-vector-contract',
    'Issue 246 vector clinical responsible',
    'ISSUE246-VECTOR-RESPONSIBLE',
    TRUE,
    FALSE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

  EXECUTE FORMAT(
    'INSERT INTO "User" (
       id, email, "passwordHash", type, "createdAt", "updatedAt", "isActive"
     ) VALUES (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE)',
    'issue246-vector-user',
    'issue246-vector@example.invalid',
    'not-a-password',
    v_user_type
  );

  INSERT INTO "Professor" (
    id, "userId", "contractId", "collaboratorFunctionId",
    "currentStatus", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-vector-professor',
    'issue246-vector-user',
    'issue246-vector-contract',
    'issue246-vector-function',
    'active',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

  INSERT INTO "Profile" (
    id, "userId", name, cref, "createdAt", "updatedAt"
  ) VALUES (
    'issue246-vector-profile',
    'issue246-vector-user',
    'Responsável clínico dos vetores',
    'CREF-VECTOR-246',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

  INSERT INTO "AccessPermission" (
    id, "collaboratorFunctionId", "screenKey", "blockKey",
    "canView", "createdAt", "updatedAt"
  ) VALUES
    (
      'issue246-vector-manage-grant',
      'issue246-vector-function',
      'settings.contract',
      'settings.contract.actions.manageClinicalTechnicalResponsibility',
      TRUE,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'issue246-vector-approval-grant',
      'issue246-vector-function',
      'settings.contract',
      'settings.contract.adipometryProtocolApproval',
      TRUE,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  ON CONFLICT ("collaboratorFunctionId", "screenKey", "blockKey")
  DO UPDATE SET "canView" = EXCLUDED."canView", "updatedAt" = CURRENT_TIMESTAMP;

  PERFORM SET_CONFIG(
    'app.adipometry_actor_user_id',
    'issue246-vector-user',
    TRUE
  );

  INSERT INTO "AdipometryClinicalResponsibility" (
    id, "contractId", domain, "professorId", "effectiveFrom",
    "designatedByUserId", "designatedAt", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-vector-responsibility',
    'issue246-vector-contract',
    'ADIPOMETRY_CLINICAL_RESPONSIBLE',
    'issue246-vector-professor',
    CURRENT_TIMESTAMP,
    'issue246-vector-user',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

  SELECT protocol."definitionSnapshot", protocol.reference
    INTO v_valid_definition, v_reference
  FROM "AdipometryProtocol" protocol
  WHERE protocol.code = 'GUEDES_1991_ADULT_YOUNG'
    AND protocol.version = 1;

  IF v_valid_definition IS NULL
     OR NOT "isValidAdipometryContractProtocolDefinition"(v_valid_definition) THEN
    RAISE EXCEPTION 'positive control failed: canonical contract definition was rejected';
  END IF;

  v_bad_result_definition := JSONB_SET(
    v_valid_definition,
    '{testVectors,0,expectedResults,bodyFatPercentage}',
    '99.99'::JSONB,
    FALSE
  );
  v_bad_tolerance_definition := JSONB_SET(
    v_valid_definition,
    '{testVectors,0,tolerance,bodyFatPercentage}',
    '0.02'::JSONB,
    FALSE
  );

  IF "isValidAdipometryContractProtocolDefinition"(v_bad_result_definition) THEN
    RAISE EXCEPTION 'negative control failed: tampered expected result was accepted';
  END IF;
  IF "isValidAdipometryContractProtocolDefinition"(v_bad_tolerance_definition) THEN
    RAISE EXCEPTION 'negative control failed: tampered tolerance was accepted';
  END IF;

  INSERT INTO "AdipometryProtocol" (
    id, code, version, name, status, "definitionSnapshot", reference,
    "createdAt", "updatedAt"
  ) VALUES
    (
      'issue246-vector-result-protocol',
      'ISSUE246_VECTOR_RESULT_TAMPER',
      1,
      'Issue 246 tampered expected result probe',
      'DRAFT',
      v_bad_result_definition,
      v_reference,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'issue246-vector-tolerance-protocol',
      'ISSUE246_VECTOR_TOLERANCE_TAMPER',
      1,
      'Issue 246 tampered tolerance probe',
      'DRAFT',
      v_bad_tolerance_definition,
      v_reference,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );

  BEGIN
    INSERT INTO "AdipometryProtocolApproval" (
      id, "contractId", "protocolId", "protocolCode", "protocolVersion",
      "responsibilityId", "approvedByProfessorId", "approvedByUserId", "approvedAt",
      "approvalStatement", "approvedByNameSnapshot", "approvedByCrefSnapshot",
      "approvedSpecificationHash", "protocolDefinitionSnapshot",
      "protocolReferenceSnapshot", "createdAt"
    ) VALUES (
      'issue246-vector-result-approval',
      'issue246-vector-contract',
      'issue246-vector-result-protocol',
      'ISSUE246_VECTOR_RESULT_TAMPER',
      1,
      'issue246-vector-responsibility',
      'issue246-vector-professor',
      'issue246-vector-user',
      CURRENT_TIMESTAMP,
      'Aprovação de controle que deve rejeitar o resultado esperado adulterado.',
      'Responsável clínico dos vetores',
      'CREF-VECTOR-246',
      "buildAdipometrySpecificationHash"(
        'ISSUE246_VECTOR_RESULT_TAMPER',
        1,
        v_reference,
        v_bad_result_definition
      ),
      v_bad_result_definition,
      v_reference,
      CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'tampered expected result approval was accepted';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%ADIPOMETRY_PROTOCOL_DEFINITION_INCOMPLETE%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    INSERT INTO "AdipometryProtocolApproval" (
      id, "contractId", "protocolId", "protocolCode", "protocolVersion",
      "responsibilityId", "approvedByProfessorId", "approvedByUserId", "approvedAt",
      "approvalStatement", "approvedByNameSnapshot", "approvedByCrefSnapshot",
      "approvedSpecificationHash", "protocolDefinitionSnapshot",
      "protocolReferenceSnapshot", "createdAt"
    ) VALUES (
      'issue246-vector-tolerance-approval',
      'issue246-vector-contract',
      'issue246-vector-tolerance-protocol',
      'ISSUE246_VECTOR_TOLERANCE_TAMPER',
      1,
      'issue246-vector-responsibility',
      'issue246-vector-professor',
      'issue246-vector-user',
      CURRENT_TIMESTAMP,
      'Aprovação de controle que deve rejeitar a tolerância adulterada do vetor.',
      'Responsável clínico dos vetores',
      'CREF-VECTOR-246',
      "buildAdipometrySpecificationHash"(
        'ISSUE246_VECTOR_TOLERANCE_TAMPER',
        1,
        v_reference,
        v_bad_tolerance_definition
      ),
      v_bad_tolerance_definition,
      v_reference,
      CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'tampered tolerance approval was accepted';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%ADIPOMETRY_PROTOCOL_DEFINITION_INCOMPLETE%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

ROLLBACK;
SQL

echo "isolated adipometry contract vector approval controls OK"
