import { spawnSync } from 'node:child_process';

const databaseIntegration = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const forwardedArgs = process.argv.slice(2);
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const extendedAuthorizationMatrix =
  'tests/issue-275-authorization-matrix-extended.integration.test.ts';
const isolatedDatabaseTests = [
  'src/modules/adipometry/adipometry-api.integration.test.ts',
  'src/modules/adipometry/adipometry-remediation.integration.test.ts',
  'src/modules/pre-registration-invites/pre-registration-invite-concurrency.integration.test.ts',
  'src/modules/pre-registration-invites/pre-registration-invite-temporal-consistency.integration.test.ts',
];
const generalIgnorePattern = [extendedAuthorizationMatrix, ...isolatedDatabaseTests].join('|');

function runJest(args, options = {}) {
  const result = spawnSync(pnpmCommand, ['exec', 'jest', ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
    maxBuffer: options.capture ? 16 * 1024 * 1024 : undefined,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return options.capture ? result.stdout : '';
}

function runIsolatedDatabaseTests() {
  for (const testPath of isolatedDatabaseTests) {
    console.log(`\n[isolated-database-test] ${testPath}`);
    runJest(['--runInBand', '--runTestsByPath', testPath, ...forwardedArgs]);
  }
}

if (!databaseIntegration) {
  runJest(['--runInBand', `--testPathIgnorePatterns=${generalIgnorePattern}`, ...forwardedArgs]);
  runIsolatedDatabaseTests();
  process.exit(0);
}

const listed = runJest(['--listTests', `--testPathIgnorePatterns=${generalIgnorePattern}`], {
  capture: true,
});
const testFiles = listed
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter(Boolean);

if (testFiles.length === 0) {
  console.error('Nenhum teste foi localizado pelo Jest.');
  process.exit(1);
}

// Cada arquivo de integração pode importar clientes Prisma de módulos distintos.
// Reiniciar o processo entre lotes libera essas conexões sem pular testes nem
// aumentar max_connections do PostgreSQL efêmero do CI. A matriz estendida da
// Issue 275 permanece no workflow dedicado, que constrói os pacotes compartilhados
// e valida a API real; concorrência e consistência temporal rodam isoladamente aqui.
const batchSize = Number.parseInt(process.env.JEST_DATABASE_BATCH_SIZE ?? '10', 10);
if (!Number.isInteger(batchSize) || batchSize < 1) {
  console.error('JEST_DATABASE_BATCH_SIZE deve ser um inteiro positivo.');
  process.exit(1);
}

for (let offset = 0; offset < testFiles.length; offset += batchSize) {
  const batch = testFiles.slice(offset, offset + batchSize);
  const index = Math.floor(offset / batchSize) + 1;
  const total = Math.ceil(testFiles.length / batchSize);
  console.log(`\n[database-test-batch ${index}/${total}] ${batch.length} arquivo(s)`);
  runJest(['--runInBand', '--runTestsByPath', ...batch, ...forwardedArgs]);
}

runIsolatedDatabaseTests();
