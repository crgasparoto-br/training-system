import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(__dirname, '../..');

const read = (relativePath) => readFile(resolve(apiRoot, relativePath), 'utf8');

test('produção inicia a API sem executar migrations no caminho de startup', async () => {
  const packageJson = JSON.parse(await read('package.json'));
  const startScript = await read('scripts/start-api.mjs');
  const migrationStartScript = await read('scripts/migrate-and-start.mjs');

  assert.equal(packageJson.scripts.start, 'node scripts/start-api.mjs');
  assert.equal(packageJson.scripts['start:with-migrations'], 'node scripts/migrate-and-start.mjs');
  assert.equal(packageJson.scripts['db:deploy'], 'pnpm db:migrate:prod');
  assert.doesNotMatch(startScript, /db:migrate|migrate:prod/);
  assert.match(migrationStartScript, /db:migrate:prod/);
});

test('o runbook declara pre-deploy de migrations e start separado', async () => {
  const deploymentDoc = await read('../../docs/architecture/deployment.md');

  assert.match(deploymentDoc, /Pre-deploy command:/i);
  assert.match(deploymentDoc, /pnpm --filter @corrida\/api db:deploy/);
  assert.match(deploymentDoc, /pnpm --filter @corrida\/api start/);
  assert.match(deploymentDoc, /plano pago\/always-on/);
});
