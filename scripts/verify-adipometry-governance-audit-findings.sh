#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
PSQL_DATABASE_URL="${DATABASE_URL%%\?*}"

psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

DO $$
DECLARE
  v_contract_type TEXT;
  v_user_type TEXT;
  v_protocol "AdipometryProtocol"%ROWTYPE;
  v_snapshot TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'AdipometryProtocolApproval'
      AND column_name = 'protocolReferenceSnapshot'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'approval reference snapshot is missing or nullable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'AdipometryProtocolApproval_00_reference_snapshot_guard'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'approval reference snapshot guard is missing';
  END IF;

  IF TO_REGPROCEDURE('"isEligibleAdipometryResponsibilityActor"(text,text,timestamp without time zone)') IS NULL THEN
    RAISE EXCEPTION 'responsibility actor validation function is missing';
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
    'INSERT INTO "Contract" (id, type, document, name, "createdAt", "updatedAt") VALUES
      (%L, %L::"ContractType", %L, %L, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      (%L, %L::"ContractType", %L, %L, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    'issue246-actor-contract-a', v_contract_type, 'issue246-actor-doc-a', 'Issue 246 actor A',
    'issue246-actor-contract-b', v_contract_type, 'issue246-actor-doc-b', 'Issue 246 actor B'
  );

  INSERT INTO "CollaboratorFunctionOption" (
    id, "contractId", name, code, "isActive", "isSystem", "createdAt", "updatedAt"
  ) VALUES
    ('issue246-actor-function-manager', 'issue246-actor-contract-a', 'ADPT manager', 'ISSUE246-ACTOR-MANAGER', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-actor-function-denied', 'issue246-actor-contract-a', 'ADPT denied', 'ISSUE246-ACTOR-DENIED', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-actor-function-external', 'issue246-actor-contract-b', 'ADPT external', 'ISSUE246-ACTOR-EXTERNAL', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  EXECUTE FORMAT(
    'INSERT INTO "User" (id, email, "passwordHash", type, "createdAt", "updatedAt", "isActive") VALUES
      (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE),
      (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE),
      (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE),
      (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE)',
    'issue246-actor-manager-user', 'issue246-actor-manager@example.invalid', 'not-a-password', v_user_type,
    'issue246-actor-responsible-user', 'issue246-actor-responsible@example.invalid', 'not-a-password', v_user_type,
    'issue246-actor-denied-user', 'issue246-actor-denied@example.invalid', 'not-a-password', v_user_type,
    'issue246-actor-external-user', 'issue246-actor-external@example.invalid', 'not-a-password', v_user_type
  );

  INSERT INTO "Professor" (
    id, "userId", "contractId", "collaboratorFunctionId", "currentStatus", "createdAt", "updatedAt"
  ) VALUES
    ('issue246-actor-manager-professor', 'issue246-actor-manager-user', 'issue246-actor-contract-a', 'issue246-actor-function-manager', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-actor-responsible-professor', 'issue246-actor-responsible-user', 'issue246-actor-contract-a', 'issue246-actor-function-manager', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-actor-denied-professor', 'issue246-actor-denied-user', 'issue246-actor-contract-a', 'issue246-actor-function-denied', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-actor-external-professor', 'issue246-actor-external-user', 'issue246-actor-contract-b', 'issue246-actor-function-external', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  INSERT INTO "Profile" (id, "userId", name, cref, "createdAt", "updatedAt") VALUES
    ('issue246-actor-responsible-profile', 'issue246-actor-responsible-user', 'Responsável clínico auditado', 'CREF-AUDIT-246', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  UPDATE "AccessPermission"
  SET "canView" = TRUE, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "collaboratorFunctionId" = 'issue246-actor-function-manager'
    AND "screenKey" = 'settings.contract'
    AND "blockKey" IN (
      'settings.contract.actions.manageClinicalTechnicalResponsibility',
      'settings.contract.adipometryProtocolApproval'
    );

  UPDATE "AccessPermission"
  SET "canView" = TRUE, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "collaboratorFunctionId" = 'issue246-actor-function-external'
    AND "screenKey" = 'settings.contract'
    AND "blockKey" = 'settings.contract.actions.manageClinicalTechnicalResponsibility';

  BEGIN
    INSERT INTO "AdipometryClinicalResponsibility" (
      id, "contractId", domain, "professorId", "effectiveFrom", "designatedByUserId",
      "designatedAt", "createdAt", "updatedAt"
    ) VALUES (
      'issue246-invalid-external-designation', 'issue246-actor-contract-a',
      'ADIPOMETRY_CLINICAL_RESPONSIBLE', 'issue246-actor-responsible-professor',
      CURRENT_TIMESTAMP, 'issue246-actor-external-user', CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'external designation actor was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%ADIPOMETRY_RESPONSIBILITY_DESIGNATION_ACTOR_INVALID%' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO "AdipometryClinicalResponsibility" (
      id, "contractId", domain, "professorId", "effectiveFrom", "designatedByUserId",
      "designatedAt", "createdAt", "updatedAt"
    ) VALUES (
      'issue246-invalid-denied-designation', 'issue246-actor-contract-a',
      'ADIPOMETRY_CLINICAL_RESPONSIBLE', 'issue246-actor-responsible-professor',
      CURRENT_TIMESTAMP, 'issue246-actor-denied-user', CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'unprivileged designation actor was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%ADIPOMETRY_RESPONSIBILITY_DESIGNATION_ACTOR_INVALID%' THEN RAISE; END IF;
  END;

  UPDATE "User" SET "isActive" = FALSE WHERE id = 'issue246-actor-manager-user';
  BEGIN
    INSERT INTO "AdipometryClinicalResponsibility" (
      id, "contractId", domain, "professorId", "effectiveFrom", "designatedByUserId",
      "designatedAt", "createdAt", "updatedAt"
    ) VALUES (
      'issue246-invalid-inactive-designation', 'issue246-actor-contract-a',
      'ADIPOMETRY_CLINICAL_RESPONSIBLE', 'issue246-actor-responsible-professor',
      CURRENT_TIMESTAMP, 'issue246-actor-manager-user', CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'inactive designation actor was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%ADIPOMETRY_RESPONSIBILITY_DESIGNATION_ACTOR_INVALID%' THEN RAISE; END IF;
  END;
  UPDATE "User" SET "isActive" = TRUE WHERE id = 'issue246-actor-manager-user';

  INSERT INTO "AdipometryClinicalResponsibility" (
    id, "contractId", domain, "professorId", "effectiveFrom", "designatedByUserId",
    "designatedAt", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-valid-responsibility', 'issue246-actor-contract-a',
    'ADIPOMETRY_CLINICAL_RESPONSIBLE', 'issue246-actor-responsible-professor',
    CURRENT_TIMESTAMP, 'issue246-actor-manager-user', CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  BEGIN
    UPDATE "AdipometryClinicalResponsibility"
    SET "effectiveTo" = CURRENT_TIMESTAMP,
        "endedByUserId" = 'issue246-actor-external-user',
        "endedAt" = CURRENT_TIMESTAMP,
        "endReason" = 'cross-contract actor must be rejected',
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = 'issue246-valid-responsibility';
    RAISE EXCEPTION 'external termination actor was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%ADIPOMETRY_RESPONSIBILITY_END_ACTOR_INVALID%' THEN RAISE; END IF;
  END;

  SELECT * INTO v_protocol
  FROM "AdipometryProtocol"
  WHERE code = 'GUEDES_1991_ADULT_YOUNG' AND version = 1;

  BEGIN
    INSERT INTO "AdipometryProtocolApproval" (
      id, "contractId", "protocolId", "protocolCode", "protocolVersion",
      "responsibilityId", "approvedByProfessorId", "approvedByUserId", "approvedAt",
      "approvalStatement", "approvedByNameSnapshot", "approvedByCrefSnapshot",
      "approvedSpecificationHash", "protocolDefinitionSnapshot",
      "protocolReferenceSnapshot", "createdAt"
    ) VALUES (
      'issue246-forged-reference-approval', 'issue246-actor-contract-a', v_protocol.id,
      v_protocol.code, v_protocol.version, 'issue246-valid-responsibility',
      'issue246-actor-responsible-professor', 'issue246-actor-responsible-user', CURRENT_TIMESTAMP,
      'Declaração clínica completa para o controle negativo de referência.',
      'Responsável clínico auditado', 'CREF-AUDIT-246', REPEAT('a', 64),
      v_protocol."definitionSnapshot", 'forged-reference', CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'forged protocol reference snapshot was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%ADIPOMETRY_PROTOCOL_REFERENCE_SNAPSHOT_MISMATCH%' THEN RAISE; END IF;
  END;

  INSERT INTO "AdipometryProtocolApproval" (
    id, "contractId", "protocolId", "protocolCode", "protocolVersion",
    "responsibilityId", "approvedByProfessorId", "approvedByUserId", "approvedAt",
    "approvalStatement", "approvedByNameSnapshot", "approvedByCrefSnapshot",
    "approvedSpecificationHash", "protocolDefinitionSnapshot", "createdAt"
  ) VALUES (
    'issue246-valid-reference-approval', 'issue246-actor-contract-a', v_protocol.id,
    v_protocol.code, v_protocol.version, 'issue246-valid-responsibility',
    'issue246-actor-responsible-professor', 'issue246-actor-responsible-user', CURRENT_TIMESTAMP,
    'Declaração clínica completa para comprovar o snapshot de referência.',
    'Responsável clínico auditado', 'CREF-AUDIT-246', REPEAT('b', 64),
    v_protocol."definitionSnapshot", CURRENT_TIMESTAMP
  );

  SELECT "protocolReferenceSnapshot" INTO v_snapshot
  FROM "AdipometryProtocolApproval"
  WHERE id = 'issue246-valid-reference-approval';

  IF BTRIM(v_snapshot) IS DISTINCT FROM BTRIM(v_protocol.reference) THEN
    RAISE EXCEPTION 'protocol reference snapshot was not captured atomically';
  END IF;

  BEGIN
    UPDATE "AdipometryProtocolApproval"
    SET "protocolReferenceSnapshot" = 'mutated-reference'
    WHERE id = 'issue246-valid-reference-approval';
    RAISE EXCEPTION 'protocol reference snapshot mutation was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%ADIPOMETRY_PROTOCOL_REFERENCE_SNAPSHOT_IMMUTABLE%' THEN RAISE; END IF;
  END;

  UPDATE "AdipometryClinicalResponsibility"
  SET "effectiveTo" = CURRENT_TIMESTAMP,
      "endedByUserId" = 'issue246-actor-manager-user',
      "endedAt" = CURRENT_TIMESTAMP,
      "endReason" = 'valid audited responsibility transition',
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE id = 'issue246-valid-responsibility';
END;
$$;

ROLLBACK;
SQL

echo "adipometry governance audit finding controls OK"
