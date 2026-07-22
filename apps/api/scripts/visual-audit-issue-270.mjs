import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outputDir = path.join(repoRoot, 'artifacts', 'issue-270-visual');
const baseUrl = 'http://127.0.0.1:4173';

const permissions = [
  { screenKey: 'students.preRegistration', canView: true, dataScope: 'contract' },
  { screenKey: 'students.preRegistration', blockKey: 'students.preRegistration.create', canView: true },
  { screenKey: 'students.preRegistration', blockKey: 'students.preRegistration.editCommercial', canView: true },
  { screenKey: 'students.preRegistration', blockKey: 'students.preRegistration.generateInvite', canView: true },
  { screenKey: 'students.preRegistration', blockKey: 'students.preRegistration.revokeInvite', canView: true },
  { screenKey: 'students.preRegistration', blockKey: 'students.preRegistration.review', canView: true },
  { screenKey: 'students.preRegistration', blockKey: 'students.preRegistration.discardReopen', canView: true },
  { screenKey: 'students.preRegistration', blockKey: 'students.preRegistration.convert', canView: true },
];

const user = {
  id: 'user-1',
  email: 'gestor@academia.local',
  name: 'Gestor da Academia',
  type: 'professor',
  profile: { name: 'Gestor da Academia', avatar: null },
  professor: {
    id: 'professor-1',
    role: 'master',
    collaboratorFunction: {
      id: 'function-1',
      name: 'Gestor',
      code: 'manager',
      isActive: true,
      accessPermissions: permissions,
    },
    contract: {
      id: 'contract-1',
      type: 'academy',
      document: '00000000000100',
      name: 'Academia Acesso',
      tradeName: 'Acesso Saúde & Performance',
    },
  },
  accessControl: { isMaster: true, permissions },
};

const actionSet = {
  canEditCommercialData: true,
  canGenerateInvite: false,
  canRegenerateInvite: true,
  canRevokeInvite: true,
  canReview: false,
  canDiscard: true,
  canReopen: false,
  canConvert: false,
  canOpenStudentCentral: false,
};

const progress = {
  basicRegistration: 'COMPLETED',
  healthModuleStatus: 'COMPLETED',
  parqModuleStatus: 'COMPLETED',
  parqRequiresProfessionalReview: true,
  completedFields: 5,
  totalFields: 5,
  missingRequiredFields: [],
  startedAt: '2026-07-21T12:00:00.000Z',
  lastSavedAt: '2026-07-22T14:35:00.000Z',
  completedAt: '2026-07-22T14:35:00.000Z',
};

function makeLead(index, status = 'INVITED') {
  return {
    id: `lead-${index}`,
    name: index === 1 ? 'Mariana Ferreira dos Santos' : `Pessoa em acompanhamento ${index}`,
    contacts: {
      phone: `(15) 9999${String(1000 + index)}`,
      email: `pessoa${index}@exemplo.com`,
      cpf: `000.000.00${index}-00`,
      masked: false,
    },
    origin: index % 2 === 0 ? 'Campanha de julho' : 'Indicação',
    status,
    responsible: { id: 'professor-1', name: 'Gestor da Academia' },
    createdAt: '2026-07-20T10:00:00.000Z',
    updatedAt: '2026-07-22T14:35:00.000Z',
    lastActivityAt: '2026-07-22T14:35:00.000Z',
    inviteStatus: 'ACTIVE',
    inviteExpiresAt: '2026-07-24T14:35:00.000Z',
    inviteAllowedActions: {
      canGenerateFirst: false,
      canRegenerate: true,
      canRevoke: true,
    },
    progress,
    nextAction: {
      code: 'REVIEW_PARQ',
      label: 'Encaminhar análise profissional',
      description: 'O PAR-Q contém alerta e deve ser acompanhado pelo profissional.',
      enabled: true,
    },
    allowedActions: actionSet,
  };
}

