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

const adminUser = {
  id: 'admin-user',
  email: 'gestor@example.com',
  name: 'Gestor Validador',
  type: 'professor',
  profile: { name: 'Gestor Validador' },
  accessControl: { isMaster: true, permissions: [] },
  professor: {
    id: 'admin-professor',
    role: 'master',
    collaboratorFunction: { id: 'manager-function', name: 'Gestor', code: 'manager' },
    contract: {
      id: 'contract-visual',
      type: 'academy',
      document: '00000000000191',
      name: 'Acesso Saúde & Performance',
      tradeName: 'Acesso Saúde & Performance',
    },
  },
};

const adminLead = {
  id: 'internal-student-id',
  name: 'Dependente convidado',
  contacts: { phone: '(**) *****-0000', email: 'm***@example.com', masked: false },
  origin: 'Indicação',
  status: 'INVITED',
  responsible: { id: 'admin-professor', name: 'Gestor Validador' },
  createdAt: '2026-07-23T10:00:00.000Z',
  updatedAt: '2026-07-24T12:00:00.000Z',
  lastActivityAt: '2026-07-24T12:00:00.000Z',
  inviteStatus: 'ACTIVE',
  inviteExpiresAt: '2026-08-23T12:00:00.000Z',
  inviteAllowedActions: { canGenerateFirst: false, canRegenerate: true, canRevoke: true },
  progress: {
    basicRegistration: 'NOT_STARTED',
    healthModuleStatus: 'NOT_STARTED',
    parqModuleStatus: 'NOT_STARTED',
    parqRequiresProfessionalReview: false,
    completedFields: 2,
    totalFields: 7,
    missingRequiredFields: ['guardianAuthorization'],
  },
  nextAction: {
    code: 'WAIT_FOR_ACCESS',
    label: 'Validar vínculo do responsável',
    description: 'A declaração foi enviada e os dados permanecem protegidos.',
    enabled: true,
  },
  allowedActions: {
    canEditCommercialData: true,
    canGenerateInvite: false,
    canRegenerateInvite: true,
    canRevokeInvite: true,
    canReview: false,
    canValidateGuardianAuthorization: true,
    canDiscard: true,
    canReopen: false,
    canConvert: false,
    canOpenStudentCentral: false,
  },
  commercial: {},
  lifecycleProgress: {
    alunoId: 'internal-student-id',
    status: 'INVITED',
    healthModuleStatus: 'NOT_STARTED',
    parqModuleStatus: 'NOT_STARTED',
    missingRequiredFields: ['guardianAuthorization'],
  },
  invite: {
    id: 'invite-visual',
    alunoId: 'internal-student-id',
    status: 'ACTIVE',
    purpose: 'PRE_REGISTRATION',
    expiresAt: '2026-08-23T12:00:00.000Z',
    createdAt: '2026-07-23T10:00:00.000Z',
    firstAccessedAt: '2026-07-24T11:30:00.000Z',
    linkRecoverable: false,
    allowedActions: { canGenerateFirst: false, canRegenerate: true, canRevoke: true },
  },
  pendencies: [{ code: 'guardianAuthorization', label: 'Validação do responsável', blocking: true }],
  history: [],
};

const adminGuardianAuthorization = {
  id: 'guardian-authorization-visual',
  alunoId: 'internal-student-id',
  contractId: 'contract-visual',
  status: 'PENDING',
  relationship: 'Mãe',
  requestedAt: '2026-07-24T12:00:00.000Z',
  guardian: {
    userId: 'guardian-user',
    name: 'Ana Ferreira',
    email: 'ana.ferreira@example.com',
    phone: '(15) 98888-0000',
  },
};

