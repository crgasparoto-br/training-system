import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

import {
  assertAclOnlyLegacyMigration,
  assertTerminalLegacyOverloadGuard,
  getCompatibleAuditRemediationStatements,
} from './lib/adipometry-migration-recovery.mjs';
import { splitSqlStatements } from './lib/split-sql-statements.mjs';

const auditMigrationName = '20260730170000_remediate_issue_246_audit_round_2';
const aclMigrationName = '20260730180000_restrict_legacy_adipometry_draft_overloads';
const terminalMigrationName = '20260811141500_disable_legacy_adipometry_draft_overloads';
const apiDirectory = fileURLToPath(new URL('..', import.meta.url));
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

if (!migrationDatabaseUrl) {
  console.error('[migration-recovery] MIGRATION_DATABASE_URL ou DATABASE_URL não configurada');
  process.exit(1);
}

function migrationFile(name) {
  return new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url);
}

function checksum(sql) {
  return createHash('sha256').update(sql).digest('hex');
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

async function resolveMigration(action, migrationName) {
  const exitCode = await run('pnpm', [
    'exec',
    'prisma',
    'migrate',
    'resolve',
    '--schema',
    'prisma/schema.prisma',
    action,
    migrationName,
  ]);
  if (exitCode !== 0) process.exit(exitCode);
}

async function latestMigrationAttempt(prisma, migrationName) {
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
  return rows[0] ?? null;
}

function isActiveFailure(attempt) {
  return Boolean(attempt && !attempt.finishedAt && !attempt.rolledBackAt);
}

const [auditMigrationSql, aclMigrationSql, terminalMigrationSql] = await Promise.all([
  readFile(migrationFile(auditMigrationName), 'utf8'),
  readFile(migrationFile(aclMigrationName), 'utf8'),
  readFile(migrationFile(terminalMigrationName), 'utf8'),
]);

const auditStatements = splitSqlStatements(auditMigrationSql);
const compatibleAuditStatements = getCompatibleAuditRemediationStatements(
  auditStatements,
  auditMigrationName
);
const aclStatements = splitSqlStatements(aclMigrationSql);
assertAclOnlyLegacyMigration(aclStatements, aclMigrationName);
const terminalStatements = splitSqlStatements(terminalMigrationSql);
assertTerminalLegacyOverloadGuard(terminalStatements, terminalMigrationName);

const auditChecksum = checksum(auditMigrationSql);
const aclChecksum = checksum(aclMigrationSql);
const prisma = new PrismaClient({
  datasources: { db: { url: migrationDatabaseUrl } },
});

let recoveryMode;

try {
  const auditAttempt = await latestMigrationAttempt(prisma, auditMigrationName);
  const aclAttempt = await latestMigrationAttempt(prisma, aclMigrationName);

  if (isActiveFailure(auditAttempt)) {
    if (auditAttempt.checksum !== auditChecksum) {
      throw new Error(`checksum de ${auditMigrationName} diverge do arquivo desta release`);
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
        `${auditMigrationName} deixou funções novas no banco; a recuperação automática foi recusada`
      );
    }

    recoveryMode = 'audit';
  } else if (isActiveFailure(aclAttempt)) {
    if (aclAttempt.checksum !== aclChecksum) {
      throw new Error(`checksum de ${aclMigrationName} diverge do arquivo desta release`);
    }
    if (!auditAttempt?.finishedAt) {
      throw new Error(
        `${aclMigrationName} falhou sem ${auditMigrationName} estar aplicada; recuperação recusada`
      );
    }
    recoveryMode = 'acl';
  } else {
    throw new Error(
      `não existe execução falha ativa conhecida em ${auditMigrationName} ou ${aclMigrationName}`
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

if (recoveryMode === 'audit') {
  console.log(`[migration-recovery] marcando ${auditMigrationName} como rolled back`);
  await resolveMigration('--rolled-back', auditMigrationName);

  console.log(
    `[migration-recovery] aplicando ${compatibleAuditStatements.length} instruções compatíveis e omitindo somente os 2 REVOKEs legados`
  );
  const migrationPrisma = new PrismaClient({
    datasources: { db: { url: migrationDatabaseUrl } },
  });
  try {
    await migrationPrisma.$transaction(
      async (transaction) => {
        for (const statement of compatibleAuditStatements) {
          await transaction.$executeRawUnsafe(statement);
        }
      },
      { maxWait: 10_000, timeout: 120_000 }
    );
  } finally {
    await migrationPrisma.$disconnect();
  }

  console.log(`[migration-recovery] registrando ${auditMigrationName} como aplicada`);
  await resolveMigration('--applied', auditMigrationName);

  console.log(
    `[migration-recovery] registrando ${aclMigrationName} como aplicada; o guard fail-closed será materializado por ${terminalMigrationName}`
  );
  await resolveMigration('--applied', aclMigrationName);
} else {
  console.log(`[migration-recovery] marcando ${aclMigrationName} como rolled back`);
  await resolveMigration('--rolled-back', aclMigrationName);
  console.log(
    `[migration-recovery] registrando ${aclMigrationName} como aplicada; o guard fail-closed será materializado por ${terminalMigrationName}`
  );
  await resolveMigration('--applied', aclMigrationName);
}

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
