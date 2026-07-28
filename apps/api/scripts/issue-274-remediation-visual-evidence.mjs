import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const baseUrl = process.env.ISSUE_274_WEB_URL || 'http://127.0.0.1:4173';
const outputDir = path.resolve(
  process.env.ISSUE_274_REMEDIATION_OUTPUT || 'artifacts/issue-274-remediation-visual'
);
const headSha = process.env.ISSUE_274_HEAD_SHA || process.env.GITHUB_SHA || 'unknown';
await mkdir(outputDir, { recursive: true });

const user = {
  id: 'issue-274-remediation-user',
  email: 'remediation@example.com',
  name: 'Auditoria Remediação',
  type: 'professor',
  profile: { name: 'Auditoria Remediação', avatar: null, phone: null },
  professor: {
    id: 'issue-274-remediation-professor',
    role: 'master',
    collaboratorFunction: {
      id: 'issue-274-remediation-function',
      name: 'Administrador',
      code: 'admin',
      isActive: true,
      isSystem: true,
      accessPermissions: [],
    },
    responsibleManager: null,
    contract: {
      id: 'issue-274-remediation-contract',
      type: 'academy',
      document: '00000000000100',
      name: 'Acesso Saúde & Performance',
      tradeName: 'Acesso Saúde & Performance',
      logoUrl: null,
    },
  },
  accessControl: { isMaster: true, permissions: [] },
};

const now = '2026-07-28T11:00:00.000Z';

function lead(status, pendencies = []) {
  return {
    id: 'visual-lead',
    name: 'Mariana de Souza Albuquerque de Oliveira',
    contacts: {
      phone: '(15) 98888-0000',
      additionalPhone: undefined,
      email: 'mariana@example.com',
      additionalEmail: undefined,
      cpf: '529.982.247-25',
      masked: false,
    },
    origin: 'Indicação',
    status,
    responsible: { id: user.professor.id, name: user.name },
    createdAt: '2026-07-20T12:00:00.000Z',
    updatedAt: now,
    lastActivityAt: now,
    inviteStatus: 'COMPLETED',
    inviteExpiresAt: '2026-08-01T12:00:00.000Z',
    inviteAllowedActions: { canGenerateFirst: false, canRegenerate: false, canRevoke: false },
    progress: {
      basicRegistration: 'COMPLETED',
      healthModuleStatus: 'IN_PROGRESS',
      parqModuleStatus: 'COMPLETED',
      parqRequiresProfessionalReview: true,
      completedFields: pendencies.filter((item) => item.blocking).length ? 4 : 6,
      totalFields: 6,
      missingRequiredFields: pendencies.filter((item) => item.blocking).map((item) => item.code),
      startedAt: '2026-07-21T12:00:00.000Z',
      lastSavedAt: now,
      completedAt: now,
    },
    nextAction: {
      code: status === 'READY_FOR_ENROLLMENT' ? 'WAIT_FOR_CONVERSION' : 'REVIEW_REGISTRATION',
      label: status === 'READY_FOR_ENROLLMENT' ? 'Confirmar matrícula' : 'Revisar cadastro',
      description: 'Concluir o processo de matrícula.',
      enabled: true,
    },
    allowedActions: {
      canEditCommercialData: true,
      canGenerateInvite: false,
      canRegenerateInvite: false,
      canRevokeInvite: false,
      canReview: true,
      canValidateGuardianAuthorization: true,
      canDiscard: true,
      canReopen: false,
      canConvert: true,
      canOpenStudentCentral: true,
    },
    commercial: { notes: 'Contato confirmado.', unit: 'Sorocaba Centro' },
    lifecycleProgress: {
      alunoId: 'visual-lead',
      status,
      formVersion: 'pre-registration-v1',
      privacyNoticeVersion: '2026-07',
      privacyAcceptedAt: now,
      startedAt: '2026-07-21T12:00:00.000Z',
      lastSavedAt: now,
      completedAt: now,
      healthModuleStatus: 'IN_PROGRESS',
      parqModuleStatus: 'COMPLETED',
      missingRequiredFields: pendencies.filter((item) => item.blocking).map((item) => item.code),
    },
    invite: {
      id: 'visual-invite',
      alunoId: 'visual-lead',
      contractId: user.professor.contract.id,
      status: 'COMPLETED',
      purpose: 'PRE_REGISTRATION',
      createdAt: '2026-07-20T12:30:00.000Z',
      expiresAt: '2026-08-01T12:00:00.000Z',
      completedAt: now,
      allowedActions: { canGenerateFirst: false, canRegenerate: false, canRevoke: false },
    },
    pendencies,
    history: [
      {
        id: 'history-1',
        type: 'LIFECYCLE',
        eventType: 'PRE_REGISTRATION_COMPLETED',
        title: 'Pré-cadastro concluído',
        createdAt: now,
      },
    ],
  };
}

function review(status, options = {}) {
  const canMarkReady = options.canMarkReady ?? status === 'PRE_REGISTRATION_COMPLETED';
  const canConfirmEnrollment = options.canConfirmEnrollment ?? status === 'READY_FOR_ENROLLMENT';
  return {
    alunoId: 'visual-lead',
    status,
    recordVersion: 8,
    fingerprint: 'issue-274-remediation-fingerprint',
    classification: 'NONE',
    candidates: [],
    restrictedCandidateCount: 0,
    canConfirmDifferentPeople: false,
    canUseExistingCanonical: false,
    canMarkReady,
    canConfirmEnrollment,
    health: {
      healthModuleStatus: 'IN_PROGRESS',
      parqModuleStatus: 'COMPLETED',
      parqRequiresProfessionalReview: true,
    },
    downstream: {
      contract: 'NOT_CONFIGURED',
      plan: 'NOT_CONFIGURED',
      billing: 'NOT_CONFIGURED',
      responsibleProfessor: 'NOT_CONFIGURED',
      schedule: 'NOT_CONFIGURED',
    },
  };
}

