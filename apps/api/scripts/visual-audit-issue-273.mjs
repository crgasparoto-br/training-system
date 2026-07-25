import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outputDir = path.join(repoRoot, 'artifacts', 'issue-273-visual');
const baseUrl = 'http://127.0.0.1:4173';

const questions = [
  ['q1', 'Algum médico já disse que você possui algum problema cardíaco e recomendou atividade física somente sob supervisão médica?'],
  ['q2', 'Você sente dor no peito durante a prática de atividade física?'],
  ['q3', 'No último mês, você sentiu dor no peito quando não estava praticando atividade física?'],
  ['q4', 'Você perde o equilíbrio por tontura ou alguma vez perdeu a consciência?'],
  ['q5', 'Você possui algum problema ósseo ou articular que poderia piorar com uma mudança na sua atividade física?'],
  ['q6', 'Algum médico prescreveu atualmente medicamentos para pressão arterial ou problema cardíaco?'],
  ['q7', 'Você conhece alguma outra razão pela qual não deveria praticar atividade física?'],
].map(([key, text], index) => ({ key, order: index + 1, text, required: true, positiveWhen: true, status: 'ACTIVE' }));

const catalog = { version: 'parq-2026-01', status: 'ACTIVE', questions };
const negativeResponses = Object.fromEntries(questions.map(({ key }) => [key, false]));

function session(scenario) {
  if (scenario === 'completed-alert') {
    return {
      alunoId: 'student-273', catalog, status: 'COMPLETED_REVIEW_REQUIRED', version: 1,
      responses: {}, consent: { requiredVersion: '2026-07', acceptedVersion: '2026-07', acceptedAt: '2026-07-25T12:00:00.000Z' },
      latestSubmission: {
        id: 'submission-alert', alunoId: 'student-273', contractId: 'contract-273', catalogVersion: 'parq-2026-01',
        submittedAt: '2026-07-25T12:30:00.000Z', responses: { ...negativeResponses, q2: true, q5: true },
        positiveItems: [{ key: 'q2', label: questions[1].text }, { key: 'q5', label: questions[4].text }],
        positiveCount: 2, declarationAccepted: true, sourceType: 'student',
        review: { id: 'review-alert', status: 'PENDING' },
      },
      legacy: { preserved: false, needsRepeat: false },
    };
  }
  if (scenario === 'completed-no-alert') {
    return {
      alunoId: 'student-273', catalog, status: 'COMPLETED_NO_ALERT', version: 1,
      responses: {}, consent: { requiredVersion: '2026-07', acceptedVersion: '2026-07', acceptedAt: '2026-07-25T12:00:00.000Z' },
      latestSubmission: {
        id: 'submission-safe', alunoId: 'student-273', contractId: 'contract-273', catalogVersion: 'parq-2026-01',
        submittedAt: '2026-07-25T12:30:00.000Z', responses: negativeResponses,
        positiveItems: [], positiveCount: 0, declarationAccepted: true, sourceType: 'student',
      },
      legacy: { preserved: false, needsRepeat: false },
    };
  }
  return {
    alunoId: 'student-273', catalog, status: scenario === 'needs-repeat' ? 'NEEDS_REPEAT' : 'IN_PROGRESS', version: 4,
    responses: scenario === 'resume' ? { q1: false, q2: true } : {},
    consent: { requiredVersion: '2026-07' }, lastSavedAt: scenario === 'resume' ? '2026-07-25T11:00:00.000Z' : undefined,
    legacy: { preserved: scenario === 'needs-repeat', needsRepeat: scenario === 'needs-repeat' },
  };
}

function json(data, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(data) };
}

