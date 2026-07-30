from pathlib import Path
migration = Path('/tmp/issue246transport/apps/api/prisma/migrations/20260730224500_add_adipometry_clinical_governance/migration.sql')
sql = migration.read_text()
sql = sql.replace(
    'BEGIN;\n\n-- Issue #246:',
    'BEGIN;\n\n' + 'CREATE OR REPLACE FUNCTION "roundAdipometryValue"(\n  p_value NUMERIC,\n  p_scale INTEGER,\n  p_mode TEXT\n) RETURNS NUMERIC\nLANGUAGE plpgsql\nIMMUTABLE\nSTRICT\nAS $round$\nDECLARE\n  v_factor NUMERIC;\n  v_absolute NUMERIC;\n  v_lower NUMERIC;\n  v_fraction NUMERIC;\n  v_rounded NUMERIC;\nBEGIN\n  IF p_scale < 0 OR p_scale > 8 THEN\n    RAISE EXCEPTION \'ADIPOMETRY_ROUNDING_SCALE_INVALID\' USING ERRCODE = \'22023\';\n  END IF;\n  IF p_mode = \'HALF_UP\' THEN RETURN ROUND(p_value, p_scale); END IF;\n  IF p_mode <> \'HALF_EVEN\' THEN\n    RAISE EXCEPTION \'ADIPOMETRY_ROUNDING_MODE_INVALID\' USING ERRCODE = \'22023\';\n  END IF;\n  v_factor := POWER(10::NUMERIC, p_scale);\n  v_absolute := ABS(p_value) * v_factor;\n  v_lower := FLOOR(v_absolute);\n  v_fraction := v_absolute - v_lower;\n  IF v_fraction < 0.5 THEN v_rounded := v_lower;\n  ELSIF v_fraction > 0.5 THEN v_rounded := v_lower + 1;\n  ELSIF MOD(v_lower, 2) = 0 THEN v_rounded := v_lower;\n  ELSE v_rounded := v_lower + 1; END IF;\n  RETURN SIGN(p_value) * v_rounded / v_factor;\nEND;\n$round$;\n\n' + '-- Issue #246:',
    1,
)
sql = sql.replace(
    'FOREIGN KEY ("professorId", "contractId") REFERENCES "Professor"("id", "contractId")\n  ON DELETE RESTRICT ON UPDATE CASCADE;',
    'FOREIGN KEY ("professorId") REFERENCES "Professor"("id")\n  ON DELETE RESTRICT ON UPDATE CASCADE;',
)
sql = sql.replace(
    'FOREIGN KEY ("approvedByProfessorId", "contractId")\n  REFERENCES "Professor"("id", "contractId") ON DELETE RESTRICT ON UPDATE CASCADE;',
    'FOREIGN KEY ("approvedByProfessorId")\n  REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;',
)
sql = sql.replace(
    'FOREIGN KEY ("protocolId", "protocolCode", "protocolVersion")\n  REFERENCES "AdipometryProtocol"("id", "code", "version") ON DELETE RESTRICT ON UPDATE CASCADE;',
    'FOREIGN KEY ("protocolId")\n  REFERENCES "AdipometryProtocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;',
)
sql = sql.replace(
    "  IF JSONB_TYPEOF(p_definition -> 'testVectors') IS DISTINCT FROM 'array'\n     OR JSONB_ARRAY_LENGTH(p_definition -> 'testVectors') < 3 THEN RETURN FALSE; END IF;",
    "  IF JSONB_TYPEOF(p_definition -> 'testVectors') IS DISTINCT FROM 'array'\n     OR JSONB_ARRAY_LENGTH(p_definition -> 'testVectors') < 3 THEN RETURN FALSE; END IF;\n  RETURN TRUE;",
    1,
)

