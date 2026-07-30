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
protocol_anchor = '''    "protocolId"='issue246-profile-approved',
    "protocolCode"='CANONICAL_REQUIRED',
    "protocolVersion"=1,'''
protocol_replacement = '''    "protocolId"='adpt_protocol_guedes_1991_adult_young_v1',
    "protocolCode"='GUEDES_1991_ADULT_YOUNG',
    "protocolVersion"=1,'''
if content.count(protocol_anchor) != 2:
    raise RuntimeError('canonical assessment protocol anchor mismatch')
content = content.replace(protocol_anchor, protocol_replacement)
status_anchor = '''  SET "status"='COMPLETED',
      "weightKg"=60.00,'''
status_replacement = '''  SET "status"='COMPLETED',
      "protocolSex"='female',
      "protocolSexSource"='professional_confirmation',
      "protocolSexConfirmedByUserId"='issue246-profile-actor',
      "protocolSexConfirmedAt"=CURRENT_TIMESTAMP,
      "weightKg"=60.00,'''
if content.count(status_anchor) != 2:
    raise RuntimeError('canonical completion status anchor mismatch')
content = content.replace(status_anchor, status_replacement)
content = content.replace(
    '''AND "calculationSnapshot" -> 'profileCriteria' = '{"sex":"FEMALE","maturation":null}'::jsonb''',
    '''AND "calculationSnapshot" -> 'profileCriteria' @> '{"sex":"FEMALE","maturation":null}'::jsonb''',
    1,
)
script.write_text(content)
