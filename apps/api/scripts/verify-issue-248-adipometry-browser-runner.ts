import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const prisma = new PrismaClient();
const triggerName = 'issue_248_upsert_access_permission';
const functionName = 'issue_248_upsert_access_permission';
const puppeteerPreload = path.join(
  repoRoot,
  'apps/api/scripts/verify-issue-248-puppeteer-preload.mjs'
);

const verifiers = [
  {
    label: 'fluxo guiado ADPT da Issue 248',
    script: 'scripts/verify-issue-248-adipometry-browser.ts',
  },
  {
    label: 'Central ADPT da Issue 249',
    script: 'scripts/verify-issue-249-adipometry-central-browser.ts',
  },
] as const;

async function installFixturePermissionUpsert(): Promise<void> {
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
        UPDATE "AccessPermission" existing
        SET
          "canView" = NEW."canView",
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE existing."collaboratorFunctionId" = NEW."collaboratorFunctionId"
          AND existing."screenKey" = NEW."screenKey"
          AND existing."blockKey" IS NOT DISTINCT FROM NEW."blockKey";
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

async function removeFixturePermissionUpsert(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS "${triggerName}" ON "AccessPermission"`
  );
  await prisma.$executeRawUnsafe(
    `DROP FUNCTION IF EXISTS "${functionName}"()`
  );
}

function assertFixtureCleanupAllowed(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('A limpeza da fixture ADPT só pode executar com NODE_ENV=test.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL é obrigatória para limpar a fixture ADPT.');
  }

  let databaseName = '';
  try {
    databaseName = new URL(databaseUrl).pathname.replace(/^\//, '').toLowerCase();
  } catch {
    throw new Error('DATABASE_URL inválida para a limpeza da fixture ADPT.');
  }

  if (!databaseName.includes('test')) {
    throw new Error(
      `A limpeza da fixture ADPT recusou o banco não identificado como teste: ${databaseName}.`
    );
  }
}

async function removeResidualBrowserFixture(): Promise<void> {
  assertFixtureCleanupAllowed();

  // As tabelas clínicas ADPT preservam histórico por triggers imutáveis. A
  // fixture roda somente em banco descartável de teste e precisa remover seus
  // próprios dados entre execuções. SET LOCAL limita o bypass à transação.
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
    await transaction.$executeRawUnsafe(`
      DO $cleanup$
      DECLARE
        v_contract_ids TEXT[];
        v_function_ids TEXT[];
        v_user_ids TEXT[];
        v_table RECORD;
      BEGIN
        SELECT COALESCE(ARRAY_AGG("id"), ARRAY[]::TEXT[])
          INTO v_contract_ids
        FROM "Contract"
        WHERE "document" LIKE '248-browser-%';

        SELECT COALESCE(ARRAY_AGG("id"), ARRAY[]::TEXT[])
          INTO v_function_ids
        FROM "CollaboratorFunctionOption"
        WHERE "contractId" = ANY(v_contract_ids)
           OR "code" LIKE 'ADPT-BROWSER-%';

        SELECT COALESCE(ARRAY_AGG(DISTINCT fixture_user."id"), ARRAY[]::TEXT[])
          INTO v_user_ids
        FROM (
          SELECT "id"
          FROM "User"
          WHERE "email" LIKE 'adpt-browser-%'
          UNION
          SELECT "userId" AS "id"
          FROM "Professor"
          WHERE "contractId" = ANY(v_contract_ids)
          UNION
          SELECT "userId" AS "id"
          FROM "Aluno"
          WHERE "contractId" = ANY(v_contract_ids)
            AND "userId" IS NOT NULL
          UNION
          SELECT "userId" AS "id"
          FROM "ProfessionalActorMembership"
          WHERE "contractId" = ANY(v_contract_ids)
        ) fixture_user
        WHERE fixture_user."id" IS NOT NULL;

        DELETE FROM "AccessPermission"
        WHERE "collaboratorFunctionId" = ANY(v_function_ids);

        DELETE FROM "Profile"
        WHERE "userId" = ANY(v_user_ids);

        FOR v_table IN
          SELECT DISTINCT columns.table_name
          FROM information_schema.columns columns
          JOIN information_schema.tables tables
            ON tables.table_schema = columns.table_schema
           AND tables.table_name = columns.table_name
          WHERE columns.table_schema = 'public'
            AND columns.column_name = 'contractId'
            AND tables.table_type = 'BASE TABLE'
            AND columns.table_name <> 'Contract'
          ORDER BY columns.table_name
        LOOP
          EXECUTE FORMAT(
            'DELETE FROM %I WHERE "contractId" = ANY($1)',
            v_table.table_name
          ) USING v_contract_ids;
        END LOOP;

        DELETE FROM "ProfessionalActorMembership"
        WHERE "id" LIKE 'adpt-browser-membership-%'
           OR "collaboratorFunctionId" = ANY(v_function_ids)
           OR "userId" = ANY(v_user_ids);

        DELETE FROM "CollaboratorFunctionOption"
        WHERE "id" = ANY(v_function_ids)
           OR "code" LIKE 'ADPT-BROWSER-%';

        DELETE FROM "User"
        WHERE "id" = ANY(v_user_ids)
           OR "email" LIKE 'adpt-browser-%';

        DELETE FROM "Contract"
        WHERE "id" = ANY(v_contract_ids)
           OR "document" LIKE '248-browser-%';
      END
      $cleanup$;
    `);
  });

  const [residual] = await prisma.$queryRawUnsafe<Array<{
    contractsRemain: boolean;
    functionsRemain: boolean;
    membershipsRemain: boolean;
    usersRemain: boolean;
  }>>(`
    SELECT
      EXISTS(
        SELECT 1 FROM "Contract" WHERE "document" LIKE '248-browser-%'
      ) AS "contractsRemain",
      EXISTS(
        SELECT 1
        FROM "CollaboratorFunctionOption"
        WHERE "code" LIKE 'ADPT-BROWSER-%'
      ) AS "functionsRemain",
      EXISTS(
        SELECT 1
        FROM "ProfessionalActorMembership"
        WHERE "id" LIKE 'adpt-browser-membership-%'
      ) AS "membershipsRemain",
      EXISTS(
        SELECT 1 FROM "User" WHERE "email" LIKE 'adpt-browser-%'
      ) AS "usersRemain"
  `);

  if (
    !residual
    || residual.contractsRemain
    || residual.functionsRemain
    || residual.membershipsRemain
    || residual.usersRemain
  ) {
    throw new Error(`A fixture ADPT deixou resíduos: ${JSON.stringify(residual)}.`);
  }
}

function runBrowserVerifier(script: string, label: string): void {
  const inheritedNodeOptions = process.env.NODE_OPTIONS?.trim();
  const nodeOptions = [
    inheritedNodeOptions,
    `--import=${puppeteerPreload}`,
  ].filter(Boolean).join(' ');

  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      '@corrida/api',
      'exec',
      'tsx',
      script,
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
    throw new Error(`${label} terminou pelo sinal ${result.signal}.`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${label} terminou com status ${result.status ?? 'desconhecido'}.`
    );
  }
}

async function prepareVerifier(): Promise<void> {
  await removeFixturePermissionUpsert();
  await removeResidualBrowserFixture();
  await installFixturePermissionUpsert();
}

async function main(): Promise<void> {
  let executionError: unknown;
  let cleanupError: unknown;

  try {
    for (const verifier of verifiers) {
      await prepareVerifier();
      runBrowserVerifier(verifier.script, verifier.label);
    }
  } catch (error) {
    executionError = error;
  }

  try {
    await removeFixturePermissionUpsert();
    await removeResidualBrowserFixture();
  } catch (error) {
    cleanupError = error;
  }

  try {
    await prisma.$disconnect();
  } catch (error) {
    cleanupError = cleanupError
      ? new AggregateError([cleanupError, error], 'Falhas ao limpar e desconectar a fixture ADPT.')
      : error;
  }

  if (executionError && cleanupError) {
    throw new AggregateError(
      [executionError, cleanupError],
      'Os verificadores ADPT falharam e a limpeza da fixture também falhou.'
    );
  }
  if (executionError) throw executionError;
  if (cleanupError) throw cleanupError;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
