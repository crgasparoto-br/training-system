const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = process.env.ISSUE342_BASE_URL || 'http://127.0.0.1:4173';
const ORIGIN = new URL(BASE_URL).origin;
const OUTPUT_DIR = process.env.ISSUE342_EVIDENCE_DIR || path.resolve('issue-342-browser-evidence');
const HEAD_SHA = process.env.ISSUE342_HEAD_SHA || process.env.GITHUB_SHA || null;
const CONTRACT_ID = 'contract-342-evidence';
const ALUNO_ID = 'aluno-342-evidence';
const REVIEW_ID = 'review-342-evidence';
const TOKEN = 'issue-342-browser-evidence-token';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const studentUser = {
  id: 'user-342-evidence',
  email: 'aluno342@teste.local',
  name: 'Aluno Evidencia',
  type: 'aluno',
  profile: { name: 'Aluno Evidencia' },
  aluno: { id: ALUNO_ID },
};

const review = {
  id: REVIEW_ID,
  alunoId: ALUNO_ID,
  requestedAt: '2026-08-10T12:00:00.000Z',
  dueAt: '2026-08-25T12:00:00.000Z',
  status: 'pending',
  sectionsRequested: ['personal', 'contact'],
  requiresApproval: false,
};

const profile = {
  id: ALUNO_ID,
  email: 'aluno342@teste.local',
  profile: {
    name: 'Aluno Evidencia',
    phone: '11999999999',
    birthDate: '1990-01-01T00:00:00.000Z',
    gender: 'male',
    maritalStatus: 'single',
    instagramHandle: '@aluno342',
  },
  physical: { age: 36, weight: 78, height: 178 },
  intakeForm: { mainGoal: 'Condicionamento' },
};

const longNotification = {
  id: 'notification-relevant-long',
  type: 'profile_review_reminder',
  title: 'Lembrete importante sobre a sua revisão cadastral pendente',
  message:
    'Confira seus dados cadastrais e confirme cuidadosamente telefone, endereço e demais informações solicitadas antes do prazo informado para manter o vínculo atualizado sem perder nenhuma orientação registrada.',
  data: { reviewId: REVIEW_ID, alunoId: ALUNO_ID },
  createdAt: '2026-08-12T12:00:00.000Z',
};

const unrelatedNotification = {
  id: 'notification-other-review',
  type: 'profile_review_overdue',
  title: 'Aviso de outro vínculo',
  message: 'Este conteúdo não pode aparecer na revisão selecionada.',
  data: { reviewId: 'review-other', alunoId: 'aluno-other' },
  createdAt: '2026-08-11T12:00:00.000Z',
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
  const maxScrollWidth = Math.max(metrics.documentScrollWidth, metrics.bodyScrollWidth);
  assert.ok(maxScrollWidth <= metrics.viewportWidth + 1, `${label}: overflow horizontal`);
  return metrics;
}

async function createPage(browser, viewport, failFirstSummary = false) {
  const requestLog = [];
  let summaryAttempts = 0;
  const context = await browser.newContext({ viewport, storageState: storageState() });
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();
    requestLog.push({ pathname, method, contractId: request.headers()['x-contract-id'] || null });

    const fulfill = (data, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(status >= 400 ? data : { success: true, data }),
    });

    if (method === 'GET' && pathname === '/api/v1/auth/me') return fulfill(studentUser);
    if (method === 'GET' && pathname === '/api/v1/pre-registration/processes') {
      return fulfill([{ alunoId: ALUNO_ID, status: 'ACTIVE_STUDENT' }]);
    }
    if (method === 'GET' && pathname === '/api/v1/student/me/summary') {
      summaryAttempts += 1;
      if (failFirstSummary && summaryAttempts === 1) return fulfill({ error: 'Falha injetada' }, 500);
      return fulfill({
        name: 'Aluno Evidencia',
        nextProfileReviewAt: review.dueAt,
        hasPendingProfileReview: true,
        recentNotifications: [longNotification],
      });
    }
    if (method === 'GET' && pathname === '/api/v1/student/me/profile-review') return fulfill(review);
    if (method === 'GET' && pathname === '/api/v1/student/me/profile') return fulfill(profile);
    if (method === 'GET' && pathname === '/api/v1/student/me/notifications') {
      return fulfill([longNotification, unrelatedNotification]);
    }
    return fulfill({ error: `Unexpected request: ${method} ${pathname}` }, 501);
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${BASE_URL}/inicio?contractId=${CONTRACT_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  return { context, page, pageErrors, requestLog, getSummaryAttempts: () => summaryAttempts };
}

