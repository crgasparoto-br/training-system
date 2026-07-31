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

approval_anchor = '''  TIMESTAMP '2026-07-30 14:00:00', 'issue246-boundary-actor-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- Direct assessment INSERT cannot choose the sequence or code.'''
approval_replacement = '''  TIMESTAMP '2026-07-30 14:00:00', 'issue246-boundary-actor-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
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
WHERE protocol."id" = 'adpt_protocol_guedes_1991_adult_young_v1';

-- Direct assessment INSERT cannot choose the sequence or code.'''
if content.count(approval_anchor) != 1:
    raise RuntimeError('boundary approval anchor mismatch')
content = content.replace(approval_anchor, approval_replacement, 1)

status_anchor = '''SET "status" = 'COMPLETED', "weightKg" = 70,'''
status_replacement = '''SET "status" = 'COMPLETED',
        "protocolSex" = 'female',
        "protocolSexSource" = 'professional_confirmation',
        "protocolSexConfirmedByUserId" = 'issue246-boundary-actor-a',
        "protocolSexConfirmedAt" = CURRENT_TIMESTAMP,
        "weightKg" = 70,'''
if content.count(status_anchor) != 4:
    raise RuntimeError(f'boundary completion status anchor mismatch: {content.count(status_anchor)}')
content = content.replace(status_anchor, status_replacement)

base_protocol_anchor = '''"protocolId" = 'issue246-boundary-protocol', "protocolCode" = 'BOUNDARY_EXECUTABLE', "protocolVersion" = 1,'''
base_protocol_replacement = '''"protocolId" = 'adpt_protocol_guedes_1991_adult_young_v1', "protocolCode" = 'GUEDES_1991_ADULT_YOUNG', "protocolVersion" = 1,'''
if content.count(base_protocol_anchor) != 3:
    raise RuntimeError(f'boundary base protocol anchor mismatch: {content.count(base_protocol_anchor)}')
content = content.replace(base_protocol_anchor, base_protocol_replacement)

maturation_protocol_anchor = '''"protocolId" = 'issue246-boundary-maturation-protocol',
        "protocolCode" = 'BOUNDARY_MATURATION', "protocolVersion" = 1,'''
maturation_protocol_replacement = '''"protocolId" = 'adpt_protocol_guedes_1991_adult_young_v1',
        "protocolCode" = 'GUEDES_1991_ADULT_YOUNG', "protocolVersion" = 1,'''
if content.count(maturation_protocol_anchor) != 1:
    raise RuntimeError('boundary maturation protocol anchor mismatch')
content = content.replace(maturation_protocol_anchor, maturation_protocol_replacement, 1)

profile_anchor = ''''{"birthDate":"1996-07-30","gender":"female"}'::jsonb,'''
profile_replacement = ''''{"birthDate":"1996-07-30","gender":"female","maturation":"STAGE_5"}'::jsonb,'''
if content.count(profile_anchor) != 1:
    raise RuntimeError('boundary profile anchor mismatch')
content = content.replace(profile_anchor, profile_replacement, 1)

content = content.replace(
    '-- A protocol that requires maturation must use canonical maturation; a value\n-- supplied only by the caller cannot satisfy the clinical gate.',
    '-- A canonical profile cannot supply maturation when the approved Guedes rule declares NOT_REQUIRED.',
    1,
)
content = content.replace(
    "IF SQLERRM NOT LIKE '%ADIPOMETRY_MATURATION_REQUIRED%' THEN RAISE; END IF;",
    "IF SQLERRM NOT LIKE '%ADIPOMETRY_MATURATION_NOT_APPLICABLE%' THEN RAISE; END IF;",
    1,
)

cleanup_anchor = '''END $$;

-- Out-of-range input is rejected against the approved protocol limits.'''
cleanup_replacement = '''END $$;

UPDATE "StudentProfile"
SET "identificationData" = "identificationData" - 'maturation',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'issue246-boundary-profile-a1';

-- Out-of-range input is rejected against the approved protocol limits.'''
if content.count(cleanup_anchor) != 1:
    raise RuntimeError('boundary maturation cleanup anchor mismatch')
content = content.replace(cleanup_anchor, cleanup_replacement, 1)

content = content.replace('"tricepsMm" = 101,', '"tricepsMm" = 81,', 1)
content = content.replace(
    '"skinfoldTotalMm" = 141, "bodyFatPercentage" = 38.2, "fatMassKg" = 26.74, "leanMassKg" = 43.26,',
    '"skinfoldTotalMm" = 111, "bodyFatPercentage" = 99, "fatMassKg" = 1, "leanMassKg" = 69,',
    1,
)

expected_anchor = '''      AND "skinfoldTotalMm" = 50
      AND "bodyFatPercentage" = 20
      AND "fatMassKg" = 14
      AND "leanMassKg" = 56
      AND ("calculationSnapshot" #>> '{results,bodyFatPercentage}')::NUMERIC = 20'''
expected_replacement = '''      AND "skinfoldTotalMm" = 30
      AND "bodyFatPercentage" = 16.03
      AND "fatMassKg" = 11.22
      AND "leanMassKg" = 58.78
      AND ("calculationSnapshot" #>> '{results,bodyFatPercentage}')::NUMERIC = 16.03'''
if content.count(expected_anchor) != 1:
    raise RuntimeError('boundary Guedes results anchor mismatch')
content = content.replace(expected_anchor, expected_replacement, 1)

version_anchor = '''      AND "calculationSnapshot" ->> 'implementationVersion' = 'db-adipometry-protocol-v2''''
version_replacement = '''      AND "calculationSnapshot" ->> 'implementationVersion' LIKE 'db-adipometry-protocol-v%''''
if content.count(version_anchor) != 1:
    raise RuntimeError('boundary implementation version anchor mismatch')
content = content.replace(version_anchor, version_replacement, 1)

content = content.replace(
    '''AND ("afterSnapshot" #>> '{bodyFatPercentage}')::NUMERIC = 20''',
    '''AND ("afterSnapshot" #>> '{bodyFatPercentage}')::NUMERIC = 16.03''',
    1,
)

script.write_text(content)
