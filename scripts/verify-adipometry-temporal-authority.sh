#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
PSQL_DATABASE_URL="${DATABASE_URL%%\?*}"

psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

CREATE ROLE issue246_runtime_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

DO $fixtures$
DECLARE
  v_contract_type TEXT;
  v_user_type TEXT;
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
    'INSERT INTO "Contract" (id, type, document, name, "createdAt", "updatedAt")
     VALUES (%L, %L::"ContractType", %L, %L, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    'issue246-temporal-contract', v_contract_type,
    'issue246-temporal-document', 'Issue 246 temporal authority'
  );

  INSERT INTO "CollaboratorFunctionOption" (
    id, "contractId", name, code, "isActive", "isSystem", "createdAt", "updatedAt"
  ) VALUES
    ('issue246-temporal-manager-function', 'issue246-temporal-contract',
     'ADPT governance manager', 'ISSUE246-TEMPORAL-MANAGER', TRUE, FALSE,
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-temporal-responsible-function', 'issue246-temporal-contract',
     'ADPT clinical responsible', 'ISSUE246-TEMPORAL-RESPONSIBLE', TRUE, FALSE,
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  EXECUTE FORMAT(
    'INSERT INTO "User" (id, email, "passwordHash", type, "createdAt", "updatedAt", "isActive") VALUES
      (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE),
      (%L, %L, %L, %L::"UserType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE)',
    'issue246-temporal-manager-user', 'issue246-temporal-manager@example.invalid',
    'not-a-password', v_user_type,
    'issue246-temporal-responsible-user', 'issue246-temporal-responsible@example.invalid',
    'not-a-password', v_user_type
  );

  INSERT INTO "Professor" (
    id, "userId", "contractId", "collaboratorFunctionId", "currentStatus",
    "createdAt", "updatedAt"
  ) VALUES
    ('issue246-temporal-manager-professor', 'issue246-temporal-manager-user',
     'issue246-temporal-contract', 'issue246-temporal-manager-function', 'active',
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-temporal-responsible-professor', 'issue246-temporal-responsible-user',
     'issue246-temporal-contract', 'issue246-temporal-responsible-function', 'active',
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  INSERT INTO "Profile" (id, "userId", name, cref, "createdAt", "updatedAt") VALUES
    ('issue246-temporal-manager-profile', 'issue246-temporal-manager-user',
     'Gestor temporal ADPT', 'CREF-MANAGER-246', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-temporal-responsible-profile', 'issue246-temporal-responsible-user',
     'Responsável temporal ADPT', 'CREF-RESP-246', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  INSERT INTO "AccessPermission" (
    id, "collaboratorFunctionId", "screenKey", "blockKey", "canView",
    "createdAt", "updatedAt"
  ) VALUES
    ('issue246-temporal-manage-permission', 'issue246-temporal-manager-function',
     'settings.contract', 'settings.contract.actions.manageClinicalTechnicalResponsibility',
     TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('issue246-temporal-approve-permission', 'issue246-temporal-responsible-function',
     'settings.contract', 'settings.contract.adipometryProtocolApproval',
     TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
END;
$fixtures$;

GRANT USAGE ON SCHEMA public TO issue246_runtime_app;
GRANT SELECT ON "Contract", "User", "Professor", "Profile", "CollaboratorFunctionOption",
  "AccessPermission", "AdipometryProtocol", "AdipometryClinicalResponsibility",
  "AdipometryProtocolApproval" TO issue246_runtime_app;
GRANT INSERT, UPDATE ON "AdipometryClinicalResponsibility", "AdipometryProtocolApproval"
  TO issue246_runtime_app;
GRANT UPDATE ON "AdipometryProtocol" TO issue246_runtime_app;

SET LOCAL ROLE issue246_runtime_app;

DO $missing_context$
BEGIN
  BEGIN
    INSERT INTO "AdipometryClinicalResponsibility" (
      id, "contractId", domain, "professorId", "effectiveFrom",
      "designatedByUserId", "designatedAt", "createdAt", "updatedAt"
    ) VALUES (
      'issue246-temporal-missing-context', 'issue246-temporal-contract',
      'ADIPOMETRY_CLINICAL_RESPONSIBLE', 'issue246-temporal-responsible-professor',
      TIMESTAMP '2000-01-01', 'issue246-temporal-manager-user', TIMESTAMP '2000-01-01',
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'governance write without actor context was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ADIPOMETRY_AUTHENTICATED_ACTOR_CONTEXT_REQUIRED%' THEN
      RAISE;
    END IF;
  END;
END;
$missing_context$;

SELECT set_config('app.adipometry_actor_user_id', 'issue246-temporal-responsible-user', TRUE);
DO $impersonated_designation$
BEGIN
  BEGIN
    INSERT INTO "AdipometryClinicalResponsibility" (
      id, "contractId", domain, "professorId", "effectiveFrom",
      "designatedByUserId", "designatedAt", "createdAt", "updatedAt"
    ) VALUES (
      'issue246-temporal-impersonated', 'issue246-temporal-contract',
      'ADIPOMETRY_CLINICAL_RESPONSIBLE', 'issue246-temporal-responsible-professor',
      TIMESTAMP '2000-01-01', 'issue246-temporal-manager-user', TIMESTAMP '2000-01-01',
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'eligible sibling actor impersonation was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ADIPOMETRY_RESPONSIBILITY_ACTOR_CONTEXT_MISMATCH%' THEN
      RAISE;
    END IF;
  END;
END;
$impersonated_designation$;

SELECT set_config('app.adipometry_actor_user_id', 'issue246-temporal-manager-user', TRUE);
INSERT INTO "AdipometryClinicalResponsibility" (
  id, "contractId", domain, "professorId", "effectiveFrom",
  "designatedByUserId", "designatedAt", "createdAt", "updatedAt"
) VALUES (
  'issue246-temporal-responsibility', 'issue246-temporal-contract',
  'ADIPOMETRY_CLINICAL_RESPONSIBLE', 'issue246-temporal-responsible-professor',
  TIMESTAMP '2000-01-01', 'issue246-temporal-manager-user', TIMESTAMP '2000-01-01',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

DO $designation_time$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryClinicalResponsibility"
    WHERE id = 'issue246-temporal-responsibility'
      AND "designatedAt" = CURRENT_TIMESTAMP
      AND "effectiveFrom" = CURRENT_TIMESTAMP
  ) THEN
    RAISE EXCEPTION 'database did not replace caller-controlled designation time';
  END IF;
END;
$designation_time$;

SELECT set_config('app.adipometry_actor_user_id', 'issue246-temporal-responsible-user', TRUE);
INSERT INTO "AdipometryProtocolApproval" (
  id, "contractId", "protocolId", "protocolCode", "protocolVersion",
  "responsibilityId", "approvedByProfessorId", "approvedByUserId", "approvedAt",
  "approvalStatement", "approvedByNameSnapshot", "approvedByCrefSnapshot",
  "approvedSpecificationHash", "protocolDefinitionSnapshot", "createdAt"
)
SELECT
  'issue246-temporal-approval', 'issue246-temporal-contract', protocol.id,
  protocol.code, protocol.version, 'issue246-temporal-responsibility',
  'issue246-temporal-responsible-professor', 'issue246-temporal-responsible-user',
  TIMESTAMP '2000-01-01',
  'Declaro que revisei e aprovo integralmente esta versão clínica da adipometria.',
  'Responsável temporal ADPT', 'CREF-RESP-246',
  "buildAdipometrySpecificationHash"(
    protocol.code, protocol.version, protocol.reference, protocol."definitionSnapshot"
  ),
  protocol."definitionSnapshot", CURRENT_TIMESTAMP
FROM "AdipometryProtocol" protocol
WHERE protocol.code = 'GUEDES_1991_ADULT_YOUNG' AND protocol.version = 1;

DO $approval_time$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryProtocolApproval"
    WHERE id = 'issue246-temporal-approval' AND "approvedAt" = CURRENT_TIMESTAMP
  ) THEN
    RAISE EXCEPTION 'database did not replace caller-controlled approval time';
  END IF;
END;
$approval_time$;

DO $protocol_identity$
BEGIN
  BEGIN
    UPDATE "AdipometryProtocol"
    SET reference = reference || ' altered under same version', "updatedAt" = CURRENT_TIMESTAMP
    WHERE code = 'GUEDES_1991_ADULT_YOUNG' AND version = 1;
    RAISE EXCEPTION 'approved protocol definition changed under the same code/version';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Referenced adipometry protocol identity is immutable%' THEN
      RAISE;
    END IF;
  END;
END;
$protocol_identity$;

SELECT set_config('app.adipometry_actor_user_id', 'issue246-temporal-manager-user', TRUE);
DO $impersonated_revocation$
BEGIN
  BEGIN
    UPDATE "AdipometryProtocolApproval"
    SET "revokedAt" = TIMESTAMP '2000-01-01',
        "revokedByProfessorId" = 'issue246-temporal-responsible-professor',
        "revokedByUserId" = 'issue246-temporal-responsible-user',
        "revocationReason" = 'Tentativa de revogação por ator impersonado.'
    WHERE id = 'issue246-temporal-approval';
    RAISE EXCEPTION 'approval revocation accepted an impersonated eligible actor';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ADIPOMETRY_PROTOCOL_ACTOR_CONTEXT_MISMATCH%' THEN
      RAISE;
    END IF;
  END;
END;
$impersonated_revocation$;

SELECT set_config('app.adipometry_actor_user_id', 'issue246-temporal-responsible-user', TRUE);
UPDATE "AdipometryProtocolApproval"
SET "revokedAt" = TIMESTAMP '2000-01-01',
    "revokedByProfessorId" = 'issue246-temporal-responsible-professor',
    "revokedByUserId" = 'issue246-temporal-responsible-user',
    "revocationReason" = 'Revogação temporal auditada com instante autoritativo.'
WHERE id = 'issue246-temporal-approval';

DO $revocation_time$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryProtocolApproval"
    WHERE id = 'issue246-temporal-approval' AND "revokedAt" = CURRENT_TIMESTAMP
  ) THEN
    RAISE EXCEPTION 'database did not replace caller-controlled revocation time';
  END IF;
END;
$revocation_time$;

SELECT set_config('app.adipometry_actor_user_id', 'issue246-temporal-manager-user', TRUE);
UPDATE "AdipometryClinicalResponsibility"
SET "effectiveTo" = TIMESTAMP '2000-01-01',
    "endedByUserId" = 'issue246-temporal-manager-user',
    "endedAt" = TIMESTAMP '2000-01-01',
    "endReason" = 'Encerramento temporal auditado.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'issue246-temporal-responsibility';

DO $termination_time$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AdipometryClinicalResponsibility"
    WHERE id = 'issue246-temporal-responsibility'
      AND "endedAt" = CURRENT_TIMESTAMP
      AND "effectiveTo" = CURRENT_TIMESTAMP
  ) THEN
    RAISE EXCEPTION 'database did not replace caller-controlled termination time';
  END IF;
END;
$termination_time$;

SELECT set_config('app.adipometry_actor_user_id', 'issue246-temporal-responsible-user', TRUE);
DO $former_responsible_backdate$
BEGIN
  BEGIN
    INSERT INTO "AdipometryProtocolApproval" (
      id, "contractId", "protocolId", "protocolCode", "protocolVersion",
      "responsibilityId", "approvedByProfessorId", "approvedByUserId", "approvedAt",
      "approvalStatement", "approvedByNameSnapshot", "approvedByCrefSnapshot",
      "approvedSpecificationHash", "protocolDefinitionSnapshot", "createdAt"
    )
    SELECT
      'issue246-temporal-backdated-approval', 'issue246-temporal-contract', protocol.id,
      protocol.code, protocol.version, 'issue246-temporal-responsibility',
      'issue246-temporal-responsible-professor', 'issue246-temporal-responsible-user',
      TIMESTAMP '2000-01-01',
      'Declaração retroativa que deve ser rejeitada depois do encerramento da responsabilidade.',
      'Responsável temporal ADPT', 'CREF-RESP-246',
      "buildAdipometrySpecificationHash"(
        protocol.code, protocol.version, protocol.reference, protocol."definitionSnapshot"
      ),
      protocol."definitionSnapshot", CURRENT_TIMESTAMP
    FROM "AdipometryProtocol" protocol
    WHERE protocol.code = 'GUEDES_1991_ADULT_YOUNG' AND protocol.version = 1;
    RAISE EXCEPTION 'former responsible backdated an approval after termination';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ADIPOMETRY_APPROVAL_REQUIRES_ACTIVE_RESPONSIBLE%' THEN
      RAISE;
    END IF;
  END;
END;
$former_responsible_backdate$;

RESET ROLE;
ROLLBACK;
SQL

echo "adipometry temporal authority and protocol identity controls OK"
