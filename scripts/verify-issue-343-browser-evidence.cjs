const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = process.env.ISSUE343_BASE_URL || 'http://127.0.0.1:4173';
const ORIGIN = new URL(BASE_URL).origin;
const OUTPUT_DIR = process.env.ISSUE343_EVIDENCE_DIR || path.resolve('issue-343-browser-evidence');
const HEAD_SHA = process.env.ISSUE343_HEAD_SHA || process.env.GITHUB_SHA || null;
const CONTRACT_ID = 'contract-343-evidence';
const ALUNO_ID = 'aluno-343-evidence';
const REVIEW_ID = 'review-343-evidence';
const TOKEN = 'issue-343-browser-evidence-token';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const studentUser = {
  id: 'user-343-evidence',
  email: 'aluno343@teste.local',
  name: 'Aluno Evidencia 343',
  type: 'aluno',
  profile: { name: 'Aluno Evidencia 343' },
  aluno: { id: ALUNO_ID },
};

const review = {
  id: REVIEW_ID,
  alunoId: ALUNO_ID,
  requestedAt: '2026-08-10T12:00:00.000Z',
  dueAt: '2026-08-25T12:00:00.000Z',
  status: 'pending',
  sectionsRequested: ['personal', 'contact', 'address', 'preferences', 'health', 'anamnesis'],
  requiresApproval: true,
};

const profile = {
  id: ALUNO_ID,
  email: 'aluno343@teste.local',
  profile: {
    name: 'Aluno Evidencia 343',
    phone: '11999999999',
    birthDate: '1990-01-01T00:00:00.000Z',
    gender: 'male',
    maritalStatus: 'single',
    addressStreet: 'Rua Inicial',
    addressNumber: '10',
    addressCity: 'São Paulo',
    addressState: 'SP',
    addressZipCode: '01000-000',
    instagramHandle: '@aluno343',
  },
  physical: { age: 36, weight: 78, height: 178 },
  intakeForm: {
    assessmentDate: '2026-08-01T12:00:00.000Z',
    mainGoal: 'Condicionamento',
    trainingBackground: 'Treino regular',
    observations: 'Sem observações adicionais',
  },
};

function storageState() {
  return {
    cookies: [],
    origins: [{
      origin: ORIGIN,
      localStorage: [
        { name: 'token', value: TOKEN },
        { name: 'user', value: JSON.stringify(studentUser) },
      ],
    }],
  };
}

