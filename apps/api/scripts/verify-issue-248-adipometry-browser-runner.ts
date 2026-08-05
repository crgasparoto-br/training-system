import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const prisma = new PrismaClient();
const triggerName = 'issue_248_ignore_duplicate_access_permission';
const functionName = 'issue_248_ignore_duplicate_access_permission';
const puppeteerPreload = path.join(
  repoRoot,
  'apps/api/scripts/verify-issue-248-puppeteer-preload.cjs'
);

async function installFixtureIdempotencyGuard(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS "${triggerName}" ON "AccessPermission"`
  );
  await prisma.$executeRawUnsafe(
    `DROP FUNCTION IF EXISTS "${functionName}"()`
  );
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION "${functionName}"()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM "AccessPermission" existing
        WHERE existing."collaboratorFunctionId" = NEW."collaboratorFunctionId"
          AND existing."screenKey" = NEW."screenKey"
          AND existing."blockKey" IS NOT DISTINCT FROM NEW."blockKey"
      ) THEN
        RETURN NULL;
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "${triggerName}"
    BEFORE INSERT ON "AccessPermission"
    FOR EACH ROW
    EXECUTE FUNCTION "${functionName}"()
  `);
}

async function removeFixtureIdempotencyGuard(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS "${triggerName}" ON "AccessPermission"`
  ).catch(() => undefined);
  await prisma.$executeRawUnsafe(
    `DROP FUNCTION IF EXISTS "${functionName}"()`
  ).catch(() => undefined);
}

async function removeResidualBrowserFixture(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DELETE FROM "CollaborationLink"
    WHERE "contractId" IN (
      SELECT "id"
      FROM "CompanyContract"
      WHERE "document" LIKE '248-browser-%'
    )
  `).catch(() => undefined);
  await prisma.$executeRawUnsafe(`
    DELETE FROM "CompanyContract"
    WHERE "document" LIKE '248-browser-%'
      AND NOT EXISTS (
        SELECT 1 FROM "Aluno" WHERE "Aluno"."contractId" = "CompanyContract"."id"
      )
      AND NOT EXISTS (
        SELECT 1 FROM "Professor" WHERE "Professor"."contractId" = "CompanyContract"."id"
      )
      AND NOT EXISTS (
        SELECT 1 FROM "CollaboratorFunctionOption"
        WHERE "CollaboratorFunctionOption"."contractId" = "CompanyContract"."id"
      )
  `).catch(() => undefined);
}

function runBrowserVerifier(): void {
  const inheritedNodeOptions = process.env.NODE_OPTIONS?.trim();
  const nodeOptions = [
    inheritedNodeOptions,
    `--require=${puppeteerPreload}`,
  ].filter(Boolean).join(' ');

  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      '@corrida/api',
      'exec',
      'tsx',
      'scripts/verify-issue-248-adipometry-browser.ts',
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_OPTIONS: nodeOptions,
      },
      stdio: 'inherit',
    }
  );

  if (result.error) throw result.error;
  if (result.signal) {
    throw new Error(`Verificador ADPT terminou pelo sinal ${result.signal}.`);
  }
  if (result.status !== 0) {
    throw new Error(
      `Verificador ADPT terminou com status ${result.status ?? 'desconhecido'}.`
    );
  }
}

async function main(): Promise<void> {
  await installFixtureIdempotencyGuard();
  runBrowserVerifier();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await removeFixtureIdempotencyGuard();
    await removeResidualBrowserFixture();
    await prisma.$disconnect();
  });
