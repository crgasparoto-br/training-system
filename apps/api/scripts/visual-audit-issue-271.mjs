import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outputDir = path.join(repoRoot, 'artifacts', 'issue-271-visual');
const baseUrl = 'http://127.0.0.1:4173';

const tenant = {
  name: 'Acesso Saúde & Performance',
  privacyNoticeUrl: 'https://example.test/privacidade',
};

const landing = {
  purpose: 'PRE_REGISTRATION',
  expiresAt: '2026-08-23T15:00:00.000Z',
  tenant,
  stages: [
    { key: 'BASIC_DATA', title: 'Dados básicos', optional: false },
    { key: 'ANAMNESIS', title: 'Anamnese Inicial', optional: true },
    { key: 'PARQ', title: 'PAR-Q', optional: true },
  ],
  approximateDuration: 'Poucos minutos. Você pode salvar e continuar depois.',
};

function session(overrides = {}) {
  return {
    alunoId: 'internal-student-id',
    status: 'PRE_REGISTRATION_IN_PROGRESS',
    version: 4,
    currentStep: 'IDENTIFICATION',
    lastSavedAt: '2026-07-23T12:30:00.000Z',
    tenant,
    identity: {
      name: 'Mariana Ferreira dos Santos',
      email: 'mariana@example.com',
      phone: '(15) 99999-0000',
      birthDate: '2012-05-10T00:00:00.000Z',
      cpf: '123.456.789-01',
      addressStreet: 'Rua das Palmeiras',
      addressNumber: '100',
      addressNeighborhood: 'Centro',
      addressCity: 'Sorocaba',
      addressState: 'SP',
      addressZipCode: '18000-000',
      guardianName: 'Ana Ferreira',
      guardianCpf: '987.654.321-00',
      guardianPhone: '(15) 98888-0000',
      guardianEmail: 'ana@example.com',
    },
    isMinor: true,
    claimRole: 'GUARDIAN',
    guardianAuthorization: {
      status: 'ACTIVE',
      role: 'GUARDIAN',
      relationship: 'Mãe',
      validatedAt: '2026-07-23T12:00:00.000Z',
    },
    privacy: {
      noticeVersion: '2026-07',
      noticeUrl: tenant.privacyNoticeUrl,
    },
    missingRequiredFields: [],
    duplicateWarnings: [],
    nextSteps: [
      {
        key: 'ANAMNESIS',
        title: 'Responder Anamnese Inicial',
        description: 'Conte informações importantes para orientar seu acompanhamento.',
        optional: true,
        status: 'NOT_STARTED',
        action: 'START',
      },
      {
        key: 'PARQ',
        title: 'Responder PAR-Q',
        description: 'Responda o questionário de prontidão para atividade física.',
        optional: true,
        status: 'IN_PROGRESS',
        action: 'CONTINUE',
      },
    ],
    ...overrides,
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
    } catch {
      // preview ainda iniciando
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Preview não iniciou em ${url}`);
}

async function installMocking(page, scenario) {
  if (scenario !== 'landing' && scenario !== 'invalid') {
    await page.evaluateOnNewDocument((storedUser) => {
      localStorage.setItem('token', 'visual-audit-token');
      localStorage.setItem('user', JSON.stringify(storedUser));
    }, {
      id: 'guardian-user',
      email: 'responsavel@example.com',
      name: 'Ana Ferreira',
      type: 'aluno',
      profile: { name: 'Ana Ferreira' },
    });
  }

  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const requestUrl = new URL(request.url());
    const pathname = requestUrl.pathname;
    const method = request.method();

    if (pathname === '/api/v1/pre-cadastro/token-safe' && method === 'GET') {
      void request.respond(json({ success: true, data: landing }));
      return;
    }
    if (pathname === '/api/v1/pre-cadastro/invalid-token' && method === 'GET') {
      void request.respond(json({ success: false, error: 'Link inválido ou expirado.' }, 404));
      return;
    }
    if (pathname === '/api/v1/pre-registration/session' && method === 'GET') {
      const payload = scenario === 'completed'
        ? session({
            status: 'PRE_REGISTRATION_COMPLETED',
            currentStep: 'PRIVACY',
            completedAt: '2026-07-23T13:00:00.000Z',
          })
        : scenario === 'guardian'
          ? session({ currentStep: 'GUARDIAN' })
          : scenario === 'privacy'
            ? session({ currentStep: 'PRIVACY' })
            : session();
      void request.respond(json({ success: true, data: payload }));
      return;
    }
    if (pathname === '/api/v1/auth/me' && method === 'GET') {
      void request.respond(json({ success: true, data: {
        id: 'guardian-user',
        email: 'responsavel@example.com',
        name: 'Ana Ferreira',
        type: 'aluno',
      } }));
      return;
    }
    void request.continue();
  });
}

async function capture(browser, { name, route, viewport, scenario }) {
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
  await new Promise((resolve) => setTimeout(resolve, 250));

  const diagnostics = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent?.trim(),
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    storageKeys: Object.keys(localStorage),
    containsInternalId: document.body.textContent?.includes('internal-student-id') || false,
  }));

  if (!diagnostics.title) throw new Error(`${name}: título principal ausente`);
  if (diagnostics.scrollWidth > diagnostics.viewport + 1) {
    throw new Error(`${name}: overflow horizontal ${diagnostics.scrollWidth}/${diagnostics.viewport}`);
  }
  if (diagnostics.containsInternalId) {
    throw new Error(`${name}: identificador interno apareceu na interface`);
  }
  const unexpectedStorage = diagnostics.storageKeys.filter((key) => !['token', 'user'].includes(key));
  if (unexpectedStorage.length > 0) {
    throw new Error(`${name}: dados de formulário persistidos no localStorage: ${unexpectedStorage.join(', ')}`);
  }
  const unexpectedErrors = errors.filter(
    (message) => !(scenario === 'invalid' && message.includes('404'))
  );
  if (unexpectedErrors.length > 0) {
    throw new Error(`${name}: erros de console: ${unexpectedErrors.join(' | ')}`);
  }

  await page.screenshot({
    path: path.join(outputDir, `${name}.png`),
    fullPage: true,
  });
  await page.close();
}

await mkdir(outputDir, { recursive: true });
const preview = spawn(
  'pnpm',
  ['--filter', '@corrida/web', 'preview', '--host', '127.0.0.1', '--port', '4173'],
  { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] }
);
preview.stdout.on('data', (chunk) => process.stdout.write(chunk));
preview.stderr.on('data', (chunk) => process.stderr.write(chunk));

try {
  await waitForServer(baseUrl);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const scenarios = [
      { name: 'landing-desktop', route: '/pre-cadastro/token-safe', viewport: { width: 1440, height: 900 }, scenario: 'landing' },
      { name: 'landing-mobile', route: '/pre-cadastro/token-safe', viewport: { width: 390, height: 844 }, scenario: 'landing' },
      { name: 'invalid-link-mobile', route: '/pre-cadastro/invalid-token', viewport: { width: 390, height: 844 }, scenario: 'invalid' },
      { name: 'identification-desktop', route: '/pre-cadastro', viewport: { width: 1366, height: 768 }, scenario: 'identification' },
      { name: 'guardian-mobile', route: '/pre-cadastro', viewport: { width: 390, height: 844 }, scenario: 'guardian' },
      { name: 'privacy-mobile', route: '/pre-cadastro', viewport: { width: 390, height: 844 }, scenario: 'privacy' },
      { name: 'completed-desktop', route: '/pre-cadastro', viewport: { width: 1440, height: 900 }, scenario: 'completed' },
    ];
    for (const item of scenarios) await capture(browser, item);
  } finally {
    await browser.close();
  }
  console.log('Issue 271 visual audit completed successfully.');
} finally {
  preview.kill('SIGTERM');
}