function assertScopedRequests(requestLog, label) {
  const scoped = requestLog.filter((entry) => entry.pathname.startsWith('/api/v1/student/me/'));
  assert.ok(scoped.length > 0, `${label}: nenhuma requisição student/me observada`);
  for (const entry of scoped) {
    assert.equal(entry.contractId, CONTRACT_ID, `${label}: ${entry.pathname} sem x-contract-id`);
  }
}

async function verifyPending(browser, label, viewport, keyboardNavigation) {
  const { context, page, pageErrors, requestLog } = await createPage(browser, viewport);
  try {
    await page.getByText('Revisão cadastral pendente', { exact: true }).waitFor({ timeout: 10000 });
    await page.getByText(longNotification.title, { exact: true }).waitFor();
    assert.equal(await page.getByText(unrelatedNotification.title, { exact: true }).count(), 0);
    const metrics = await assertNoHorizontalOverflow(page, label);
    const openReview = page.getByRole('link', { name: 'Abrir revisão' }).first();
    assert.ok(await openReview.boundingBox(), `${label}: CTA não renderizado`);
    await page.screenshot({ path: path.join(OUTPUT_DIR, `${label}-home.png`), fullPage: true });

    if (keyboardNavigation) {
      await openReview.focus();
      assert.equal(await openReview.evaluate((node) => document.activeElement === node), true);
      await page.keyboard.press('Enter');
      await page.waitForURL((url) => url.pathname === '/student/profile-review' && url.searchParams.get('contractId') === CONTRACT_ID);
      await page.getByText('Revisão pendente', { exact: true }).waitFor();
      await page.getByLabel('Telefone').waitFor();
      await assertNoHorizontalOverflow(page, `${label}-detail`);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `${label}-detail.png`), fullPage: true });
    }

    assertScopedRequests(requestLog, label);
    assert.deepEqual(pageErrors, []);
    return { label, viewport, metrics, keyboardNavigation, result: 'passed' };
  } finally {
    await context.close();
  }
}

async function verifyRecoverableError(browser) {
  const label = 'mobile-retry-error';
  const { context, page, pageErrors, requestLog, getSummaryAttempts } = await createPage(
    browser,
    { width: 390, height: 844 },
    true
  );
  try {
    await page.getByText('Não foi possível carregar sua revisão', { exact: true }).waitFor({ timeout: 10000 });
    const retry = page.getByRole('button', { name: 'Tentar novamente' });
    await retry.focus();
    await page.keyboard.press('Enter');
    await page.getByText('Revisão cadastral pendente', { exact: true }).waitFor();
    assert.equal(getSummaryAttempts(), 2);
    await assertNoHorizontalOverflow(page, label);
    assertScopedRequests(requestLog, label);
    assert.deepEqual(pageErrors, []);
    return { label, summaryAttempts: getSummaryAttempts(), result: 'passed' };
  } finally {
    await context.close();
  }
}

async function main() {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const scenarios = [
      await verifyPending(browser, 'desktop-pending', { width: 1366, height: 768 }, false),
      await verifyPending(browser, 'mobile-pending', { width: 390, height: 844 }, true),
      await verifyRecoverableError(browser),
    ];
    fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify({
      schemaVersion: 1,
      issue: 342,
      candidateSha: HEAD_SHA,
      scenarios,
      result: scenarios.every((scenario) => scenario.result === 'passed') ? 'passed' : 'failed',
      limitations: ['API responses use isolated fixtures; this proves real Chromium rendering and interaction.'],
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