canonical_profile_validator = r'''CREATE OR REPLACE FUNCTION "validateAdipometryCanonicalProtocolProfile"()
RETURNS trigger
LANGUAGE plpgsql
AS $profile$
DECLARE
  v_definition JSONB;
  v_profile JSONB;
  v_rule JSONB;
  v_mode TEXT;
  v_sex TEXT;
  v_maturation TEXT;
BEGIN
  IF NEW."status" <> 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" = 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  SELECT approval."protocolDefinitionSnapshot"
    INTO v_definition
  FROM "AdipometryProtocolApproval" approval
  JOIN "AdipometryProtocol" protocol
    ON protocol."id" = approval."protocolId"
   AND protocol."code" = approval."protocolCode"
   AND protocol."version" = approval."protocolVersion"
  WHERE approval."contractId" = NEW."contractId"
    AND approval."protocolId" = NEW."protocolId"
    AND approval."protocolCode" = NEW."protocolCode"
    AND approval."protocolVersion" = NEW."protocolVersion"
    AND protocol."status" <> 'DISABLED';

  IF NOT FOUND
     OR NOT COALESCE("isValidAdipometryCanonicalPopulation"(v_definition), FALSE) THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROTOCOL_CANONICAL_PROFILE_INVALID' USING ERRCODE = '23514';
  END IF;

  IF JSONB_TYPEOF(NEW."calculationSnapshot" -> 'profileCriteria') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ADIPOMETRY_PROFILE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  v_profile := NEW."calculationSnapshot" -> 'profileCriteria';
  v_sex := UPPER(BTRIM(COALESCE(v_profile ->> 'sex', '')));
  v_maturation := NULLIF(UPPER(BTRIM(COALESCE(v_profile ->> 'maturation', ''))), '');

  IF v_sex NOT IN ('MALE', 'FEMALE', 'OTHER') THEN
    RAISE EXCEPTION 'ADIPOMETRY_SEX_INVALID' USING ERRCODE = '23514';
  END IF;

  IF NOT ((v_definition #> '{population,sexCriteria}') @> JSONB_BUILD_ARRAY(v_sex)) THEN
    RAISE EXCEPTION 'ADIPOMETRY_SEX_NOT_APPLICABLE' USING ERRCODE = '23514';
  END IF;

  v_rule := v_definition #> '{population,maturationRule}';
  v_mode := v_rule ->> 'mode';

  IF v_mode = 'REQUIRED' THEN
    IF v_maturation IS NULL THEN
      RAISE EXCEPTION 'ADIPOMETRY_MATURATION_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF NOT ((v_rule -> 'allowedValues') @> JSONB_BUILD_ARRAY(v_maturation)) THEN
      RAISE EXCEPTION 'ADIPOMETRY_MATURATION_NOT_APPLICABLE' USING ERRCODE = '23514';
    END IF;
  ELSIF v_mode <> 'NOT_REQUIRED' THEN
    RAISE EXCEPTION 'ADIPOMETRY_MATURATION_RULE_INVALID' USING ERRCODE = '23514';
  END IF;

  NEW."calculationSnapshot" := JSONB_SET(
    NEW."calculationSnapshot",
    '{profileCriteria,sex}',
    TO_JSONB(v_sex),
    TRUE
  );
  NEW."calculationSnapshot" := JSONB_SET(
    NEW."calculationSnapshot",
    '{profileCriteria,maturation}',
    CASE WHEN v_maturation IS NULL THEN 'null'::JSONB ELSE TO_JSONB(v_maturation) END,
    TRUE
  );

  RETURN NEW;
END;
$profile$;

'''
sql = sql.replace(
    'CREATE OR REPLACE FUNCTION "canonicalizeAdipometryCompletion"()',
    canonical_profile_validator + 'CREATE OR REPLACE FUNCTION "canonicalizeAdipometryCompletion"()',
    1,
)
migration.write_text(sql)

for script_name in [
    'verify-adipometry-migration-existing-data.sh',
    'verify-adipometry-migration-full-chain.sh',
]:
    script = Path('scripts') / script_name
    content = script.read_text()
    case_continuation = '|' + chr(92) + '\n'
    loop_continuation = ' ' + chr(92) + '\n'
    content = content.replace(
        '    20260730204000_canonicalize_legacy_no_maturation_rule)',
        '    20260730204000_canonicalize_legacy_no_maturation_rule' + case_continuation
        + '    20260730210000_remove_adipometry_textual_maturation_inference' + case_continuation
        + '    20260730211000_use_structured_adipometry_maturation_rule' + case_continuation
        + '    20260730224500_add_adipometry_clinical_governance)',
        1,
    )
    content = content.replace(
        '  20260730204000_canonicalize_legacy_no_maturation_rule\n',
        '  20260730204000_canonicalize_legacy_no_maturation_rule' + loop_continuation
        + '  20260730210000_remove_adipometry_textual_maturation_inference' + loop_continuation
        + '  20260730211000_use_structured_adipometry_maturation_rule' + loop_continuation
        + '  20260730224500_add_adipometry_clinical_governance\n',
        1,
    )
    script.write_text(content)

