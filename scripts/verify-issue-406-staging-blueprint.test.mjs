import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const blueprint = readFileSync(join(import.meta.dirname, '..', 'infra', 'issue-406', 'render.yaml'), 'utf8');
const expectedDatabase = 'training-system-issue406-homolog-pg';

test('H406 preflight: isolated Render Blueprint never follows production or other issue staging', () => {
  assert.match(blueprint, /name:\s*training-system-issue406-homolog-api\b/);
  assert.match(blueprint, /branch:\s*feat\/406-post-workout-decision-workflow\b/);
  assert.match(blueprint, /autoDeployTrigger:\s*["']?off/);
  assert.match(blueprint, /previews:\s*\n\s*generation:\s*["']?off/);
  assert.match(blueprint, /rootDir:\s*\./);
  assert.doesNotMatch(blueprint, /issue385|issue-385|sistema-acesso-api\.onrender\.com|controle-calorias-api\.onrender\.com|sistema-acesso\.solveritconsultoria\.com\.br/i);
});

test('H406 preflight: runtime and migrations use the dedicated database only', () => {
  assert.match(blueprint, /startCommand:\s*pnpm --filter @corrida\/api start:with-migrations/);
  assert.match(blueprint, /ipAllowList:\s*\[\]/);
  assert.match(blueprint, /postgresMajorVersion:\s*["']16["']/);
  assert.match(blueprint, /name:\s*training-system-issue406-homolog-pg\b/);
  for (const key of ['DATABASE_URL', 'MIGRATION_DATABASE_URL']) {
    const entry = blueprint.split(`- key: ${key}\n`)[1]?.split(/\n\s*- key:/)[0] ?? '';
    assert.match(entry, new RegExp(`fromDatabase:\\s*\\n\\s*name:\\s*${expectedDatabase}\\s*\\n\\s*property:\\s*connectionString`));
  }
});

test('H406 preflight: no production secrets or permissive callback origins', () => {
  assert.match(blueprint, /key:\s*JWT_SECRET\s*\n\s*generateValue:\s*true/);
  for (const key of ['FRONTEND_URL', 'CORS_ORIGINS']) {
    const entry = blueprint.split(`- key: ${key}\n`)[1]?.split(/\n\s*- key:/)[0] ?? '';
    assert.match(entry, /sync:\s*false/);
    assert.doesNotMatch(entry, /value:\s*\S/);
  }
  assert.doesNotMatch(blueprint, /(?:password|token|secret):\s*(?:\S+)(?<!false)/i);
});
