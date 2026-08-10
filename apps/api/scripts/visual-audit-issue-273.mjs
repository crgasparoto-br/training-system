import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outputDir = path.join(repoRoot, 'artifacts', 'issue-273-visual');
const baseUrl = 'http://127.0.0.1:4173';
const route = '/pre-cadastro/par-q?alunoId=student-273';
const headSha = process.env.ISSUE_273_HEAD_SHA || process.env.GITHUB_SHA || 'local';

const questions = [
  ['q1', 'Algum médico já disse que você possui algum problema cardíaco e recomendou atividade física somente sob supervisão médica?'],
  ['q2', 'Você sente dor no peito durante a prática de atividade física?'],
  ['q3', 'No último mês, você sentiu dor no peito quando não estava praticando atividade física?'],
  ['q4', 'Você perde o equilíbrio por tontura ou alguma vez perdeu a consciência?'],
  ['q5', 'Você possui algum problema ósseo ou articular que poderia piorar com uma mudança na sua atividade física?'],
  ['q6', 'Algum médico prescreveu atualmente medicamentos para pressão arterial ou problema cardíaco?'],
  ['q7', 'Você conhece alguma outra razão pela qual não deveria praticar atividade física?'],
].map(([key, text], index) => ({
  key,
  order: index + 1,
  text,
  required: true,
  positiveWhen: true,
  status: 'ACTIVE',
}));

const catalog = { version: 'parq-2026-01', status: 'ACTIVE', questions };
const negativeResponses = Object.fromEntries(questions.map(({ key }) => [key, false]));

function session(scenario) {
  const activeConsent = {
    requiredVersion: '2026-07',
    version: 1,
    acceptedVersion: '2026-07',
    acceptedAt: '2026-07-25T12:00:00.000Z',
  };

  if (scenario === 'completed-alert') {
    return {
      alunoId: 'student-273',
      catalog,
      status: 'COMPLETED_REVIEW_REQUIRED',
      version: 5,
      responses: {},
      consent: activeConsent,
      latestSubmission: {
        id: 'submission-alert',
        alunoId: 'student-273',
        contractId: 'contract-273',
        catalogVersion: 'parq-2026-01',
        submittedAt: '2026-07-25T12:30:00.000Z',
        responses: { ...negativeResponses, q2: true, q5: true },
        positiveItems: [
          { key: 'q2', label: questions[1].text },
          { key: 'q5', label: questions[4].text },
        ],
        positiveCount: 2,
        declarationAccepted: true,
        sourceType: 'student',
        review: { id: 'review-alert', status: 'PENDING' },
      },
      legacy: { preserved: false, needsRepeat: false },
    };
  }

  if (scenario === 'completed-no-alert') {
    return {
      alunoId: 'student-273',
      catalog,
      status: 'COMPLETED_NO_ALERT',
      version: 5,
      responses: {},
      consent: activeConsent,
      latestSubmission: {
        id: 'submission-safe',
        alunoId: 'student-273',
        contractId: 'contract-273',
        catalogVersion: 'parq-2026-01',
        submittedAt: '2026-07-25T12:30:00.000Z',
        responses: negativeResponses,
        positiveItems: [],
        positiveCount: 0,
        declarationAccepted: true,
        sourceType: 'student',
      },
      legacy: { preserved: false, needsRepeat: false },
    };
  }

  return {
    alunoId: 'student-273',
    catalog,
    status: scenario === 'needs-repeat' ? 'NEEDS_REPEAT' : 'IN_PROGRESS',
    version: 4,
    responses: scenario === 'resume' ? { q1: false, q2: true } : {},
    consent: { requiredVersion: '2026-07', version: 1 },
    lastSavedAt: scenario === 'resume' ? '2026-07-25T11:00:00.000Z' : undefined,
    legacy: {
      preserved: scenario === 'needs-repeat',
      needsRepeat: scenario === 'needs-repeat',
    },
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
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 'student-user-273',
        email: 'aluno@example.com',
        name: 'Aluno Teste',
        type: 'aluno',
      })
    );
  });

  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname === '/api/v1/auth/me') {
      void request.respond(
        json({
          success: true,
          data: {
            id: 'student-user-273',
            email: 'aluno@example.com',
            name: 'Aluno Teste',
            type: 'aluno',
          },
        })
      );
      return;
    }

    if (
      url.pathname === '/api/v1/pre-registration/processes/student-273/parq' &&
      method === 'GET'
    ) {
      void request.respond(json({ success: true, data: session(scenario) }));
      return;
    }

    if (
      url.pathname === '/api/v1/pre-registration/processes/student-273/parq' &&
      method === 'PATCH'
    ) {
      void request.respond(json({ success: true, data: session('resume') }));
      return;
    }

    if (
      url.pathname === '/api/v1/pre-registration/processes/student-273/parq/complete' &&
      method === 'POST'
    ) {
      void request.respond(json({ success: true, data: session('completed-no-alert') }));
      return;
    }

    if (
      url.pathname === '/api/v1/pre-registration/processes/student-273/parq/consent/revoke' &&
      method === 'POST'
    ) {
      const revoked = session('completed-no-alert');
      revoked.consent = {
        ...revoked.consent,
        version: revoked.consent.version + 1,
        revokedAt: '2026-07-26T00:00:00.000Z',
      };
      void request.respond(json({ success: true, data: revoked }));
      return;
    }

    if (url.pathname.startsWith('/api/v1/')) {
      void request.respond(
        json({ success: false, error: 'Unexpected visual audit request' }, 404)
      );
      return;
    }

    void request.continue();
  });
}

