#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
PSQL_DATABASE_URL="${DATABASE_URL%%\?*}"

docker run --rm --network host \
  postgres:16-alpine \
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -X <<'SQL'
BEGIN;

DO $$
DECLARE
  v_contract_type TEXT;
  v_user_type TEXT;
  v_protocol "AdipometryProtocol"%ROWTYPE;
  v_function_definition TEXT;
BEGIN
  IF TO_REGPROCEDURE('"bindActiveAdipometryApprovalSnapshot"()') IS NULL THEN
    RAISE EXCEPTION 'active approval snapshot binder is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'zzzz_AdipometryAssessment_active_approval_snapshot'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'active approval snapshot trigger is missing';
  END IF;

  SELECT PG_GET_FUNCTIONDEF(
    '"bindActiveAdipometryApprovalSnapshot"()'::REGPROCEDURE
  ) INTO v_function_definition;

  IF v_function_definition NOT LIKE '%approval."revokedAt" IS NULL%'
     OR v_function_definition NOT LIKE '%ORDER BY approval."approvedAt" DESC, approval.id DESC%'
     OR v_function_definition NOT LIKE '%approvedSpecificationHash%buildAdipometrySpecificationHash%'
     OR v_function_definition NOT LIKE '%JSONB_SET%protocolApproval%' THEN
    RAISE EXCEPTION 'active approval snapshot binder is not fail-closed and deterministic';
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
    'issue246-active-snapshot-contract',
    v_contract_type,
    'issue246-active-snapshot-document',
    'Issue 246 active approval snapshot'
  );

  INSERT INTO "CollaboratorFunctionOption" (
    id, "contractId", name, code, "isActive", "isSystem", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-active-snapshot-function',
    'issue246-active-snapshot-contract',
    'ADPT active snapshot authority',
    'ISSUE246-ACTIVE-SNAPSHOT',
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
       (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE),
       (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE)',
    'issue246-active-snapshot-manager-user',
    'issue246-active-snapshot-manager@example.invalid',
    'not-a-password',
    v_user_type,
    'issue246-active-snapshot-responsible-old-user',
    'issue246-active-snapshot-responsible-old@example.invalid',
    'not-a-password',
    v_user_type,
    'issue246-active-snapshot-responsible-current-user',
    'issue246-active-snapshot-responsible-current@example.invalid',
    'not-a-password',
    v_user_type
  );

  INSERT INTO "Professor" (
    id, "userId", "contractId", "collaboratorFunctionId",
    "currentStatus", "createdAt", "updatedAt"
  ) VALUES
    (
      'issue246-active-snapshot-manager-professor',
      'issue246-active-snapshot-manager-user',
      'issue246-active-snapshot-contract',
      'issue246-active-snapshot-function',
      'active',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'issue246-active-snapshot-responsible-old-professor',
      'issue246-active-snapshot-responsible-old-user',
      'issue246-active-snapshot-contract',
      'issue246-active-snapshot-function',
      'active',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'issue246-active-snapshot-responsible-current-professor',
      'issue246-active-snapshot-responsible-current-user',
      'issue246-active-snapshot-contract',
      'issue246-active-snapshot-function',
      'active',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );

  INSERT INTO "Profile" (
    id, "userId", name, cref, "createdAt", "updatedAt"
  ) VALUES
    (
      'issue246-active-snapshot-manager-profile',
      'issue246-active-snapshot-manager-user',
      'Gestor da responsabilidade ADPT',
      'CREF-ACTIVE-SNAPSHOT-MANAGER',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'issue246-active-snapshot-responsible-old-profile',
      'issue246-active-snapshot-responsible-old-user',
      'Responsável clínico anterior',
      'CREF-ACTIVE-SNAPSHOT-OLD',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'issue246-active-snapshot-responsible-current-profile',
      'issue246-active-snapshot-responsible-current-user',
      'Responsável clínico vigente',
      'CREF-ACTIVE-SNAPSHOT-CURRENT',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );

  UPDATE "AccessPermission"
  SET "canView" = TRUE,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "collaboratorFunctionId" = 'issue246-active-snapshot-function'
    AND "screenKey" = 'settings.contract'
    AND "blockKey" IN (
      'settings.contract.actions.manageClinicalTechnicalResponsibility',
      'settings.contract.adipometryProtocolApproval'
    );

  INSERT INTO "AdipometryClinicalResponsibility" (
    id,
    "contractId",
    domain,
    "professorId",
    "effectiveFrom",
    "designatedByUserId",
    "designatedAt",
    "createdAt",
    "updatedAt"
  ) VALUES (
    'issue246-active-snapshot-responsibility-old',
    'issue246-active-snapshot-contract',
    'ADIPOMETRY_CLINICAL_RESPONSIBLE',
    'issue246-active-snapshot-responsible-old-professor',
    CURRENT_TIMESTAMP,
    'issue246-active-snapshot-manager-user',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

  SELECT * INTO v_protocol
  FROM "AdipometryProtocol"
  WHERE code = 'GUEDES_1991_ADULT_YOUNG'
    AND version = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'canonical adipometry protocol is missing';
  END IF;

  INSERT INTO "AdipometryProtocolApproval" (
    id,
    "contractId",
    "protocolId",
    "protocolCode",
    "protocolVersion",
    "responsibilityId",
    "approvedByProfessorId",
    "approvedByUserId",
    "approvedAt",
    "approvalStatement",
    "approvedByNameSnapshot",
    "approvedByCrefSnapshot",
    "approvedSpecificationHash",
    "protocolDefinitionSnapshot",
    "createdAt"
  ) VALUES (
    'issue246-active-snapshot-approval-revoked',
    'issue246-active-snapshot-contract',
    v_protocol.id,
    v_protocol.code,
    v_protocol.version,
    'issue246-active-snapshot-responsibility-old',
    'issue246-active-snapshot-responsible-old-professor',
    'issue246-active-snapshot-responsible-old-user',
    CURRENT_TIMESTAMP,
    'Primeira aprovação clínica que será revogada para o controle adversarial.',
    'Responsável clínico anterior',
    'CREF-ACTIVE-SNAPSHOT-OLD',
    "buildAdipometrySpecificationHash"(
      v_protocol.code,
      v_protocol.version,
      v_protocol.reference,
      v_protocol."definitionSnapshot"
    ),
    v_protocol."definitionSnapshot",
    CURRENT_TIMESTAMP
  );

  UPDATE "AdipometryProtocolApproval"
  SET "revokedAt" = CURRENT_TIMESTAMP,
      "revokedByProfessorId" = 'issue246-active-snapshot-responsible-old-professor',
      "revokedByUserId" = 'issue246-active-snapshot-responsible-old-user',
      "revocationReason" = 'Substituição controlada pela nova aprovação clínica vigente.'
  WHERE id = 'issue246-active-snapshot-approval-revoked';

  UPDATE "AdipometryClinicalResponsibility"
  SET "effectiveTo" = CURRENT_TIMESTAMP,
      "endedByUserId" = 'issue246-active-snapshot-manager-user',
      "endedAt" = CURRENT_TIMESTAMP,
      "endReason" = 'Troca controlada do responsável técnico para o controle adversarial.',
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE id = 'issue246-active-snapshot-responsibility-old';

  INSERT INTO "AdipometryClinicalResponsibility" (
    id,
    "contractId",
    domain,
    "professorId",
    "effectiveFrom",
    "designatedByUserId",
    "designatedAt",
    "createdAt",
    "updatedAt"
  ) VALUES (
    'issue246-active-snapshot-responsibility-current',
    'issue246-active-snapshot-contract',
    'ADIPOMETRY_CLINICAL_RESPONSIBLE',
    'issue246-active-snapshot-responsible-current-professor',
    CURRENT_TIMESTAMP,
    'issue246-active-snapshot-manager-user',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

  INSERT INTO "AdipometryProtocolApproval" (
    id,
    "contractId",
    "protocolId",
    "protocolCode",
    "protocolVersion",
    "responsibilityId",
    "approvedByProfessorId",
    "approvedByUserId",
    "approvedAt",
    "approvalStatement",
    "approvedByNameSnapshot",
    "approvedByCrefSnapshot",
    "approvedSpecificationHash",
    "protocolDefinitionSnapshot",
    "createdAt"
  ) VALUES (
    'issue246-active-snapshot-approval-current',
    'issue246-active-snapshot-contract',
    v_protocol.id,
    v_protocol.code,
    v_protocol.version,
    'issue246-active-snapshot-responsibility-current',
    'issue246-active-snapshot-responsible-current-professor',
    'issue246-active-snapshot-responsible-current-user',
    CURRENT_TIMESTAMP,
    'Segunda aprovação clínica vigente para o controle adversarial do snapshot.',
    'Responsável clínico vigente',
    'CREF-ACTIVE-SNAPSHOT-CURRENT',
    "buildAdipometrySpecificationHash"(
      v_protocol.code,
      v_protocol.version,
      v_protocol.reference,
      v_protocol."definitionSnapshot"
    ),
    v_protocol."definitionSnapshot",
    CURRENT_TIMESTAMP
  );
END;
$$;

CREATE TEMP TABLE issue246_active_snapshot_probe (
  status TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "protocolId" TEXT NOT NULL,
  "protocolCode" TEXT NOT NULL,
  "protocolVersion" INTEGER NOT NULL,
  "calculationSnapshot" JSONB NOT NULL
);

CREATE TRIGGER issue246_active_snapshot_probe_trigger
BEFORE INSERT OR UPDATE OF
  status,
  "contractId",
  "protocolId",
  "protocolCode",
  "protocolVersion"
ON issue246_active_snapshot_probe
FOR EACH ROW
EXECUTE FUNCTION "bindActiveAdipometryApprovalSnapshot"();

INSERT INTO issue246_active_snapshot_probe (
  status,
  "contractId",
  "protocolId",
  "protocolCode",
  "protocolVersion",
  "calculationSnapshot"
)
SELECT
  'COMPLETED',
  'issue246-active-snapshot-contract',
  protocol.id,
  protocol.code,
  protocol.version,
  '{"probe":"active-approval"}'::JSONB
FROM "AdipometryProtocol" protocol
WHERE protocol.code = 'GUEDES_1991_ADULT_YOUNG'
  AND protocol.version = 1;

DO $$
DECLARE
  v_snapshot JSONB;
BEGIN
  SELECT "calculationSnapshot" INTO v_snapshot
  FROM issue246_active_snapshot_probe
  LIMIT 1;

  IF v_snapshot #>> '{protocolApproval,id}'
       IS DISTINCT FROM 'issue246-active-snapshot-approval-current' THEN
    RAISE EXCEPTION 'revoked approval was selected instead of the active approval: %',
      v_snapshot #>> '{protocolApproval,id}';
  END IF;

  IF v_snapshot #>> '{protocolApproval,approvedByName}'
       IS DISTINCT FROM 'Responsável clínico vigente'
     OR v_snapshot #>> '{protocolApproval,approvedByCref}'
       IS DISTINCT FROM 'CREF-ACTIVE-SNAPSHOT-CURRENT' THEN
    RAISE EXCEPTION 'active approval authorship was not preserved in the snapshot';
  END IF;
END;
$$;

UPDATE "AdipometryProtocolApproval"
SET "revokedAt" = CURRENT_TIMESTAMP,
    "revokedByProfessorId" = 'issue246-active-snapshot-responsible-current-professor',
    "revokedByUserId" = 'issue246-active-snapshot-responsible-current-user',
    "revocationReason" = 'Controle negativo sem aprovação clínica ativa disponível.'
WHERE id = 'issue246-active-snapshot-approval-current';

DO $$
BEGIN
  BEGIN
    INSERT INTO issue246_active_snapshot_probe (
      status,
      "contractId",
      "protocolId",
      "protocolCode",
      "protocolVersion",
      "calculationSnapshot"
    )
    SELECT
      'COMPLETED',
      'issue246-active-snapshot-contract',
      protocol.id,
      protocol.code,
      protocol.version,
      '{"probe":"revoked-only"}'::JSONB
    FROM "AdipometryProtocol" protocol
    WHERE protocol.code = 'GUEDES_1991_ADULT_YOUNG'
      AND protocol.version = 1;

    RAISE EXCEPTION 'completed snapshot was accepted with revoked approvals only';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%ADIPOMETRY_PROTOCOL_NOT_APPROVED_FOR_CONTRACT%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

ROLLBACK;
SQL

echo "adipometry active approval snapshot lifecycle control OK"
