import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

const migrationName = '20260730170000_remediate_issue_246_audit_round_2';
const apiDirectory = fileURLToPath(new URL('..', import.meta.url));
const migrationFile = new URL(
  `../prisma/migrations/${migrationName}/migration.sql`,
  import.meta.url
);
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

if (!migrationDatabaseUrl) {
  console.error('[migration-recovery] MIGRATION_DATABASE_URL ou DATABASE_URL não configurada');
  process.exit(1);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: apiDirectory,
      env: {
        ...process.env,
        DATABASE_URL: migrationDatabaseUrl,
      },
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} interrompido pelo sinal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

const migrationSql = await readFile(migrationFile, 'utf8');
const normalizedSql = migrationSql.trim();
if (!normalizedSql.startsWith('BEGIN;') || !normalizedSql.endsWith('COMMIT;')) {
  console.error(
    `[migration-recovery] ${migrationName} não está integralmente protegida por BEGIN/COMMIT`
  );
  process.exit(1);
}

const expectedChecksum = createHash('sha256').update(migrationSql).digest('hex');
const prisma = new PrismaClient({
  datasources: { db: { url: migrationDatabaseUrl } },
});

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

  if (!failedMigration) {
    throw new Error(`não existe registro de ${migrationName} em _prisma_migrations`);
  }
  if (failedMigration.finishedAt || failedMigration.rolledBackAt) {
    throw new Error(`${migrationName} não possui uma execução falha ativa`);
  }
  if (failedMigration.checksum !== expectedChecksum) {
    throw new Error(`checksum de ${migrationName} diverge do arquivo desta release`);
  }

  const effects = await prisma.$queryRaw`
    SELECT
      TO_REGPROCEDURE('"evaluateAdipometryExpression"(jsonb,jsonb)')::TEXT AS "expressionFunction",
      TO_REGPROCEDURE('"evaluateAdipometryProtocolVector"(jsonb,jsonb)')::TEXT AS "vectorFunction",
      TO_REGPROCEDURE('"requireAdipometryActorUserId"(text,text)')::TEXT AS "actorFunction"
  `;
  const effect = effects[0];
  if (effect.expressionFunction || effect.vectorFunction || effect.actorFunction) {
    throw new Error(
      `${migrationName} deixou funções novas no banco; a recuperação automática foi recusada`
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[migration-recovery] verificação de segurança falhou:', message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

if (process.exitCode) process.exit(process.exitCode);

console.log(`[migration-recovery] marcando ${migrationName} como rolled back`);
const resolveExitCode = await run('pnpm', [
  'exec',
  'prisma',
  'migrate',
  'resolve',
  '--schema',
  'prisma/schema.prisma',
  '--rolled-back',
  migrationName,
]);
if (resolveExitCode !== 0) process.exit(resolveExitCode);

console.log('[migration-recovery] reaplicando migrations pendentes');
const deployExitCode = await run('pnpm', [
  'exec',
  'prisma',
  'migrate',
  'deploy',
  '--schema',
  'prisma/schema.prisma',
]);
process.exit(deployExitCode);
