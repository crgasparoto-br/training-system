import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { classifyRepositoryCi } from './ci-risk-classifier.mjs';

test('repository risk policy is local and independent', () => {
  const policy = JSON.parse(readFileSync(new URL('../config/ci-risk-policy.json', import.meta.url), 'utf8'));
  assert.equal(policy.repository, 'crgasparoto-br/training-system');
  assert.equal(policy.sourceRepository, undefined);
});

test('isolated web component with colocated test stays FAST', () => {
  const result = classifyRepositoryCi({ changedPaths: ['apps/web/src/components/alunos/AlunoResumoHubTab.tsx', 'apps/web/src/components/alunos/AlunoResumoHubTab.test.tsx'] });
  assert.equal(result.riskProfile, 'fast');
  assert.equal(result.webChanged, true);
  assert.equal(result.databaseRequired, false);
});

test('ordinary documentation stays FAST and requires docs validation', () => {
  const result = classifyRepositoryCi({ changedPaths: ['docs/product/alunos.md'] });
  assert.equal(result.riskProfile, 'fast');
  assert.equal(result.docsRequired, true);
  assert.equal(result.codeChanged, false);
});

test('feature-level frontend code defaults to STANDARD', () => {
  assert.equal(classifyRepositoryCi({ changedPaths: ['apps/web/src/features/plans/usePlan.ts'] }).riskProfile, 'standard');
});

test('ordinary API code defaults to STANDARD', () => {
  const result = classifyRepositoryCi({ changedPaths: ['apps/api/src/modules/alunos/aluno.service.ts'] });
  assert.equal(result.riskProfile, 'standard');
  assert.equal(result.apiChanged, true);
});

test('access-control code is CRITICAL even under web', () => {
  assert.equal(classifyRepositoryCi({ changedPaths: ['apps/web/src/access/useAccess.ts'] }).riskProfile, 'critical');
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
    const result = classifyRepositoryCi({ requested: 'fast', changedPaths: [path] });
    assert.equal(result.riskProfile, 'critical', `${path} must be CRITICAL`);
    assert.equal(result.promoted, true, `${path} must promote requested FAST`);
  }
});

test('security-like frontend entrypoints fail critical even in FAST-friendly roots', () => {
  for (const path of [
    'apps/web/src/components/RoleGuard.tsx',
    'apps/web/src/pages/SignIn.tsx',
    'apps/web/src/pages/SignUp.tsx',
    'apps/web/src/pages/ResetPassword.tsx',
    'apps/web/src/stores/sessionStore.ts'
  ]) {
    assert.equal(classifyRepositoryCi({ changedPaths: [path] }).riskProfile, 'critical', `${path} must be CRITICAL`);
  }
});

test('backend tenant-authorization route guards always require CRITICAL CI', () => {
  for (const path of [
    'apps/api/src/routes/workout-route-guards.ts',
    'apps/api/src/routes/workout-route-guard.ts',
    'apps/api/src/routes/workout_route_guards.ts',
    'apps/api/src/routes/workout-routeguard.ts',
    'apps/web/src/components/RouteGuard.tsx'
  ]) {
    const result = classifyRepositoryCi({ changedPaths: [path] });
    assert.equal(result.riskProfile, 'critical', `${path} must be CRITICAL`);
    assert.ok(result.reasons.some((reason) => reason.startsWith('core-sensitive-boundary:')),
      `${path} must use the sensitive entrypoint rule`);
    const forced = classifyRepositoryCi({ requested: 'fast', changedPaths: [path] });
    assert.equal(forced.riskProfile, 'critical');
    assert.equal(forced.promoted, true);
  }
  assert.equal(classifyRepositoryCi({ changedPaths: ['apps/api/src/routes/workout.routes.ts'] }).riskProfile, 'standard');
});

test('Prisma migration is CRITICAL and marks database validation', () => {
  const result = classifyRepositoryCi({ changedPaths: ['apps/api/prisma/migrations/202609110001_example/migration.sql'] });
  assert.equal(result.riskProfile, 'critical');
  assert.equal(result.databaseRequired, true);
});

test('shared packages are CRITICAL', () => {
  assert.equal(classifyRepositoryCi({ changedPaths: ['packages/types/access-control.ts'] }).riskProfile, 'critical');
});

test('workflow and classifier changes are CRITICAL', () => {
  assert.equal(classifyRepositoryCi({ changedPaths: ['.github/workflows/validate-pr.yml'] }).riskProfile, 'critical');
  assert.equal(classifyRepositoryCi({ changedPaths: ['scripts/delivery-v2-ci-classifier.mjs'] }).riskProfile, 'critical');
});

test('explicit FAST never downgrades observed CRITICAL risk', () => {
  const result = classifyRepositoryCi({ requested: 'fast', changedPaths: ['apps/api/prisma/schema.prisma'] });
  assert.equal(result.riskProfile, 'critical');
  assert.equal(result.promoted, true);
});

test('requested STANDARD may promote an observed FAST change', () => {
  const result = classifyRepositoryCi({ requested: 'standard', changedPaths: ['apps/web/src/components/Button.tsx'] });
  assert.equal(result.riskProfile, 'standard');
  assert.equal(result.promoted, false);
});

