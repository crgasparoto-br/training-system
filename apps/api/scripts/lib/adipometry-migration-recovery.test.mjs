import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAclOnlyLegacyMigration,
  assertTerminalLegacyOverloadGuard,
  getCompatibleAuditRemediationStatements,
  getCompatiblePersistenceBypassStatements,
  isAdipometryAuditTablePrivilegeMutation,
  isLegacyAdipometryPrivilegeMutation,
} from './adipometry-migration-recovery.mjs';

test('identifica somente REVOKEs das duas assinaturas legadas', () => {
  assert.equal(
    isLegacyAdipometryPrivilegeMutation(
      'REVOKE EXECUTE ON FUNCTION "createAdipometryDraft"(TEXT, TEXT, TEXT, TEXT, DATE, TIMESTAMP WITH TIME ZONE) FROM PUBLIC;'
    ),
    true
  );
  assert.equal(
    isLegacyAdipometryPrivilegeMutation(
      'REVOKE ALL ON FUNCTION "createAdipometryDraft"(TEXT,TEXT,TEXT,TEXT,TIMESTAMP WITHOUT TIME ZONE,TIMESTAMP WITHOUT TIME ZONE) FROM CURRENT_USER;'
    ),
    true
  );
  assert.equal(
    isLegacyAdipometryPrivilegeMutation('REVOKE EXECUTE ON FUNCTION other() FROM PUBLIC;'),
    false
  );
});

test('remove apenas os dois REVOKEs incompatíveis da remediation transacional', () => {
  const statements = [
    'BEGIN;',
    'CREATE FUNCTION first() RETURNS void LANGUAGE SQL AS $$ SELECT 1; $$;',
    'REVOKE EXECUTE ON FUNCTION "createAdipometryDraft"(TEXT,TEXT,TEXT,TEXT,TIMESTAMP WITHOUT TIME ZONE,TIMESTAMP WITHOUT TIME ZONE) FROM PUBLIC;',
    'REVOKE EXECUTE ON FUNCTION "createAdipometryDraft"(TEXT,TEXT,TEXT,TEXT,DATE,TIMESTAMP WITH TIME ZONE) FROM PUBLIC;',
    'CREATE FUNCTION last() RETURNS void LANGUAGE SQL AS $$ SELECT 1; $$;',
    'COMMIT;',
  ];

  const compatible = getCompatibleAuditRemediationStatements(statements, 'audit-remediation');
  assert.deepEqual(compatible, [statements[1], statements[4]]);
});

test('aceita somente a migration ACL-only esperada', () => {
  assert.doesNotThrow(() =>
    assertAclOnlyLegacyMigration(
      [
        'BEGIN;',
        'REVOKE ALL ON FUNCTION "createAdipometryDraft"(TEXT,TEXT,TEXT,TEXT,TIMESTAMP WITHOUT TIME ZONE,TIMESTAMP WITHOUT TIME ZONE) FROM PUBLIC;',
        'REVOKE ALL ON FUNCTION "createAdipometryDraft"(TEXT,TEXT,TEXT,TEXT,TIMESTAMP WITHOUT TIME ZONE,TIMESTAMP WITHOUT TIME ZONE) FROM CURRENT_USER;',
        'REVOKE ALL ON FUNCTION "createAdipometryDraft"(TEXT,TEXT,TEXT,TEXT,DATE,TIMESTAMP WITH TIME ZONE) FROM PUBLIC;',
        'REVOKE ALL ON FUNCTION "createAdipometryDraft"(TEXT,TEXT,TEXT,TEXT,DATE,TIMESTAMP WITH TIME ZONE) FROM CURRENT_USER;',
        'COMMIT;',
      ],
      'acl-only'
    )
  );
});

test('identifica somente o REVOKE de INSERT da tabela de auditoria', () => {
  assert.equal(
    isAdipometryAuditTablePrivilegeMutation(
      'REVOKE INSERT ON TABLE "AdipometryAuditEvent" FROM PUBLIC;'
    ),
    true
  );
  assert.equal(
    isAdipometryAuditTablePrivilegeMutation(
      'REVOKE UPDATE ON TABLE "AdipometryAuditEvent" FROM PUBLIC;'
    ),
    false
  );
  assert.equal(
    isAdipometryAuditTablePrivilegeMutation(
      'REVOKE INSERT ON TABLE "OtherTable" FROM PUBLIC;'
    ),
    false
  );
});

test('remove apenas o REVOKE de INSERT incompatível da persistence bypass migration', () => {
  const statements = [
    'BEGIN;',
    'CREATE FUNCTION first() RETURNS void LANGUAGE SQL AS $$ SELECT 1; $$;',
    'REVOKE INSERT ON TABLE "AdipometryAuditEvent" FROM PUBLIC;',
    'CREATE FUNCTION last() RETURNS void LANGUAGE SQL AS $$ SELECT 1; $$;',
    'COMMIT;',
  ];

  const compatible = getCompatiblePersistenceBypassStatements(
    statements,
    'persistence-bypasses'
  );
  assert.deepEqual(compatible, [statements[1], statements[3]]);
});

test('recusa ampliar o bypass para outra mutação de privilégio', () => {
  assert.throws(
    () =>
      getCompatiblePersistenceBypassStatements(
        [
          'BEGIN;',
          'REVOKE INSERT ON TABLE "AdipometryAuditEvent" FROM PUBLIC;',
          'REVOKE UPDATE ON TABLE "AdipometryAuditEvent" FROM PUBLIC;',
          'COMMIT;',
        ],
        'persistence-bypasses'
      ),
    /exatamente 1 REVOKE de INSERT conhecido/
  );
});

test('exige guards fail-closed para as duas assinaturas sem ator', () => {
  assert.doesNotThrow(() =>
    assertTerminalLegacyOverloadGuard(
      [
        'BEGIN;',
        `CREATE OR REPLACE FUNCTION "createAdipometryDraft"(
           p_id TEXT, p_contract_id TEXT, p_aluno_id TEXT, p_professor_id TEXT,
           p_assessment_date TIMESTAMP(3), p_created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
         ) RETURNS TABLE("assessmentId" TEXT, "sequenceNumber" INTEGER, "code" TEXT)
         LANGUAGE plpgsql AS $$ BEGIN
           RAISE EXCEPTION 'ADIPOMETRY_ACTOR_REQUIRED' USING ERRCODE = '42501';
         END; $$;`,
        `CREATE OR REPLACE FUNCTION "createAdipometryDraft"(
           p_id TEXT, p_contract_id TEXT, p_aluno_id TEXT, p_professor_id TEXT,
           p_assessment_date DATE, p_created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
         ) RETURNS TABLE("assessmentId" TEXT, "sequenceNumber" INTEGER, "code" TEXT)
         LANGUAGE plpgsql AS $$ BEGIN
           RAISE EXCEPTION 'ADIPOMETRY_ACTOR_REQUIRED' USING ERRCODE = '42501';
         END; $$;`,
        'COMMIT;',
      ],
      'terminal'
    )
  );
});