function jsonResponse(data, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(data) };
}

const scenarios = [
  {
    name: 'pending-fields',
    viewport: { width: 390, height: 844 },
    lead: lead('PRE_REGISTRATION_COMPLETED', [
      { code: 'name', label: 'Nome completo', blocking: true },
      { code: 'privacyAcceptedAt', label: 'Aceite de privacidade', blocking: true },
      { code: 'parq_professional_review', label: 'Análise profissional do PAR-Q', blocking: false },
    ]),
    review: review('PRE_REGISTRATION_COMPLETED', { canMarkReady: false }),
    assertions: ['Pendências para matrícula', 'Bloqueante', 'Informativa', 'Abrir edição administrativa'],
  },
  {
    name: 'clean-review',
    viewport: { width: 1440, height: 900 },
    lead: lead('PRE_REGISTRATION_COMPLETED'),
    review: review('PRE_REGISTRATION_COMPLETED'),
    assertions: ['Nenhuma duplicidade exige decisão', 'Marcar como pronto para matrícula'],
  },
  {
    name: 'ready-confirmation',
    viewport: { width: 390, height: 844 },
    lead: lead('READY_FOR_ENROLLMENT'),
    review: review('READY_FOR_ENROLLMENT'),
    assertions: ['Confirmar matrícula', 'Confirmo a ativação deste mesmo registro canônico'],
    exerciseConfirmation: true,
  },
  {
    name: 'safe-concurrency-error',
    viewport: { width: 390, height: 844 },
    leadError: {
      status: 409,
      body: {
        success: false,
        code: 'CONCURRENT_MODIFICATION',
        error: 'Os dados foram alterados por outra operação. Recarregue e refaça a revisão antes de continuar.',
      },
    },
    assertions: ['Os dados foram alterados por outra operação', 'Tentar novamente'],
    forbiddenText: ['P2034', 'Prisma', 'could not serialize access'],
  },
];

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const results = [];

for (const scenario of scenarios) {
  const page = await browser.newPage();
  await page.setViewport(scenario.viewport);
  await page.evaluateOnNewDocument((sessionUser) => {
    localStorage.setItem('token', 'issue-274-remediation-token');
    localStorage.setItem('user', JSON.stringify(sessionUser));
  }, user);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/')) {
      request.continue();
      return;
    }
    if (url.pathname === '/api/v1/auth/me') {
      request.respond(jsonResponse({ success: true, data: user }));
      return;
    }
    if (url.pathname === '/api/v1/pre-registration-admin/leads/visual-lead') {
      if (scenario.leadError) {
        request.respond(jsonResponse(scenario.leadError.body, scenario.leadError.status));
      } else {
        request.respond(jsonResponse({ success: true, data: scenario.lead }));
      }
      return;
    }
    if (url.pathname === '/api/v1/pre-registration-admin/leads/visual-lead/enrollment-review') {
      request.respond(jsonResponse({ success: true, data: scenario.review }));
      return;
    }
    request.respond(jsonResponse({ success: true, data: [] }));
  });

  await page.goto(`${baseUrl}/pre-matriculas/visual-lead`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(
    (expected) => expected.every((text) => document.body.innerText.includes(text)),
    {},
    scenario.assertions
  );

  if (scenario.exerciseConfirmation) {
    const checkbox = await page.$('input[type="checkbox"]');
    if (!checkbox) throw new Error('Checkbox de confirmação não encontrado.');
    await checkbox.click();
    const enabled = await page.$eval('button', () => {
      const candidates = [...document.querySelectorAll('button')];
      const confirmation = candidates.find((item) => item.textContent?.includes('Confirmar matrícula'));
      return Boolean(confirmation && !confirmation.hasAttribute('disabled'));
    });
    if (!enabled) throw new Error('A confirmação explícita não habilitou a ação final.');
  }

  const bodyText = await page.evaluate(() => document.body.innerText);
  for (const forbidden of scenario.forbiddenText ?? []) {
    if (bodyText.includes(forbidden)) {
      throw new Error(`Texto interno exposto no cenário ${scenario.name}: ${forbidden}`);
    }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error(`Overflow horizontal no cenário ${scenario.name}.`);

  const screenshotPath = path.join(outputDir, `${scenario.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  results.push({
    scenario: scenario.name,
    route: '/pre-matriculas/visual-lead',
    viewport: scenario.viewport,
    assertions: scenario.assertions,
    screenshot: path.basename(screenshotPath),
    horizontalOverflow: false,
  });
  await page.close();
}

await browser.close();

for (const result of results) {
  const content = await readFile(path.join(outputDir, result.screenshot));
  result.sha256 = createHash('sha256').update(content).digest('hex');
}

await writeFile(
  path.join(outputDir, 'remediation-visual-report.json'),
  `${JSON.stringify({ schemaVersion: 1, issue: 274, headSha, results }, null, 2)}\n`
);
console.log(JSON.stringify({ issue: 274, headSha, scenarios: results.length }, null, 2));