test('unknown path fails closed to CRITICAL', () => {
  assert.equal(classifyRepositoryCi({ changedPaths: ['infra/custom-policy.txt'] }).riskProfile, 'critical');
});

test('innocuous file extensions outside trusted FAST roots still fail closed', () => {
  for (const path of ['infra/diagram.svg', 'apps/api/assets/logo.png']) {
    const result = classifyRepositoryCi({ changedPaths: [path] });
    assert.equal(result.riskProfile, 'critical', `${path} must fail closed to CRITICAL`);
    assert.ok(result.reasons.some((reason) => reason === `unknown-path:${path.toLowerCase()}`));
  }
});

test('static assets remain FAST only inside trusted web asset roots', () => {
  assert.equal(classifyRepositoryCi({ changedPaths: ['apps/web/src/assets/logo.svg'] }).riskProfile, 'fast');
});

test('empty changed-path evidence fails closed to CRITICAL', () => {
  assert.equal(classifyRepositoryCi({ changedPaths: [] }).riskProfile, 'critical');
});

test('canonical audit contract changes always use CRITICAL validation', () => {
  for (const path of ['docs/audit/github-native-contract.json', 'docs/audit/README.md']) {
    const automatic = classifyRepositoryCi({ changedPaths: [path] });
    assert.equal(automatic.riskProfile, 'critical', `${path} must never be FAST`);
    const forced = classifyRepositoryCi({ requested: 'fast', changedPaths: [path] });
    assert.equal(forced.riskProfile, 'critical');
    assert.equal(forced.promoted, true);
  }
});


test('clinical timeline projections require database-backed CRITICAL CI', () => {
  const result = classifyRepositoryCi({
    changedPaths: ['apps/api/src/modules/alunos/student-clinical-timeline.service.ts'],
  });
  assert.equal(result.riskProfile, 'critical');
  assert.equal(result.apiChanged, true);
});

function validateCriticalWorkflowContract(workflow) {
  const triggers = workflow.split('\njobs:\n')[0];
  assert.match(triggers, /  pull_request:\n    branches: \[main, develop\]/);
  assert.match(triggers, /  push:\n    branches:\n      - main\n      - develop\n/);
  assert.doesNotMatch(triggers, /^      - ['"]?(?:chore|feat|fix)\//m);
  const start = workflow.indexOf('\n  critical_validation:\n');
  const end = workflow.indexOf('\n  validate:\n', start);
  assert.ok(start >= 0 && end > start, 'CRITICAL validation job is required');
  const critical = workflow.slice(start, end);
  assert.equal((critical.match(/^\s*pnpm validate(?:\s|$)/gm) ?? []).length, 1,
    'CRITICAL must execute pnpm validate exactly once');
  assert.match(critical, /pnpm validate 2>&1 \| tee artifacts\/ci\/full-tests\.log/);
  for (const command of ['pnpm prisma:source-check', 'pnpm type-check', 'pnpm lint',
    'pnpm test', 'pnpm arch:check', 'pnpm access:check', 'pnpm docs:check']) {
    assert.ok(!critical.split('\n').some((line) =>
      line.trim() === 'run: ' + command || line.trim() === command),
    command + ' must not repeat outside pnpm validate');
  }
  const db = critical.indexOf('name: Verify critical database and migration regressions');
  const validation = critical.indexOf('name: Complete mandatory validation (pnpm validate)');
  const browser = critical.indexOf('name: Verify issue-487 exact-head browser captures');
  assert.ok(db >= 0 && db < validation && validation < browser,
    'DB regressions precede the single aggregate gate and exact-head browser evidence');
  for (const required of ['name: Build', 'name: Validate settings parameters in real browser',
    'name: Retain exact Git bundle for independent audit',
    'name: Upload exact Git bundle for independent audit',
    'name: validate-pr-critical-']) {
    assert.ok(critical.includes(required), required + ' must remain in CRITICAL');
  }
  assert.match(workflow, /name: Validate repository/);
}

test('CRITICAL CI executes full validation once without duplicate push and preserves audit gates', () => {
  const workflow = readFileSync(new URL('../.github/workflows/validate-pr.yml', import.meta.url), 'utf8');
  assert.doesNotThrow(() => validateCriticalWorkflowContract(workflow));
});

test('CRITICAL workflow contract rejects redundant push and duplicate tests (negative controls)', () => {
  const workflow = readFileSync(new URL('../.github/workflows/validate-pr.yml', import.meta.url), 'utf8');
  const redundantPush = workflow.replace("      - develop\n", "      - develop\n      - 'feat/**'\n");
  assert.throws(() => validateCriticalWorkflowContract(redundantPush));
  const duplicateTests = workflow.replace('      - name: Verify issue-487 exact-head browser captures',
    '      - name: Duplicate tests\n        run: pnpm test\n      - name: Verify issue-487 exact-head browser captures');
  assert.throws(() => validateCriticalWorkflowContract(duplicateTests));
});
