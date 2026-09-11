import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyDeliveryV2Ci } from './delivery-v2-ci-classifier.mjs';

test('isolated web component with colocated test stays FAST', () => {
  const result = classifyDeliveryV2Ci({
    changedPaths: [
      'apps/web/src/components/alunos/AlunoResumoHubTab.tsx',
      'apps/web/src/components/alunos/AlunoResumoHubTab.test.tsx'
    ]
  });
  assert.equal(result.riskProfile, 'fast');
  assert.equal(result.webChanged, true);
  assert.equal(result.databaseRequired, false);
});

test('ordinary documentation stays FAST and requires docs validation', () => {
  const result = classifyDeliveryV2Ci({ changedPaths: ['docs/product/alunos.md'] });
  assert.equal(result.riskProfile, 'fast');
  assert.equal(result.docsRequired, true);
  assert.equal(result.codeChanged, false);
});

test('feature-level frontend code defaults to STANDARD', () => {
  const result = classifyDeliveryV2Ci({ changedPaths: ['apps/web/src/features/plans/usePlan.ts'] });
  assert.equal(result.riskProfile, 'standard');
});

test('ordinary API code defaults to STANDARD', () => {
  const result = classifyDeliveryV2Ci({ changedPaths: ['apps/api/src/modules/alunos/aluno.service.ts'] });
  assert.equal(result.riskProfile, 'standard');
  assert.equal(result.apiChanged, true);
});

test('access-control code is CRITICAL even under web', () => {
  const result = classifyDeliveryV2Ci({ changedPaths: ['apps/web/src/access/useAccess.ts'] });
  assert.equal(result.riskProfile, 'critical');
});

test('Prisma migration is CRITICAL and marks database validation', () => {
  const result = classifyDeliveryV2Ci({
    changedPaths: ['apps/api/prisma/migrations/202609110001_example/migration.sql']
  });
  assert.equal(result.riskProfile, 'critical');
  assert.equal(result.databaseRequired, true);
});

test('shared packages are CRITICAL', () => {
  const result = classifyDeliveryV2Ci({ changedPaths: ['packages/types/access-control.ts'] });
  assert.equal(result.riskProfile, 'critical');
});

test('workflow and classifier changes are CRITICAL', () => {
  const workflow = classifyDeliveryV2Ci({ changedPaths: ['.github/workflows/validate-pr.yml'] });
  const classifier = classifyDeliveryV2Ci({ changedPaths: ['scripts/delivery-v2-ci-classifier.mjs'] });
  assert.equal(workflow.riskProfile, 'critical');
  assert.equal(classifier.riskProfile, 'critical');
});

test('explicit FAST never downgrades observed CRITICAL risk', () => {
  const result = classifyDeliveryV2Ci({
    requested: 'fast',
    changedPaths: ['apps/api/prisma/schema.prisma']
  });
  assert.equal(result.riskProfile, 'critical');
  assert.equal(result.promoted, true);
});

test('requested STANDARD may promote an observed FAST change', () => {
  const result = classifyDeliveryV2Ci({
    requested: 'standard',
    changedPaths: ['apps/web/src/components/Button.tsx']
  });
  assert.equal(result.riskProfile, 'standard');
  assert.equal(result.promoted, false);
});

test('unknown path fails closed to CRITICAL', () => {
  const result = classifyDeliveryV2Ci({ changedPaths: ['infra/custom-policy.txt'] });
  assert.equal(result.riskProfile, 'critical');
});

test('empty changed-path evidence fails closed to CRITICAL', () => {
  const result = classifyDeliveryV2Ci({ changedPaths: [] });
  assert.equal(result.riskProfile, 'critical');
});
