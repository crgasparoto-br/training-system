from pathlib import Path

script = Path('scripts/verify-adipometry-canonical-profile-contract.sh')
content = script.read_text()

profile_anchor = '''  INSERT INTO "Aluno" (
    "id", "contractId", "birthDate", "createdAt", "updatedAt"
  ) VALUES ('''
profile_replacement = '''  UPDATE "Professor"
  SET "role" = 'master', "currentStatus" = 'active'
  WHERE "id" = 'issue246-profile-professor';

  INSERT INTO "Profile" (
    "id", "userId", "name", "cref", "createdAt", "updatedAt"
  ) VALUES (
    'issue246-profile-user-profile', 'issue246-profile-actor',
    'Canonical profile evaluator', 'CREF-PROFILE-246',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

  INSERT INTO "Aluno" (
    "id", "contractId", "birthDate", "createdAt", "updatedAt"
  ) VALUES ('''
if content.count(profile_anchor) != 1:
    raise RuntimeError('canonical profile setup anchor mismatch')
content = content.replace(profile_anchor, profile_replacement, 1)

approval_anchor = '''  'issue246-profile-actor', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

SELECT * FROM "createAdipometryDraft"('''
approval_replacement = '''  'issue246-profile-actor', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "AdipometryClinicalResponsibility" (
  "id", "contractId", "domain", "professorId", "effectiveFrom",
  "designatedByUserId", "designatedAt", "createdAt", "updatedAt"
) VALUES (
  'issue246-profile-responsibility', 'issue246-profile-contract',
  'ADIPOMETRY_CLINICAL_RESPONSIBLE', 'issue246-profile-professor',
  TIMESTAMP '2026-07-30 19:00:00', 'issue246-profile-actor',
  TIMESTAMP '2026-07-30 19:00:00', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "AdipometryProtocolApproval" (
  "id", "contractId", "protocolId", "protocolCode", "protocolVersion",
  "responsibilityId", "approvedByProfessorId", "approvedByUserId", "approvedAt",
  "approvalStatement", "approvedByNameSnapshot", "approvedByCrefSnapshot",
  "approvedSpecificationHash", "protocolDefinitionSnapshot", "createdAt"
)
SELECT
  'issue246-profile-contract-approval', 'issue246-profile-contract',
  protocol."id", protocol."code", protocol."version",
  'issue246-profile-responsibility', 'issue246-profile-professor',
  'issue246-profile-actor', TIMESTAMP '2026-07-30 20:00:00',
  'Declaro que revisei e aprovo esta versão do protocolo para uso clínico neste contrato.',
  'Canonical profile evaluator', 'CREF-PROFILE-246', REPEAT('e', 64),
  protocol."definitionSnapshot", CURRENT_TIMESTAMP
FROM "AdipometryProtocol" protocol
WHERE protocol."id" = 'issue246-profile-approved';

SELECT * FROM "createAdipometryDraft"('''
if content.count(approval_anchor) != 1:
    raise RuntimeError('canonical profile approval anchor mismatch')
content = content.replace(approval_anchor, approval_replacement, 1)

script.write_text(content)
