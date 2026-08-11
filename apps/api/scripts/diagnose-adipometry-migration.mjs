import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { PrismaClient } from '@prisma/client';

import { splitSqlStatements } from './lib/split-sql-statements.mjs';

const migrationName = '20260730170000_remediate_issue_246_audit_round_2';
const expectedChecksum = '4f954e9c119f658a3e734351c2ea81c88c5539b7e9e2e1269443b6a22f0bfa76';
const migrationFile = new URL(
  `../prisma/migrations/${migrationName}/migration.sql`,
  import.meta.url
);
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

if (!migrationDatabaseUrl) {
  console.error('[migration-diagnostic] MIGRATION_DATABASE_URL ou DATABASE_URL não configurada');
  process.exit(1);
}

const migrationSql = await readFile(migrationFile, 'utf8');
const actualChecksum = createHash('sha256').update(migrationSql).digest('hex');
if (actualChecksum !== expectedChecksum) {
  console.error(
    '[migration-diagnostic] checksum do arquivo não corresponde à migration autorizada'
  );
  process.exit(1);
}

const statements = splitSqlStatements(migrationSql);
if (statements[0] !== 'BEGIN;' || statements.at(-1) !== 'COMMIT;') {
  console.error('[migration-diagnostic] migration não possui os limites BEGIN/COMMIT esperados');
  process.exit(1);
}

const diagnosticStatements = statements.slice(1, -1);
const rollbackSignal = new Error('DIAGNOSTIC_ROLLBACK');
const prisma = new PrismaClient({
  datasources: { db: { url: migrationDatabaseUrl } },
});

let currentStatement = null;

try {
  const rows = await prisma.$queryRaw`
    SELECT
      "checksum",
      "finished_at" AS "finishedAt",
      "rolled_back_at" AS "rolledBackAt"
    FROM "_prisma_migrations"
    WHERE "migration_name" = ${migrationName}
    ORDER BY "started_at" DESC
    LIMIT 1
  `;
  const failedMigration = rows[0];

  if (!failedMigration || failedMigration.finishedAt || failedMigration.rolledBackAt) {
    throw new Error(`${migrationName} não possui uma execução falha ativa`);
  }
  if (failedMigration.checksum !== expectedChecksum) {
    throw new Error(`checksum da execução falha de ${migrationName} não é o esperado`);
  }

  await prisma.$transaction(
    async (transaction) => {
      for (const [index, statement] of diagnosticStatements.entries()) {
        const statementNumber = index + 1;
        const description = statement
          .split('\n')
          .map((line) => line.trim())
          .find((line) => line && !line.startsWith('--'));
        currentStatement = { number: statementNumber, description };
        console.log(
          `[migration-diagnostic] testando instrução ${statementNumber}/${diagnosticStatements.length}: ${description}`
        );
        await transaction.$executeRawUnsafe(statement);
      }

      throw rollbackSignal;
    },
    { maxWait: 10_000, timeout: 120_000 }
  );
} catch (error) {
  if (error === rollbackSignal) {
    console.log(
      '[migration-diagnostic] todas as instruções passaram; a transação de diagnóstico foi revertida'
    );
  } else {
    const location = currentStatement
      ? `instrução ${currentStatement.number}: ${currentStatement.description}`
      : 'verificação anterior à execução';
    console.error(`[migration-diagnostic] primeira falha em ${location}`);
    console.error(error);
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
