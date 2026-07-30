from pathlib import Path

script = Path('scripts/verify-adipometry-persistence-boundaries.sh')
content = script.read_text()

setup_anchor = '''  INSERT INTO "Aluno" ("id", "contractId", "createdAt", "updatedAt") VALUES
    ('issue246-boundary-aluno-a1', 'issue246-boundary-contract-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),'''
setup_replacement = '''  UPDATE "Professor"
  SET "role" = 'master', "currentStatus" = 'active'
  WHERE "id" = 'issue246-boundary-professor-a';

  INSERT INTO "Profile" (
    "id", "userId", "name", "cref", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-boundary-profile-actor-a', 'issue246-boundary-actor-a',
    'Boundary clinical responsible', 'CREF-BOUNDARY-246',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  INSERT INTO "Aluno" ("id", "contractId", "createdAt", "updatedAt") VALUES
    ('issue246-boundary-aluno-a1', 'issue246-boundary-contract-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),'''
if content.count(setup_anchor) != 1:
    raise RuntimeError('boundary setup anchor mismatch')
content = content.replace(setup_anchor, setup_replacement, 1)

responsibility_anchor = '''END $$;

CREATE OR REPLACE FUNCTION pg_temp.issue246_boundary_definition()'''
responsibility_replacement = '''END $$;

INSERT INTO "AdipometryClinicalResponsibility" (
  "id", "contractId", "domain", "professorId", "effectiveFrom",
  "designatedByUserId", "designatedAt", "createdAt", "updatedAt"
) VALUES (
  'issue246-boundary-responsibility-a', 'issue246-boundary-contract-a',
  'ADIPOMETRY_CLINICAL_RESPONSIBLE', 'issue246-boundary-professor-a',
  TIMESTAMP '2026-07-30 14:00:00', 'issue246-boundary-actor-a',
  TIMESTAMP '2026-07-30 14:00:00', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION pg_temp.issue246_boundary_definition()'''
if content.count(responsibility_anchor) != 1:
    raise RuntimeError('boundary responsibility anchor mismatch')
content = content.replace(responsibility_anchor, responsibility_replacement, 1)

base_approval_anchor = '''  TIMESTAMP '2026-07-30 14:00:00', 'issue246-boundary-actor-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- Direct assessment INSERT cannot choose the sequence or code.'''
base_approval_replacement = '''  TIMESTAMP '2026-07-30 14:00:00', 'issue246-boundary-actor-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "AdipometryProtocolApproval" (
  "id", "contractId", "protocolId", "protocolCode", "protocolVersion",
  "responsibilityId", "approvedByProfessorId", "approvedByUserId", "approvedAt",
  "approvalStatement", "approvedByNameSnapshot", "approvedByCrefSnapshot",
  "approvedSpecificationHash", "protocolDefinitionSnapshot", "createdAt"
)
SELECT
  'issue246-boundary-approval-a', 'issue246-boundary-contract-a',
  protocol."id", protocol."code", protocol."version",
  'issue246-boundary-responsibility-a', 'issue246-boundary-professor-a',
  'issue246-boundary-actor-a', TIMESTAMP '2026-07-30 14:30:00',
  'Declaro que revisei e aprovo esta versão do protocolo para uso clínico neste contrato.',
  'Boundary clinical responsible', 'CREF-BOUNDARY-246', REPEAT('c', 64),
  protocol."definitionSnapshot", CURRENT_TIMESTAMP
FROM "AdipometryProtocol" protocol
WHERE protocol."id" = 'issue246-boundary-protocol';

-- Direct assessment INSERT cannot choose the sequence or code.'''
if content.count(base_approval_anchor) != 1:
    raise RuntimeError('boundary base approval anchor mismatch')
content = content.replace(base_approval_anchor, base_approval_replacement, 1)

maturation_approval_anchor = '''  TIMESTAMP '2026-07-30 14:00:00', 'issue246-boundary-actor-a',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

DO $$ BEGIN
  BEGIN
    UPDATE "AdipometryAssessment"
    SET "status" = 'COMPLETED', "weightKg" = 70,'''
maturation_approval_replacement = '''  TIMESTAMP '2026-07-30 14:00:00', 'issue246-boundary-actor-a',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "AdipometryProtocolApproval" (
  "id", "contractId", "protocolId", "protocolCode", "protocolVersion",
  "responsibilityId", "approvedByProfessorId", "approvedByUserId", "approvedAt",
  "approvalStatement", "approvedByNameSnapshot", "approvedByCrefSnapshot",
  "approvedSpecificationHash", "protocolDefinitionSnapshot", "createdAt"
)
SELECT
  'issue246-boundary-maturation-approval-a', 'issue246-boundary-contract-a',
  protocol."id", protocol."code", protocol."version",
  'issue246-boundary-responsibility-a', 'issue246-boundary-professor-a',
  'issue246-boundary-actor-a', TIMESTAMP '2026-07-30 14:45:00',
  'Declaro que revisei e aprovo esta versão do protocolo para uso clínico neste contrato.',
  'Boundary clinical responsible', 'CREF-BOUNDARY-246', REPEAT('d', 64),
  protocol."definitionSnapshot", CURRENT_TIMESTAMP
FROM "AdipometryProtocol" protocol
WHERE protocol."id" = 'issue246-boundary-maturation-protocol';

DO $$ BEGIN
  BEGIN
    UPDATE "AdipometryAssessment"
    SET "status" = 'COMPLETED', "weightKg" = 70,'''
if content.count(maturation_approval_anchor) != 1:
    raise RuntimeError('boundary maturation approval anchor mismatch')
content = content.replace(maturation_approval_anchor, maturation_approval_replacement, 1)

script.write_text(content)