foundation_v2 = Path('scripts/verify-adipometry-foundation-v2.sh')
content = foundation_v2.read_text()
profile_sql = '\n'.join([
    '  UPDATE "Professor"',
    '  SET "role" = \'master\', "currentStatus" = \'active\'',
    '  WHERE "id" = \'issue246-r2-professor-responsible\';',
    '',
    '  INSERT INTO "Profile" ("id", "userId", "name", "cref", "createdAt", "updatedAt") VALUES',
    "    ('issue246-r2-profile-responsible', 'issue246-r2-responsible', 'Responsável clínico R2', 'CREF-R2-0001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);",
    '',
    '  INSERT INTO "Aluno" ("id", "contractId", "createdAt", "updatedAt") VALUES',
])
content = content.replace(
    '  INSERT INTO "Aluno" ("id", "contractId", "createdAt", "updatedAt") VALUES',
    profile_sql,
    1,
)
governance_sql = '\n'.join([
    'RESET TIME ZONE;',
    '',
    'INSERT INTO "AdipometryClinicalResponsibility" (',
    '  "id", "contractId", "domain", "professorId", "effectiveFrom",',
    '  "designatedByUserId", "designatedAt", "createdAt", "updatedAt"',
    ') VALUES (',
    "  'issue246-r2-clinical-responsibility', 'issue246-r2-contract-a',",
    "  'ADIPOMETRY_CLINICAL_RESPONSIBLE', 'issue246-r2-professor-responsible',",
    "  TIMESTAMP '2026-07-30 12:00:00', 'issue246-r2-actor',",
    "  TIMESTAMP '2026-07-30 12:00:00', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP",
    ');',
    '',
    'INSERT INTO "AdipometryProtocolApproval" (',
    '  "id", "contractId", "protocolId", "protocolCode", "protocolVersion",',
    '  "responsibilityId", "approvedByProfessorId", "approvedByUserId", "approvedAt",',
    '  "approvalStatement", "approvedByNameSnapshot", "approvedByCrefSnapshot",',
    '  "approvedSpecificationHash", "protocolDefinitionSnapshot", "createdAt"',
    ')',
    'SELECT',
    "  'issue246-r2-contract-approval', 'issue246-r2-contract-a', protocol.id, protocol.code, protocol.version,",
    "  'issue246-r2-clinical-responsibility', 'issue246-r2-professor-responsible',",
    "  'issue246-r2-responsible', TIMESTAMP '2026-07-30 13:00:00',",
    "  'Declaro que revisei e aprovo esta versão do protocolo para uso clínico neste contrato.',",
    "  'Responsável clínico R2', 'CREF-R2-0001', repeat('a', 64),",
    '  protocol."definitionSnapshot", CURRENT_TIMESTAMP',
    'FROM "AdipometryProtocol" protocol',
    "WHERE protocol.id = 'adpt_protocol_guedes_1991_adult_young_v1';",
    '',
    'SELECT * FROM "createAdipometryDraft"(',
])
content = content.replace(
    'RESET TIME ZONE;\n\nSELECT * FROM "createAdipometryDraft"(',
    governance_sql,
    1,
)
content = content.replace(
    '"protocolId"=\'issue246-r2-approved\', "protocolCode"=\'R2_EXECUTABLE\', "protocolVersion"=1,',
    '"protocolId"=\'adpt_protocol_guedes_1991_adult_young_v1\', "protocolCode"=\'GUEDES_1991_ADULT_YOUNG\', "protocolVersion"=1, "protocolSex"=\'female\', "protocolSexSource"=\'professional_confirmation\', "protocolSexConfirmedByUserId"=\'issue246-r2-responsible\', "protocolSexConfirmedAt"=CURRENT_TIMESTAMP,',
)
content = content.replace(
    "issue246_r2_snapshot('R2_EXECUTABLE',1,DATE",
    "issue246_r2_snapshot('GUEDES_1991_ADULT_YOUNG',1,DATE",
)
foundation_v2.write_text(content)
