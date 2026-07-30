from pathlib import Path

migration = Path('/tmp/issue246transport/apps/api/prisma/migrations/20260730224500_add_adipometry_clinical_governance/migration.sql')
sql = migration.read_text()
mode_anchor = '''  ELSIF v_mode <> 'NOT_REQUIRED' THEN
    RAISE EXCEPTION 'ADIPOMETRY_MATURATION_RULE_INVALID' USING ERRCODE = '23514';
  END IF;'''
mode_replacement = '''  ELSIF v_mode = 'NOT_REQUIRED' THEN
    IF v_maturation IS NOT NULL THEN
      RAISE EXCEPTION 'ADIPOMETRY_MATURATION_NOT_APPLICABLE' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'ADIPOMETRY_MATURATION_RULE_INVALID' USING ERRCODE = '23514';
  END IF;'''
if sql.count(mode_anchor) != 1:
    raise RuntimeError('maturation mode anchor mismatch')
sql = sql.replace(mode_anchor, mode_replacement, 1)
migration.write_text(sql)

script = Path('scripts/verify-adipometry-canonical-profile-contract.sh')
content = script.read_text()
content = content.replace(
    "WHERE protocol.\"id\" = 'issue246-profile-approved';",
    "WHERE protocol.\"id\" = 'adpt_protocol_guedes_1991_adult_young_v1';",
    1,
)

negative_block = '''after_profile_update=$(cat <<'SQL'
BEGIN;
SELECT set_config('app.current_user_id', 'issue246-profile-actor', true);
UPDATE "AdipometryAssessment"
SET "status" = 'COMPLETED',
    "protocolSex" = 'female',
    "protocolSexSource" = 'professional_confirmation',
    "protocolSexConfirmedByUserId" = 'issue246-profile-actor',
    "protocolSexConfirmedAt" = CURRENT_TIMESTAMP,
    "weightKg" = 70,
    "tricepsMm" = 10,
    "subscapularMm" = 10,
    "suprailiacMm" = 10,
    "abdominalMm" = 10,
    "thighMm" = 10,
    "protocolId" = 'adpt_protocol_guedes_1991_adult_young_v1',
    "protocolCode" = 'GUEDES_1991_ADULT_YOUNG',
    "protocolVersion" = 1,
    "calculationSnapshot" = '{}'::jsonb
WHERE "id" = 'issue246-profile-draft';
COMMIT;
SQL
)'''
lines = content.splitlines()
negative_indexes = [index for index, line in enumerate(lines) if line.startswith('after_profile_update=')]
if len(negative_indexes) != 1:
    raise RuntimeError(f'negative profile scenario anchor mismatch: {len(negative_indexes)}')
lines[negative_indexes[0]] = negative_block
content = '\n'.join(lines) + '\n'

replacements = [
    (
        '''SET "status" = 'COMPLETED',
    "weightKg" = 70,''',
        '''SET "status" = 'COMPLETED',
    "protocolSex" = 'female',
    "protocolSexSource" = 'professional_confirmation',
    "protocolSexConfirmedByUserId" = 'issue246-profile-actor',
    "protocolSexConfirmedAt" = CURRENT_TIMESTAMP,
    "weightKg" = 70,''',
        1,
        'multiline completion status',
    ),
    (
        '''    "protocolId" = 'issue246-profile-approved',
    "protocolCode" = 'CANONICAL_REQUIRED',
    "protocolVersion" = 1,''',
        '''    "protocolId" = 'adpt_protocol_guedes_1991_adult_young_v1',
    "protocolCode" = 'GUEDES_1991_ADULT_YOUNG',
    "protocolVersion" = 1,''',
        1,
        'multiline protocol',
    ),
    (
        '''SET "identificationData" = JSONB_SET("identificationData", '{maturation}', '"adult"'::jsonb),''',
        '''SET "identificationData" = "identificationData" - 'maturation',''',
        1,
        'positive profile maturation removal',
    ),
    (
        '''      AND "bodyFatPercentage" = 20
      AND "fatMassKg" = 14
      AND "leanMassKg" = 56''',
        '''      AND "skinfoldTotalMm" = 30
      AND "bodyFatPercentage" = 16.03
      AND "fatMassKg" = 11.22
      AND "leanMassKg" = 58.78''',
        1,
        'Guedes expected results',
    ),
    (
        '''      AND "calculationSnapshot" #>> '{profileCriteria,maturation}' = 'ADULT' ''',
        '''      AND "calculationSnapshot" #> '{profileCriteria,maturation}' = 'null'::jsonb ''',
        1,
        'null maturation expectation',
    ),
    (
        '''      AND "calculationSnapshot" #>> '{profileCriteria,sources,maturation,kind}' = 'STUDENT_PROFILE' ''',
        '''      AND "calculationSnapshot" #> '{profileCriteria,sources,maturation}' = 'null'::jsonb ''',
        1,
        'null maturation source expectation',
    ),
]
for old, new, expected_count, label in replacements:
    actual = content.count(old)
    if actual != expected_count:
        raise RuntimeError(f'{label} anchor mismatch: expected {expected_count}, got {actual}')
    content = content.replace(old, new, expected_count)

script.write_text(content)