async function waitForServer() {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(BASE_URL, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error(`Servidor não respondeu em ${BASE_URL}`);
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  assert.ok(
    Math.max(metrics.documentScrollWidth, metrics.bodyScrollWidth) <= metrics.viewportWidth + 1,
    `${label}: overflow horizontal`
  );
  return metrics;
}

async function createScenario(browser, label, viewport, postBehavior) {
  const requests = [];
  let pendingReview = review;
  const context = await browser.newContext({ viewport, storageState: storageState() });
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();
    const contractId = request.headers()['x-contract-id'] || null;
    let body = null;
    if (request.postData()) {
      try { body = JSON.parse(request.postData()); } catch { body = request.postData(); }
    }
    requests.push({ method, pathname, contractId, body });

    const fulfill = (data, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(status >= 400 ? data : { success: true, data }),
    });

    if (method === 'GET' && pathname === '/api/v1/auth/me') return fulfill(studentUser);
    if (method === 'GET' && pathname === '/api/v1/pre-registration/processes') {
      return fulfill([{ alunoId: ALUNO_ID, status: 'ACTIVE_STUDENT' }]);
    }
    if (method === 'GET' && pathname === '/api/v1/student/me/profile-review') return fulfill(pendingReview);
    if (method === 'GET' && pathname === '/api/v1/student/me/profile') return fulfill(profile);
    if (method === 'POST' && pathname === `/api/v1/student/me/profile-reviews/${REVIEW_ID}/complete`) {
      if (postBehavior === 'error') return fulfill({ message: 'Falha temporária simulada' }, 500);
      pendingReview = null;
      return fulfill({
        id: REVIEW_ID,
        status: body?.noChanges ? 'completed_no_changes' : 'completed_with_changes',
        requestedAt: review.requestedAt,
        completedAt: '2026-08-14T15:00:00.000Z',
        approval: {
          requiresApproval: postBehavior === 'approval',
          hasPendingApproval: postBehavior === 'approval',
        },
      });
    }
    return fulfill({ error: `Unexpected request: ${method} ${pathname}` }, 501);
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${BASE_URL}/student/profile-review?contractId=${CONTRACT_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.getByText('Revisão pendente', { exact: true }).waitFor({ timeout: 10000 });
  return { context, page, pageErrors, requests, label };
}

function assertScopedRequests(requests, label) {
  const scoped = requests.filter((entry) => entry.pathname.startsWith('/api/v1/student/me/'));
  assert.ok(scoped.length > 0, `${label}: nenhuma requisição student/me observada`);
  for (const entry of scoped) {
    assert.equal(entry.contractId, CONTRACT_ID, `${label}: ${entry.pathname} sem x-contract-id`);
  }
}

function completionRequest(requests) {
  return requests.find((entry) => entry.method === 'POST' && entry.pathname.endsWith('/complete'));
}

async function verifyNoChangesMobile(browser) {
  const scenario = await createScenario(browser, 'mobile-no-changes', { width: 390, height: 844 }, 'direct');
  const { context, page, pageErrors, requests, label } = scenario;
  try {
    await assertNoHorizontalOverflow(page, label);
    assert.equal(await page.getByLabel('Nome').isDisabled(), true);
    assert.equal(await page.getByText('Dados físicos', { exact: true }).count(), 1);
    const submit = page.getByRole('button', { name: 'Concluir sem alterações' });
    await submit.focus();
    assert.equal(await submit.evaluate((node) => document.activeElement === node), true);
    await page.keyboard.press('Enter');
    await page.getByText('Revisão concluída', { exact: true }).waitFor();
    assert.deepEqual(completionRequest(requests)?.body, { noChanges: true });
    await page.screenshot({ path: path.join(OUTPUT_DIR, `${label}.png`), fullPage: true });
    assertScopedRequests(requests, label);
    assert.deepEqual(pageErrors, []);
    return { label, result: 'passed' };
  } finally {
    await context.close();
  }
}

async function verifyDirectChangeDesktop(browser) {
  const scenario = await createScenario(browser, 'desktop-direct-change', { width: 1366, height: 768 }, 'direct');
  const { context, page, pageErrors, requests, label } = scenario;
  try {
    const phone = page.getByLabel('Telefone');
    await phone.fill('11988887777');
    await page.getByRole('button', { name: 'Salvar alterações e concluir' }).click();
    await page.getByText('Sua revisão cadastral foi concluída com sucesso.', { exact: true }).waitFor();
    assert.deepEqual(completionRequest(requests)?.body, { changes: { profile: { phone: '11988887777' } } });
    await assertNoHorizontalOverflow(page, label);
    assertScopedRequests(requests, label);
    assert.deepEqual(pageErrors, []);
    return { label, result: 'passed' };
  } finally {
    await context.close();
  }
}

async function verifyApprovalChange(browser) {
  const scenario = await createScenario(browser, 'mobile-approval-change', { width: 390, height: 844 }, 'approval');
  const { context, page, pageErrors, requests, label } = scenario;
  try {
    await page.getByLabel('Data de nascimento').fill('1991-02-03');
    await page.getByRole('button', { name: 'Salvar alterações e concluir' }).click();
    await page.getByText(
      'Recebemos suas alterações. Alguns dados serão analisados pelo profissional antes de serem atualizados.',
      { exact: true }
    ).waitFor();
    assert.deepEqual(completionRequest(requests)?.body, { changes: { profile: { birthDate: '1991-02-03' } } });
    await assertNoHorizontalOverflow(page, label);
    assertScopedRequests(requests, label);
    assert.deepEqual(pageErrors, []);
    return { label, result: 'passed' };
  } finally {
    await context.close();
  }
}

async function verifyFailureNoFalseSuccess(browser) {
  const scenario = await createScenario(browser, 'mobile-submit-error', { width: 390, height: 844 }, 'error');
  const { context, page, pageErrors, requests, label } = scenario;
  try {
    await page.getByLabel('Telefone').fill('11977776666');
    await page.getByRole('button', { name: 'Salvar alterações e concluir' }).click();
    await page.getByRole('alert').getByText('Falha temporária simulada', { exact: true }).waitFor();
    assert.equal(await page.getByText('Revisão concluída', { exact: true }).count(), 0);
    assert.ok(requests.filter((entry) => entry.pathname === '/api/v1/student/me/profile-review').length >= 2);
    await assertNoHorizontalOverflow(page, label);
    assertScopedRequests(requests, label);
    assert.deepEqual(pageErrors, []);
    return { label, result: 'passed' };
  } finally {
    await context.close();
  }
}

async function main() {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const scenarios = [
      await verifyNoChangesMobile(browser),
      await verifyDirectChangeDesktop(browser),
      await verifyApprovalChange(browser),
      await verifyFailureNoFalseSuccess(browser),
    ];
    fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify({
      schemaVersion: 1,
      issue: 343,
      candidateSha: HEAD_SHA,
      scenarios,
      result: scenarios.every((scenario) => scenario.result === 'passed') ? 'passed' : 'failed',
      requirements: [
        'mobile-and-desktop-responsive-form',
        'complete-without-changes',
        'direct-change-payload',
        'approval-message-driven-by-backend-response',
        'submission-error-without-false-success',
        'contract-context-preserved',
      ],
      limitations: ['API persistence is fixture-isolated; backend contract behavior remains covered by backend tests.'],
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
