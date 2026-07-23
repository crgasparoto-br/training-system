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
  ...[
    'create',
    'editCommercial',
    'generateInvite',
    'revokeInvite',
    'review',
    'discardReopen',
    'convert',
  ].map((action) => ({
    screenKey: 'students.preRegistration',
    blockKey: `students.preRegistration.${action}`,
    canView: true,
  })),
];

function makeUser(restricted = false) {
  const accessPermissions = restricted
    ? [{ screenKey: 'students.preRegistration', canView: true, dataScope: 'self' }]
    : permissions;
  return {
    id: restricted ? 'user-restricted' : 'user-1',
    email: restricted ? 'consulta@academia.local' : 'gestor@academia.local',
    name: restricted ? 'Consulta Comercial' : 'Gestor da Academia',
    type: 'professor',
    profile: { name: restricted ? 'Consulta Comercial' : 'Gestor da Academia', avatar: null },
    professor: {
      id: restricted ? 'professor-restricted' : 'professor-1',
      role: 'professor',
      collaboratorFunction: {
        id: restricted ? 'function-restricted' : 'function-1',
        name: restricted ? 'Consulta' : 'Gestor',
        code: restricted ? 'intern' : 'manager',
        isActive: true,
        accessPermissions,
      },
      contract: {
        id: 'contract-1',
        type: 'academy',
        document: '00000000000100',
        name: 'Academia Acesso',
        tradeName: 'Acesso Saúde & Performance',
      },
    },
    accessControl: { isMaster: false, permissions: accessPermissions },
  };
}

const fullActions = {
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

const noActions = Object.fromEntries(
  Object.keys(fullActions).map((key) => [key, false])
);

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

function makeLead(index, status = 'INVITED', overrides = {}) {
  const restricted = overrides.restricted === true;
  return {
    id: `lead-${index}`,
    name:
      index === 1
        ? 'Mariana Ferreira dos Santos com um nome propositalmente extenso para validar quebra e truncamento seguro'
        : `Pessoa em acompanhamento ${index}`,
    contacts: restricted
      ? {
          phone: '•••• 1001',
          additionalPhone: '•••• 2001',
          email: 'p•••@exemplo.com',
          additionalEmail: 'c•••@exemplo.com',
          cpf: '•••.•••.•••-01',
          masked: true,
        }
      : {
          phone: `(15) 9999${String(1000 + index)}`,
          additionalPhone: `(15) 9888${String(2000 + index)}`,
          email: `pessoa${index}@exemplo.com`,
          additionalEmail: `contato.alternativo.muito.longo.${index}@exemplo.com.br`,
          cpf: `000.000.00${index}-00`,
          masked: false,
        },
    origin: index % 2 === 0 ? 'Campanha institucional de relacionamento de julho' : 'Indicação',
    status,
    responsible: { id: 'professor-1', name: 'Gestor da Academia com nome extenso' },
    createdAt: '2026-07-20T10:00:00.000Z',
    updatedAt: '2026-07-22T14:35:00.000Z',
    lastActivityAt: '2026-07-22T14:35:00.000Z',
    inviteStatus: status === 'READY_FOR_ENROLLMENT' ? 'COMPLETED' : 'ACTIVE',
    inviteExpiresAt: '2026-08-24T14:35:00.000Z',
    inviteAllowedActions: {
      canGenerateFirst: false,
      canRegenerate: status === 'INVITED',
      canRevoke: status === 'INVITED',
    },
    progress,
    nextAction: {
      code: status === 'READY_FOR_ENROLLMENT' ? 'WAIT_FOR_CONVERSION' : 'REVIEW_PARQ',
      label: status === 'READY_FOR_ENROLLMENT' ? 'Confirmar matrícula' : 'Encaminhar análise profissional',
      description:
        status === 'READY_FOR_ENROLLMENT'
          ? 'O cadastro está pronto para ativação.'
          : 'O PAR-Q contém alerta e deve ser acompanhado pelo profissional.',
      enabled: true,
    },
    allowedActions:
      status === 'READY_FOR_ENROLLMENT'
        ? { ...fullActions, canRegenerateInvite: false, canRevokeInvite: false, canConvert: true }
        : restricted
          ? noActions
          : fullActions,
  };
}

function listPayload(scenario) {
  const items = scenario === 'empty'
    ? []
    : [
        makeLead(1, 'INVITED'),
        makeLead(2, 'PRE_REGISTRATION_IN_PROGRESS'),
        makeLead(3, 'PRE_REGISTRATION_COMPLETED'),
        makeLead(4, 'READY_FOR_ENROLLMENT'),
        ...Array.from({ length: 12 }, (_, index) => makeLead(index + 5, 'INVITED')),
      ];
  return {
    items,
    pagination: {
      page: 1,
      pageSize: 20,
      total: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / 20)),
    },
    filterOptions: {
      origins: ['Campanha institucional de relacionamento de julho', 'Indicação'],
      responsibleProfessors: [
        { id: 'professor-1', name: 'Gestor da Academia com nome extenso' },
        { id: 'professor-2', name: 'Ana Professora' },
      ],
    },
    capabilities: { canSearchCpf: scenario !== 'restricted' },
  };
}