async function waitForServer(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Preview não iniciou em ${url}`);
}

async function installMocking(page, scenario) {
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('token', 'issue-273-visual-token');
    localStorage.setItem('user', JSON.stringify({ id: 'student-user-273', email: 'aluno@example.com', name: 'Aluno Teste', type: 'aluno' }));
  });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/auth/me') {
      void request.respond(json({ success: true, data: { id: 'student-user-273', email: 'aluno@example.com', name: 'Aluno Teste', type: 'aluno' } }));
      return;
    }
    if (url.pathname === '/api/v1/pre-registration/processes/student-273/parq' && request.method() === 'GET') {
      void request.respond(json({ success: true, data: session(scenario) }));
      return;
    }
    if (url.pathname.startsWith('/api/v1/')) {
      void request.respond(json({ success: false, error: 'Unexpected visual audit request' }, 404));
      return;
    }
    void request.continue();
  });
}

async function capture(browser, { name, viewport, scenario, completeForm = false }) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await installMocking(page, scenario);
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${baseUrl}/pre-cadastro/par-q?alunoId=student-273`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForSelector('h1', { timeout: 20_000 });

  if (completeForm) {
    const checkboxes = await page.$$('input[type="checkbox"]');
    await checkboxes[0].click();
    for (const question of questions) {
      const radios = await page.$$(`input[name="parq-${question.key}"][type="radio"]`);
      if (radios.length !== 2) throw new Error(`${name}: opções da pergunta ${question.key} inválidas`);
      await radios[1].click();
    }
    await checkboxes[1].click();
    const enabled = await page.$$eval('button', (buttons) =>
      buttons.some((button) => button.textContent?.includes('Concluir PAR-Q') && !button.disabled)
    );
    if (!enabled) throw new Error(`${name}: botão de conclusão não foi habilitado`);
  }

  const diagnostics = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent?.trim(),
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    fieldsets: document.querySelectorAll('fieldset').length,
    legends: document.querySelectorAll('fieldset legend').length,
    unnamedRadios: Array.from(document.querySelectorAll('input[type="radio"]')).filter((input) => !input.getAttribute('name')).length,
    containsInternalId: document.body.textContent?.includes('student-273') || false,
    storageKeys: Object.keys(localStorage),
    hasMedicalDisclaimer: document.body.textContent?.includes('não constitui diagnóstico') || document.body.textContent?.includes('não constitui diagnóstico nem liberação médica') || false,
    hasReviewWarning: document.body.textContent?.includes('Análise profissional necessária') || false,
    hasNeedsRepeat: document.body.textContent?.includes('registro antigo') || false,
  }));

  if (!diagnostics.title) throw new Error(`${name}: título ausente`);
  if (diagnostics.scrollWidth > diagnostics.viewport + 1) throw new Error(`${name}: overflow horizontal`);
  if (diagnostics.containsInternalId) throw new Error(`${name}: ID interno apareceu na interface`);
  if (diagnostics.unnamedRadios > 0 || diagnostics.fieldsets !== diagnostics.legends) throw new Error(`${name}: semântica das perguntas inválida`);
  if (!diagnostics.hasMedicalDisclaimer) throw new Error(`${name}: aviso de não diagnóstico/liberação ausente`);
  if (scenario === 'completed-alert' && !diagnostics.hasReviewWarning) throw new Error(`${name}: alerta profissional ausente`);
  if (scenario === 'needs-repeat' && !diagnostics.hasNeedsRepeat) throw new Error(`${name}: orientação de repetição ausente`);
  const unexpectedStorage = diagnostics.storageKeys.filter((key) => !['token', 'user'].includes(key));
  if (unexpectedStorage.length) throw new Error(`${name}: respostas persistidas no localStorage`);
  if (errors.length) throw new Error(`${name}: erros de navegador: ${errors.join(' | ')}`);

  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.tagName || 'BODY');
  if (focused === 'BODY') throw new Error(`${name}: foco não avançou por teclado`);
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
  await page.close();
}

await mkdir(outputDir, { recursive: true });
const preview = spawn('pnpm', ['--filter', '@corrida/web', 'preview', '--host', '127.0.0.1', '--port', '4173'], { cwd: repoRoot, stdio: 'inherit', detached: true });
let browser;
try {
  await waitForServer(baseUrl);
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const scenarios = [
    { name: 'parq-form-desktop', viewport: { width: 1440, height: 900 }, scenario: 'resume', completeForm: true },
    { name: 'parq-needs-repeat-mobile', viewport: { width: 390, height: 844 }, scenario: 'needs-repeat' },
    { name: 'parq-alert-low-height', viewport: { width: 1366, height: 768 }, scenario: 'completed-alert' },
    { name: 'parq-no-alert-mobile', viewport: { width: 390, height: 844 }, scenario: 'completed-no-alert' },
  ];
  for (const item of scenarios) await capture(browser, item);
  console.log('Issue #273 visual audit completed for form, resume, needs-repeat and completion states.');
} finally {
  if (browser) await browser.close();
  if (!preview.killed) process.kill(-preview.pid, 'SIGTERM');
}
