import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { splitSqlStatements } from './split-sql-statements.mjs';

test('separa instruções sem dividir strings, identificadores, comentários ou dollar quotes', () => {
  const sql = `
    BEGIN;
    -- ponto e vírgula ; no comentário
    SELECT 'valor;com''aspas', "coluna;com;aspas";
    /* comentário ; com /* bloco aninhado ; */ final */
    CREATE FUNCTION example() RETURNS void AS $body$
    BEGIN
      PERFORM 'interno;';
    END;
    $body$ LANGUAGE plpgsql;
    COMMIT;
  `;

  const statements = splitSqlStatements(sql);

  assert.equal(statements.length, 4);
  assert.equal(statements[0], 'BEGIN;');
  assert.match(statements[1], /SELECT 'valor;com''aspas'/);
  assert.match(statements[2], /PERFORM 'interno;';/);
  assert.equal(statements[3], 'COMMIT;');
});

test('separa a migration de adipometria preservando os limites transacionais', async () => {
  const migrationSql = await readFile(
    new URL(
      '../../prisma/migrations/20260730170000_remediate_issue_246_audit_round_2/migration.sql',
      import.meta.url
    ),
    'utf8'
  );

  const statements = splitSqlStatements(migrationSql);

  assert.equal(statements[0], 'BEGIN;');
  assert.equal(statements.at(-1), 'COMMIT;');
  assert.equal(statements.length, 12);
  assert.match(statements[1], /CREATE OR REPLACE FUNCTION "evaluateAdipometryExpression"/);
  assert.match(statements.at(-2), /CREATE OR REPLACE FUNCTION "recordAdipometryAuditEvent"/);
});