function detailPayload(scenario) {
  const ready = scenario === 'conversion';
  const restricted = scenario === 'restricted';
  const lead = makeLead(1, ready ? 'READY_FOR_ENROLLMENT' : 'INVITED', { restricted });
  return {
    ...lead,
    commercial: restricted
      ? {}
      : {
          notes:
            'Interessada em treinos três vezes por semana no período da manhã. Observação longa para validar leitura, quebra de linha e expansão do conteúdo sem sobrepor os controles da ficha.',
          unit: 'Unidade Centro',
        },
    lifecycleProgress: {
      alunoId: 'lead-1',
      status: lead.status,
      healthModuleStatus: 'COMPLETED',
      parqModuleStatus: 'COMPLETED',
      missingRequiredFields: [],
    },
    invite: ready
      ? undefined
      : {
          id: 'invite-1',
          alunoId: 'lead-1',
          purpose: 'PRE_REGISTRATION',
          status: 'ACTIVE',
          createdAt: '2026-07-22T14:00:00.000Z',
          expiresAt: '2026-08-24T14:35:00.000Z',
          linkRecoverable: false,
          allowedActions: {
            canGenerateFirst: false,
            canRegenerate: !restricted,
            canRevoke: !restricted,
          },
        },
    pendencies: [
      { code: 'parq_professional_review', label: 'Análise profissional do PAR-Q', blocking: false },
    ],
    history: Array.from({ length: 10 }, (_, index) => ({
      id: `history-${index}`,
      type: index % 2 ? 'LIFECYCLE' : 'INVITE',
      eventType: index % 2 ? 'STATUS_CHANGED' : 'ACCESSED',
      title: index % 2 ? 'Etapa administrativa atualizada' : 'Convite acessado',
      description: index === 0 ? 'Registro de histórico com uma descrição operacional mais extensa.' : undefined,
      createdAt: `2026-07-${String(22 - index).padStart(2, '0')}T14:20:00.000Z`,
    })),
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
  const restricted = scenario === 'restricted';
  const mockUser = makeUser(restricted);
  await page.evaluateOnNewDocument((storedUser, clipboardFailure) => {
    localStorage.setItem('token', 'visual-audit-token');
    localStorage.setItem('user', JSON.stringify(storedUser));
    if (clipboardFailure) {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    }
  }, mockUser, scenario === 'clipboard-failure');

  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const requestUrl = new URL(request.url());
    const pathname = requestUrl.pathname;
    const method = request.method();

    if (pathname.endsWith('/api/v1/auth/me')) {
      void request.respond(json({ data: mockUser }));
      return;
    }
    if (pathname === '/api/v1/pre-registration-admin/leads' && method === 'GET') {
      if (scenario === 'error') {
        void request.respond(json({ success: false, error: 'Falha controlada de consulta.' }, 500));
      } else {
        void request.respond(json({ success: true, data: listPayload(scenario) }));
      }
      return;
    }
    if (pathname === '/api/v1/pre-registration-admin/leads/lead-1' && method === 'GET') {
      void request.respond(json({ success: true, data: detailPayload(scenario) }));
      return;
    }
    if (pathname === '/api/v1/pre-registration-admin/leads/lead-1/invites' && method === 'POST') {
      void request.respond(
        json({
          success: true,
          data: {
            invite: detailPayload(scenario).invite,
            url: 'https://app.example.com/pre-cadastro/token-que-deve-continuar-visivel',
          },
        }, 201)
      );
      return;
    }
    void request.continue();
  });
}

