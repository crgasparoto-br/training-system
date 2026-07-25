import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const repoRoot = path.resolve(process.cwd(), '../..');
const outputDir = path.join(repoRoot, 'artifacts', 'issue-272-visual');
const baseUrl = 'http://127.0.0.1:4173';
const tenant = {
  name: 'Acesso Saúde & Performance',
  privacyNoticeUrl: 'https://example.test/privacidade',
};
const user = {
  id: 'student-user',
  email: 'aluno@example.com',
  name: 'Aluno de Teste',
  type: 'aluno',
};

function session(overrides = {}) {
  return {
    alunoId: 'student-visual-272',
    status: 'NOT_STARTED',
    version: 0,
    currentStep: 'CONSENT',
    formVersion: 'health-intake-v1',
    answers: {},
    consent: { requiredVersion: '2026-07' },
    respondent: { role: 'STUDENT', userId: user.id },
    migratedFromLegacy: false,
    migrationReviewRequired: false,
    tenant,
    ...overrides,
  };
}

function json(data, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(data) };
}

async function waitForServer(timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Preview da aplicação não iniciou.');
}

async function capture(browser, scenario) {
  const page = await browser.newPage();
  await page.setViewport(scenario.viewport);
  await page.evaluateOnNewDocument((storedUser) => {
    localStorage.setItem('token', 'visual-audit-token-272');
    localStorage.setItem('user', JSON.stringify(storedUser));
  }, user);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.pathname === '/api/v1/pre-registration/processes/student-visual-272/health-intake' &&
      request.method() === 'GET'
    ) {
      void request.respond(json({ success: true, data: scenario.session }));
      return;
    }
    if (url.pathname === '/api/v1/auth/me' && request.method() === 'GET') {
      void request.respond(json({ success: true, data: user }));
      return;
    }
    void request.continue();
  });

  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`${baseUrl}/pre-cadastro/anamnese?alunoId=student-visual-272`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await page.waitForSelector('h1', { timeout: 20000 });
  try {
    await page.waitForFunction(
      (expected) => Array.from(document.querySelectorAll('h2')).some((heading) => heading.textContent?.includes(expected)),
      { timeout: 20000 },
      scenario.heading
    );
  } catch (error) {
    console.error(`${scenario.name}: URL ${page.url()}`);
    console.error(`${scenario.name}: body ${(await page.evaluate(() => document.body.textContent || '')).slice(0, 1200)}`);
    await page.screenshot({
      path: path.join(outputDir, `${scenario.name}-failure.png`),
      fullPage: true,
    });
    throw error;
  }
  await new Promise((resolve) => setTimeout(resolve, 300));

  const diagnostics = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const currentSteps = document.querySelectorAll('[aria-current="step"]');
    const bodyText = document.body.textContent || '';
    return {
      h1: document.querySelector('h1')?.textContent?.trim(),
      h2: document.querySelector('h2')?.textContent?.trim(),
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      currentStepCount: currentSteps.length,
      unnamedButtons: buttons.filter(
        (button) => !button.textContent?.trim() && !button.getAttribute('aria-label')
      ).length,
      hasForbiddenAssessmentContent: [
        'Antropometria',
        'composição corporal',
        'macronutrientes',
        'aporte energético',
        'PAR-Q',
      ].some((value) => bodyText.includes(value)),
      containsInternalId: bodyText.includes('student-visual-272'),
    };
  });

  if (diagnostics.h1 !== 'Anamnese Inicial') throw new Error(`${scenario.name}: título incorreto`);
  if (!diagnostics.h2?.includes(scenario.heading)) throw new Error(`${scenario.name}: etapa incorreta`);
  if (diagnostics.scrollWidth > diagnostics.viewportWidth + 1) {
    throw new Error(`${scenario.name}: overflow horizontal`);
  }
  if (diagnostics.currentStepCount !== 1) throw new Error(`${scenario.name}: passo atual inconsistente`);
  if (diagnostics.unnamedButtons > 0) throw new Error(`${scenario.name}: botão sem nome acessível`);
  if (diagnostics.hasForbiddenAssessmentContent) throw new Error(`${scenario.name}: conteúdo fora da Anamnese`);
  if (diagnostics.containsInternalId) throw new Error(`${scenario.name}: identificador interno exposto`);
  if (errors.length > 0) throw new Error(`${scenario.name}: erros de console: ${errors.join(' | ')}`);

  await page.screenshot({
    path: path.join(outputDir, `${scenario.name}.png`),
    fullPage: true,
  });
  await page.close();
}

await mkdir(outputDir, { recursive: true });
const preview = spawn(
  'pnpm',
  ['--filter', '@corrida/web', 'preview', '--host', '127.0.0.1', '--port', '4173'],
  { cwd: repoRoot, stdio: 'inherit', detached: true }
);

let browser;
try {
  await waitForServer();
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  await capture(browser, {
    name: 'consent-mobile',
    heading: 'Privacidade e consentimento',
    viewport: { width: 390, height: 844 },
    session: session(),
  });
  await capture(browser, {
    name: 'draft-desktop',
    heading: 'Histórico de saúde',
    viewport: { width: 1440, height: 900 },
    session: session({
      status: 'IN_PROGRESS',
      version: 2,
      currentStep: 'HEALTH_HISTORY',
      answers: {
        mainGoal: 'Retomar a corrida com segurança',
        hasMedicalConditions: false,
      },
      consent: {
        requiredVersion: '2026-07',
        acceptedVersion: '2026-07',
        acceptedAt: '2026-07-25T01:00:00.000Z',
      },
      lastSavedAt: '2026-07-25T01:05:00.000Z',
    }),
  });
  await capture(browser, {
    name: 'completed-mobile',
    heading: 'Revise suas respostas',
    viewport: { width: 390, height: 844 },
    session: session({
      status: 'COMPLETED',
      version: 7,
      currentStep: 'REVIEW',
      answers: {
        mainGoal: 'Melhorar o condicionamento',
        hasMedicalConditions: false,
        usesMedication: false,
        hasAllergies: false,
        hasInjuries: true,
        injuriesHistory: 'Entorse de tornozelo já recuperada',
        hasExerciseRestrictions: false,
        trainingBackground: 'Corrida e musculação três vezes por semana',
        observations: 'Sem observações adicionais',
      },
      consent: {
        requiredVersion: '2026-07',
        acceptedVersion: '2026-07',
        acceptedAt: '2026-07-25T01:00:00.000Z',
      },
      lastSavedAt: '2026-07-25T01:20:00.000Z',
      completedAt: '2026-07-25T01:20:00.000Z',
      declarationAcceptedAt: '2026-07-25T01:20:00.000Z',
    }),
  });
  console.log('Issue 272 focused visual audit completed successfully.');
} finally {
  if (browser) await browser.close();
  if (preview.pid) {
    try { process.kill(-preview.pid, 'SIGTERM'); } catch { preview.kill('SIGTERM'); }
  }
}