function processSummary(overrides = {}) {
  return {
    alunoId: 'internal-student-id',
    status: 'PRE_REGISTRATION_IN_PROGRESS',
    claimRole: 'GUARDIAN',
    currentStep: 'IDENTIFICATION',
    lastSavedAt: '2026-07-23T12:30:00.000Z',
    displayName: 'Mariana Ferreira dos Santos',
    tenant,
    guardianAuthorizationStatus: 'ACTIVE',
    requiresGuardianConfirmation: false,
    ...overrides,
  };
}

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
        href: '/pre-cadastro/anamnese',
      },
      {
        key: 'PARQ',
        title: 'Responder PAR-Q',
        description: 'Responda o questionário de prontidão para atividade física.',
        optional: true,
        status: 'IN_PROGRESS',
        action: 'CONTINUE',
        href: '/pre-cadastro/par-q',
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

function processesForScenario(scenario) {
  if (scenario === 'selector') {
    return [
      processSummary({
        alunoId: 'student-self',
        claimRole: 'STUDENT',
        displayName: 'Cadastro do próprio aluno com nome propositalmente longo para auditoria',
        guardianAuthorizationStatus: 'NOT_REQUIRED',
      }),
      processSummary({
        alunoId: 'dependent-two',
        displayName: 'Dependente Dois',
      }),
    ];
  }
  if (scenario === 'pending-guardian') {
    return [
      processSummary({
        displayName: 'Dependente convidado',
        guardianAuthorizationStatus: 'PENDING',
        requiresGuardianConfirmation: true,
      }),
    ];
  }
  if (scenario === 'awaiting-guardian') {
    return [
      processSummary({
        displayName: 'Dependente convidado',
        guardianAuthorizationStatus: 'PENDING',
        guardianAuthorizationRelationship: 'Mãe',
        guardianAuthorizationRequestedAt: '2026-07-24T12:00:00.000Z',
        requiresGuardianConfirmation: true,
      }),
    ];
  }
  return [processSummary()];
}

async function installMocking(page, scenario) {
  const publicScenarios = new Set(['landing', 'invalid']);
  if (!publicScenarios.has(scenario)) {
    const storedUser = scenario.startsWith('admin-')
      ? adminUser
      : {
          id: 'guardian-user',
          email: 'responsavel@example.com',
          name: 'Ana Ferreira',
          type: 'aluno',
          profile: { name: 'Ana Ferreira' },
        };
    await page.evaluateOnNewDocument((user) => {
      localStorage.setItem('token', 'visual-audit-token');
      localStorage.setItem('user', JSON.stringify(user));
    }, storedUser);
    if (scenario === 'conflict') {
      await page.evaluateOnNewDocument(() => {
        sessionStorage.setItem(
          'pre-registration-draft-v2:internal-student-id',
          JSON.stringify({
            form: { name: 'Nome preservado no rascunho local' },
            step: 'IDENTIFICATION',
            baseVersion: 1,
          })
        );
      });
    }
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
    if (
      pathname === '/api/v1/pre-registration-admin/leads/internal-student-id' &&
      method === 'GET'
    ) {
      void request.respond(json({ success: true, data: adminLead }));
      return;
    }
    if (
      pathname === '/api/v1/pre-registration-admin/leads/internal-student-id/guardian-authorization' &&
      method === 'GET'
    ) {
      void request.respond(json({ success: true, data: adminGuardianAuthorization }));
      return;
    }
    if (pathname === '/api/v1/pre-registration/processes' && method === 'GET') {
      void request.respond(json({ success: true, data: processesForScenario(scenario) }));
      return;
    }
    if (
      pathname.startsWith('/api/v1/pre-registration/processes/') &&
      pathname.endsWith('/session') &&
      method === 'GET'
    ) {
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
            : scenario === 'contact'
              ? session({ currentStep: 'CONTACT' })
              : scenario === 'conflict'
                ? session({ version: 2, identity: { ...session().identity, name: 'Nome atualizado pela academia' } })
                : session();
      void request.respond(json({ success: true, data: payload }));
      return;
    }
    if (pathname === '/api/v1/auth/me' && method === 'GET') {
      const user = scenario.startsWith('admin-')
        ? adminUser
        : {
            id: 'guardian-user',
            email: 'responsavel@example.com',
            name: 'Ana Ferreira',
            type: 'aluno',
          };
      void request.respond(json({ success: true, data: user }));
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

  const diagnostics = await page.evaluate(() => {
    const focusable = Array.from(document.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
    )).filter((element) => {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    const progressButtons = Array.from(
      document.querySelectorAll('ol[aria-label="Progresso do pré-cadastro"] button')
    );
    const processNames = Array.from(
      document.querySelectorAll('main.max-w-4xl > div.grid > button span.text-lg')
    );
    return {
      title: document.querySelector('h1')?.textContent?.trim(),
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      storageKeys: Object.keys(localStorage),
      containsInternalId: document.body.textContent?.includes('internal-student-id') || false,
      focusableCount: focusable.length,
      unnamedProgressButtons: progressButtons.filter(
        (button) => !button.getAttribute('aria-label')?.trim()
      ).length,
      currentProgressButtons: progressButtons.filter(
        (button) => button.getAttribute('aria-current') === 'step'
      ).length,
      clippedProcessNames: processNames.filter(
        (element) => element.scrollWidth > element.clientWidth + 1
      ).length,
      hasConflictResolution: document.body.textContent?.includes('Escolha quais dados devem ser mantidos') || false,
      hasAlternativeContacts:
        Boolean(document.querySelector('#pre-registration-additionalPhone')) &&
        Boolean(document.querySelector('#pre-registration-additionalEmail')),
    };
  });

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
  if (diagnostics.unnamedProgressButtons > 0) {
    throw new Error(`${name}: existem passos sem nome acessível`);
  }
  if (diagnostics.currentProgressButtons > 1) {
    throw new Error(`${name}: mais de um passo está marcado como atual`);
  }
  if (diagnostics.clippedProcessNames > 0) {
    throw new Error(`${name}: nome de processo truncado sem leitura completa`);
  }
  if (scenario === 'conflict' && !diagnostics.hasConflictResolution) {
    throw new Error(`${name}: reconciliação explícita de conflito não foi exibida`);
  }
  if (scenario === 'contact' && !diagnostics.hasAlternativeContacts) {
    throw new Error(`${name}: contatos alternativos não foram exibidos`);
  }
  if (diagnostics.focusableCount > 0) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName || 'BODY');
    if (focused === 'BODY') throw new Error(`${name}: navegação por teclado não moveu o foco`);
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
    { name: 'landing-desktop', route: '/pre-cadastro/token-safe', viewport: { width: 1440, height: 900 }, scenario: 'landing' },
    { name: 'landing-mobile', route: '/pre-cadastro/token-safe', viewport: { width: 390, height: 844 }, scenario: 'landing' },
    { name: 'invalid-link-mobile', route: '/pre-cadastro/invalid-token', viewport: { width: 390, height: 844 }, scenario: 'invalid' },
    { name: 'process-selector-desktop', route: '/pre-cadastro', viewport: { width: 1440, height: 900 }, scenario: 'selector' },
    { name: 'admin-guardian-validation-desktop', route: '/pre-matriculas/internal-student-id', viewport: { width: 1440, height: 900 }, scenario: 'admin-guardian' },
    { name: 'admin-guardian-validation-mobile', route: '/pre-matriculas/internal-student-id', viewport: { width: 390, height: 844 }, scenario: 'admin-guardian' },
    { name: 'guardian-request-mobile', route: '/pre-cadastro', viewport: { width: 390, height: 844 }, scenario: 'pending-guardian' },
    { name: 'guardian-awaiting-approval-mobile', route: '/pre-cadastro', viewport: { width: 390, height: 844 }, scenario: 'awaiting-guardian' },
    { name: 'identification-low-height', route: '/pre-cadastro', viewport: { width: 1366, height: 768 }, scenario: 'identification' },
    { name: 'identification-tablet', route: '/pre-cadastro', viewport: { width: 768, height: 1024 }, scenario: 'identification' },
    { name: 'contact-mobile', route: '/pre-cadastro', viewport: { width: 390, height: 844 }, scenario: 'contact' },
    { name: 'conflict-mobile', route: '/pre-cadastro', viewport: { width: 390, height: 844 }, scenario: 'conflict' },
    { name: 'guardian-mobile', route: '/pre-cadastro', viewport: { width: 390, height: 844 }, scenario: 'guardian' },
    { name: 'privacy-mobile', route: '/pre-cadastro', viewport: { width: 390, height: 844 }, scenario: 'privacy' },
    { name: 'completed-desktop', route: '/pre-cadastro', viewport: { width: 1440, height: 900 }, scenario: 'completed' },
    { name: 'anamnese-handoff-mobile', route: '/pre-cadastro/anamnese', viewport: { width: 390, height: 844 }, scenario: 'optional' },
  ];
  for (const item of scenarios) await capture(browser, item);
  console.log('Issue 271 visual audit completed successfully.');
} finally {
  if (browser) await browser.close();
  if (preview.pid) {
    try {
      process.kill(-preview.pid, 'SIGTERM');
    } catch {
      preview.kill('SIGTERM');
    }
  }
}