async function pressSpace(element, page, label) {
  if (!element) throw new Error(`${label}: controle não encontrado`);
  await element.focus();
  await page.keyboard.press('Space');
}

async function runKeyboardCompletion(page, name) {
  const interactions = [];
  const checkboxes = await page.$$('input[type="checkbox"]');
  await pressSpace(checkboxes[0], page, `${name}: consentimento`);
  interactions.push({ control: 'consentimento', role: 'checkbox', key: 'Space', passed: true });

  for (const question of questions) {
    const radios = await page.$$(`input[name="parq-${question.key}"][type="radio"]`);
    if (radios.length !== 2) {
      throw new Error(`${name}: opções da pergunta ${question.key} inválidas`);
    }
    await pressSpace(radios[1], page, `${name}: ${question.key}`);
    interactions.push({ control: question.key, role: 'radio', key: 'Space', passed: true });
  }

  await pressSpace(checkboxes[1], page, `${name}: declaração`);
  interactions.push({ control: 'declaracao', role: 'checkbox', key: 'Space', passed: true });

  const submitEnabled = await page.$$eval('button', (buttons) =>
    buttons.some(
      (button) =>
        button.textContent?.includes('Concluir PAR-Q') && !button.disabled
    )
  );
  if (!submitEnabled) throw new Error(`${name}: botão de conclusão não foi habilitado`);

  const focusedSubmit = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find((item) =>
      item.textContent?.includes('Concluir PAR-Q')
    );
    button?.focus();
    return document.activeElement === button;
  });
  if (!focusedSubmit) throw new Error(`${name}: botão de conclusão não recebeu foco`);

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.textContent?.includes('PAR-Q concluído'));
  interactions.push({ control: 'concluir-parq', role: 'button', key: 'Enter', passed: true });

  const focusedRepeat = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find((item) =>
      item.textContent?.includes('Responder novamente')
    );
    button?.focus();
    return document.activeElement === button;
  });
  if (!focusedRepeat) throw new Error(`${name}: responder novamente não recebeu foco`);

  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.body.textContent?.includes('Questionário PAR-Q'));
  interactions.push({ control: 'responder-novamente', role: 'button', key: 'Space', passed: true });

  return interactions;
}

