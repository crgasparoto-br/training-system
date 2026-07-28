import { spawnSync } from 'node:child_process';

const databaseIntegration = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const forwardedArgs = process.argv.slice(2);

function runJest(args, options = {}) {
  const result = spawnSync('pnpm', ['exec', 'jest', ...args], {
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

if (!databaseIntegration) {
  runJest(forwardedArgs);
  process.exit(0);
}

const listed = runJest(['--listTests'], { capture: true });
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
// aumentar max_connections do PostgreSQL efêmero do CI.
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