const listPayload = {
  items: [
    makeLead(1, 'INVITED'),
    makeLead(2, 'PRE_REGISTRATION_IN_PROGRESS'),
    makeLead(3, 'PRE_REGISTRATION_COMPLETED'),
    makeLead(4, 'READY_FOR_ENROLLMENT'),
  ],
  pagination: { page: 1, pageSize: 20, total: 4, totalPages: 1 },
  filterOptions: {
    origins: ['Campanha de julho', 'Indicação'],
    responsibleProfessors: [
      { id: 'professor-1', name: 'Gestor da Academia' },
      { id: 'professor-2', name: 'Ana Professora' },
    ],
  },
};

const detailPayload = {
  ...makeLead(1, 'INVITED'),
  commercial: {
    notes: 'Interessada em treinos três vezes por semana no período da manhã.',
    unit: 'Unidade Centro',
  },
  lifecycleProgress: {
    alunoId: 'lead-1',
    status: 'INVITED',
    healthModuleStatus: 'COMPLETED',
    parqModuleStatus: 'COMPLETED',
    missingRequiredFields: [],
  },
  invite: {
    id: 'invite-1',
    alunoId: 'lead-1',
    purpose: 'PRE_REGISTRATION',
    status: 'ACTIVE',
    createdAt: '2026-07-22T14:00:00.000Z',
    expiresAt: '2026-07-24T14:35:00.000Z',
    linkRecoverable: false,
    allowedActions: {
      canGenerateFirst: false,
      canRegenerate: true,
      canRevoke: true,
    },
  },
  pendencies: [
    { code: 'parq_professional_review', label: 'Análise profissional do PAR-Q', blocking: false },
  ],
  history: [
    {
      id: 'history-1',
      type: 'INVITE',
      eventType: 'ACCESSED',
      title: 'Convite acessado',
      createdAt: '2026-07-22T14:20:00.000Z',
    },
    {
      id: 'history-2',
      type: 'LIFECYCLE',
      eventType: 'LEAD_CREATED',
      title: 'Lead criado',
      createdAt: '2026-07-20T10:00:00.000Z',
    },
  ],
};

function json(data, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  };
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

async function installMocking(page) {
  await page.evaluateOnNewDocument((mockUser) => {
    localStorage.setItem('token', 'visual-audit-token');
    localStorage.setItem('user', JSON.stringify(mockUser));
  }, user);

  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const requestUrl = new URL(request.url());
    const pathname = requestUrl.pathname;
    const method = request.method();

    if (pathname.endsWith('/api/v1/auth/me')) {
      request.respond(json({ data: user }));
      return;
    }
    if (pathname === '/api/v1/pre-registration-admin/leads' && method === 'GET') {
      request.respond(json({ success: true, data: listPayload }));
      return;
    }
    if (pathname === '/api/v1/pre-registration-admin/leads/lead-1' && method === 'GET') {
      request.respond(json({ success: true, data: detailPayload }));
      return;
    }
    request.continue();
  });
}

async function capture(browser, route, viewport, name) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await installMocking(page);
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('h1', { timeout: 20_000 });
  await new Promise((resolve) => setTimeout(resolve, 300));

  const overflow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (overflow.scrollWidth > overflow.width + 1) {
    throw new Error(
      `${name}: overflow horizontal da página (${overflow.scrollWidth}px > ${overflow.width}px)`
    );
  }
  if (consoleErrors.length) {
    throw new Error(`${name}: erros no navegador: ${consoleErrors.join(' | ')}`);
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
  ['--filter', '@corrida/web', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'],
  { cwd: repoRoot, stdio: 'inherit' }
);

let browser;
try {
  await waitForServer(baseUrl);
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const screens = [
    ['/pre-matriculas', 'lista'],
    ['/pre-matriculas/nova', 'criacao'],
    ['/pre-matriculas/lead-1', 'detalhe'],
    ['/pre-matriculas/lead-1/editar', 'edicao'],
  ];
  const viewports = [
    [{ width: 1440, height: 900, deviceScaleFactor: 1 }, 'desktop'],
    [{ width: 390, height: 844, deviceScaleFactor: 1 }, 'mobile'],
  ];

  for (const [route, screenName] of screens) {
    for (const [viewport, viewportName] of viewports) {
      await capture(browser, route, viewport, `${screenName}-${viewportName}`);
    }
  }

  console.log(`Capturas salvas em ${outputDir}`);
} finally {
  if (browser) await browser.close();
  preview.kill('SIGTERM');
}
