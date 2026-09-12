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

test('real frontend auth and access entrypoints are always CRITICAL', () => {
  const sensitivePaths = [
    'apps/web/src/components/ProtectedRoute.tsx',
    'apps/web/src/pages/Login.tsx',
    'apps/web/src/pages/Register.tsx',
    'apps/web/src/pages/ForgotPassword.tsx',
    'apps/web/src/stores/useAuthStore.ts'
  ];

  for (const path of sensitivePaths) {
    const result = classifyDeliveryV2Ci({ requested: 'fast', changedPaths: [path] });
    assert.equal(result.riskProfile, 'critical', `${path} must be CRITICAL`);
    assert.equal(result.promoted, true, `${path} must promote requested FAST`);
  }
});

test('security-like frontend entrypoints fail critical even in FAST-friendly roots', () => {
  const sensitivePaths = [
    'apps/web/src/components/RoleGuard.tsx',
    'apps/web/src/pages/SignIn.tsx',
    'apps/web/src/pages/SignUp.tsx',
    'apps/web/src/pages/ResetPassword.tsx',
    'apps/web/src/stores/sessionStore.ts'
  ];

  for (const path of sensitivePaths) {
    const result = classifyDeliveryV2Ci({ changedPaths: [path] });
    assert.equal(result.riskProfile, 'critical', `${path} must be CRITICAL`);
  }
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

test('innocuous file extensions outside trusted FAST roots still fail closed', () => {
  const unknownAssets = [
    'infra/diagram.svg',
    'apps/api/assets/logo.png'
  ];

  for (const path of unknownAssets) {
    const result = classifyDeliveryV2Ci({ changedPaths: [path] });
    assert.equal(result.riskProfile, 'critical', `${path} must fail closed to CRITICAL`);
    assert.ok(result.reasons.some((reason) => reason === `unknown-path:${path.toLowerCase()}`));
  }
});

test('static assets remain FAST only inside trusted web asset roots', () => {
  const result = classifyDeliveryV2Ci({ changedPaths: ['apps/web/src/assets/logo.svg'] });
  assert.equal(result.riskProfile, 'fast');
});

test('empty changed-path evidence fails closed to CRITICAL', () => {
  const result = classifyDeliveryV2Ci({ changedPaths: [] });
  assert.equal(result.riskProfile, 'critical');
});