async function capture(browser, { route, viewport, name, scenario = 'default', interact }) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await installMocking(page, scenario);
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('h1', { timeout: 20_000 });
  await new Promise((resolve) => setTimeout(resolve, 250));

  if (interact === 'clipboard-failure') {
    const confirmation = await page.$('input[type="checkbox"]');
    if (!confirmation) throw new Error(`${name}: confirmação de regeneração não encontrada`);
    await confirmation.click();
    const buttons = await page.$$('button');
    const generateButton = await Promise.all(
      buttons.map(async (button) => ({
        button,
        text: await page.evaluate((element) => element.textContent || '', button),
      }))
    ).then((items) => items.find((item) => item.text.includes('Gerar novo link'))?.button);
    if (!generateButton) throw new Error(`${name}: ação Gerar novo link não encontrada`);
    await generateButton.click();
    await page.waitForFunction(
      () => document.body.textContent?.includes('A cópia automática não funcionou'),
      { timeout: 10_000 }
    );
  }

  for (let index = 0; index < 6; index += 1) await page.keyboard.press('Tab');
  const focusState = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    text: document.activeElement?.textContent?.trim().slice(0, 80),
  }));
  if (!focusState.tag || focusState.tag === 'BODY') {
    throw new Error(`${name}: navegação por teclado não alcançou controle focável`);
  }

  const overflow = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const offenders = Array.from(document.querySelectorAll('*'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          display: style.display,
          visibility: style.visibility,
          text: (element.textContent || '').trim().slice(0, 100),
        };
      })
      .filter(
        (item) =>
          item.display !== 'none' &&
          item.visibility !== 'hidden' &&
          item.width > 0 &&
          item.height > 0 &&
          item.right > 0 &&
          item.left < viewportWidth &&
          (item.right > viewportWidth + 1 || item.left < -1)
      )
      .sort(
        (a, b) =>
          Math.max(b.right - viewportWidth, -b.left) -
          Math.max(a.right - viewportWidth, -a.left)
      )
      .slice(0, 20);
    return {
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders,
    };
  });
  if (overflow.offenders.length > 0) {
    await page.screenshot({
      path: path.join(outputDir, `${name}-overflow.png`),
      fullPage: true,
    });
    throw new Error(
      `${name}: elementos visíveis ultrapassam a viewport; offenders=${JSON.stringify(overflow.offenders)}`
    );
  }
  if (overflow.scrollWidth > overflow.width + 1) {
    console.log(
      `${name}: largura intrínseca contida (${overflow.scrollWidth}px > ${overflow.width}px), sem elemento visível fora da viewport`
    );
  }
  const unexpectedConsoleErrors = consoleErrors.filter(
    (message) =>
      !(
        scenario === 'error' &&
        message.includes('Failed to load resource') &&
        message.includes('500')
      )
  );
  if (unexpectedConsoleErrors.length) {
    throw new Error(`${name}: erros no navegador: ${unexpectedConsoleErrors.join(' | ')}`);
  }

  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
  await page.close();
}

await mkdir(outputDir, { recursive: true });
const preview = spawn(
  'pnpm',
  ['--filter', '@corrida/web', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'],
  { cwd: repoRoot, stdio: 'inherit', detached: true }
);

let browser;
try {
  await waitForServer(baseUrl);
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const standardRoutes = [
    ['/pre-matriculas', 'lista'],
    ['/pre-matriculas/nova', 'criacao'],
    ['/pre-matriculas/lead-1', 'detalhe'],
    ['/pre-matriculas/lead-1/editar', 'edicao'],
  ];
  const viewports = [
    [{ width: 1440, height: 900, deviceScaleFactor: 1 }, 'desktop'],
    [{ width: 1366, height: 768, deviceScaleFactor: 1 }, 'desktop-baixo'],
    [{ width: 390, height: 844, deviceScaleFactor: 1 }, 'mobile'],
  ];

  for (const [route, screenName] of standardRoutes) {
    for (const [viewport, viewportName] of viewports) {
      await capture(browser, {
        route,
        viewport,
        name: `${screenName}-${viewportName}`,
      });
    }
  }

  await capture(browser, {
    route: '/pre-matriculas',
    viewport: viewports[1][0],
    name: 'lista-vazia-desktop-baixo',
    scenario: 'empty',
  });
  await capture(browser, {
    route: '/pre-matriculas',
    viewport: viewports[1][0],
    name: 'lista-erro-desktop-baixo',
    scenario: 'error',
  });
  await capture(browser, {
    route: '/pre-matriculas/lead-1',
    viewport: viewports[2][0],
    name: 'detalhe-restrito-mobile',
    scenario: 'restricted',
  });
  await capture(browser, {
    route: '/pre-matriculas/lead-1',
    viewport: viewports[1][0],
    name: 'detalhe-clipboard-falha',
    scenario: 'clipboard-failure',
    interact: 'clipboard-failure',
  });
  await capture(browser, {
    route: '/pre-matriculas/lead-1',
    viewport: viewports[1][0],
    name: 'detalhe-conversao',
    scenario: 'conversion',
  });

  console.log(`Auditoria visual concluída: ${outputDir}`);
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