async function capture(browser, { name, viewport, scenario, completeForm = false }) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await installMocking(page, scenario);

  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`${baseUrl}${route}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  await page.waitForSelector('h1', { timeout: 20_000 });

  const controlInteractions = completeForm
    ? await runKeyboardCompletion(page, name)
    : [];

  const diagnostics = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent?.trim(),
    viewport: document.documentElement.clientWidth,
    viewportHeight: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    fieldsets: document.querySelectorAll('fieldset').length,
    legends: document.querySelectorAll('fieldset legend').length,
    unnamedRadios: Array.from(document.querySelectorAll('input[type="radio"]')).filter(
      (input) => !input.getAttribute('name')
    ).length,
    containsInternalId: document.body.textContent?.includes('student-273') || false,
    storageKeys: Object.keys(localStorage),
    hasMedicalDisclaimer:
      document.body.textContent?.includes('não constitui diagnóstico') ||
      document.body.textContent?.includes('não constitui diagnóstico nem liberação médica') ||
      false,
    hasReviewWarning:
      document.body.textContent?.includes('Análise profissional necessária') || false,
    hasNeedsRepeat: document.body.textContent?.includes('registro antigo') || false,
  }));

  if (!diagnostics.title) throw new Error(`${name}: título ausente`);
  if (diagnostics.scrollWidth > diagnostics.viewport + 1) {
    throw new Error(`${name}: overflow horizontal`);
  }
  if (diagnostics.containsInternalId) {
    throw new Error(`${name}: ID interno apareceu na interface`);
  }
  if (
    diagnostics.unnamedRadios > 0 ||
    diagnostics.fieldsets !== diagnostics.legends
  ) {
    throw new Error(`${name}: semântica das perguntas inválida`);
  }
  if (!diagnostics.hasMedicalDisclaimer) {
    throw new Error(`${name}: aviso de não diagnóstico/liberação ausente`);
  }
  if (scenario === 'completed-alert' && !diagnostics.hasReviewWarning) {
    throw new Error(`${name}: alerta profissional ausente`);
  }
  if (scenario === 'needs-repeat' && !diagnostics.hasNeedsRepeat) {
    throw new Error(`${name}: orientação de repetição ausente`);
  }

  const unexpectedStorage = diagnostics.storageKeys.filter(
    (key) => !['token', 'user'].includes(key)
  );
  if (unexpectedStorage.length) {
    throw new Error(`${name}: respostas persistidas no localStorage`);
  }
  if (errors.length) {
    throw new Error(`${name}: erros de navegador: ${errors.join(' | ')}`);
  }

  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.tagName || 'BODY');
  if (focused === 'BODY') throw new Error(`${name}: foco não avançou por teclado`);

  const accessibilityTree = await page.accessibility.snapshot({ interestingOnly: false });
  if (!accessibilityTree) throw new Error(`${name}: árvore de acessibilidade ausente`);

  const screenshotPath = path.join(outputDir, `${name}.png`);
  const diagnosticsPath = path.join(outputDir, `${name}.diagnostics.json`);
  const accessibilityPath = path.join(outputDir, `${name}.accessibility.json`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await writeFile(
    diagnosticsPath,
    `${JSON.stringify(
      {
        name,
        route,
        scenario,
        viewport,
        diagnostics,
        focusedAfterTab: focused,
        controlInteractions,
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await writeFile(
    accessibilityPath,
    `${JSON.stringify(accessibilityTree, null, 2)}\n`,
    'utf8'
  );

  await page.close();
  return {
    name,
    route,
    scenario,
    viewport: `${viewport.width}x${viewport.height}`,
    screenshot: path.relative(repoRoot, screenshotPath),
    diagnostics: path.relative(repoRoot, diagnosticsPath),
    accessibilityTree: path.relative(repoRoot, accessibilityPath),
    keyboardOnly: completeForm,
    controlInteractions,
  };
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const preview = spawn(
  'pnpm',
  ['--filter', '@corrida/web', 'preview', '--host', '127.0.0.1', '--port', '4173'],
  { cwd: repoRoot, stdio: 'inherit', detached: true }
);

let browser;
try {
  await waitForServer(baseUrl);
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const scenarios = [
    {
      name: 'parq-form-desktop',
      viewport: { width: 1440, height: 900 },
      scenario: 'resume',
      completeForm: true,
    },
    {
      name: 'parq-needs-repeat-mobile',
      viewport: { width: 390, height: 844 },
      scenario: 'needs-repeat',
    },
    {
      name: 'parq-alert-low-height',
      viewport: { width: 1366, height: 768 },
      scenario: 'completed-alert',
    },
    {
      name: 'parq-no-alert-mobile',
      viewport: { width: 390, height: 844 },
      scenario: 'completed-no-alert',
    },
  ];

  const results = [];
  for (const item of scenarios) {
    results.push(await capture(browser, item));
  }

  const visualMetrics = {
    schema_version: 2,
    head_sha: headSha,
    routes: [
      {
        route,
        viewports: ['1440x900', '1366x768', '390x844'],
        long_content_or_zoom: true,
        keyboard_only: true,
        accessibility_tree: {
          captured: true,
          files: results.map((item) => item.accessibilityTree),
        },
        scenarios: results,
      },
    ],
  };

  await writeFile(
    path.join(outputDir, 'visual-metrics.json'),
    `${JSON.stringify(visualMetrics, null, 2)}\n`,
    'utf8'
  );

  console.log(
    'Issue #273 visual audit completed for form, resume, needs-repeat and completion states.'
  );
} finally {
  if (browser) await browser.close();
  if (!preview.killed) process.kill(-preview.pid, 'SIGTERM');
}
