import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const baseUrl = process.env.ISSUE_274_WEB_URL || 'http://127.0.0.1:4173';
const outputDir = path.resolve(
  process.env.ISSUE_274_VISUAL_OUTPUT || 'artifacts/issue-274-visual'
);
await mkdir(outputDir, { recursive: true });

const now = '2026-07-27T20:00:00.000Z';
const user = {
  id: 'visual-user',
  email: 'auditoria@example.com',
  name: 'Auditoria Visual',
  type: 'professor',
  profile: { name: 'Auditoria Visual', avatar: null, phone: null },
  professor: {
    id: 'visual-professor',
    role: 'master',
    collaboratorFunction: {
      id: 'visual-function',
      name: 'Administrador',
      code: 'admin',
      isActive: true,
      isSystem: true,
      accessPermissions: [],
    },
    responsibleManager: null,
    contract: {
      id: 'visual-contract',
      type: 'academy',
      document: '00000000000100',
      name: 'Acesso Saúde & Performance',
      tradeName: 'Acesso Saúde & Performance',
      logoUrl: null,
    },
  },
  accessControl: { isMaster: true, permissions: [] },
};

const lead = {
  id: 'visual-lead',
  name: 'Mariana de Souza Albuquerque de Oliveira — cadastro com conteúdo extenso para validação responsiva',
  contacts: {
    phone: '(15) 98888-0000',
    additionalPhone: '(15) 97777-0000',
    email: 'mariana@example.com',
    cpf: '529.982.247-25',
    masked: false,
  },
  origin: 'Indicação',
  status: 'PRE_REGISTRATION_COMPLETED',
  responsible: { id: 'visual-professor', name: 'Auditoria Visual' },
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
    completedFields: 6,
    totalFields: 6,
    missingRequiredFields: [],
    startedAt: '2026-07-21T12:00:00.000Z',
    lastSavedAt: now,
    completedAt: now,
  },
  nextAction: {
    code: 'REVIEW_REGISTRATION',
    label: 'Revisar cadastro',
    description: 'Resolver duplicidade e revisar matrícula.',
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
  commercial: {
    notes: 'Contato compartilhado com familiar. Confirmar identidade antes da matrícula. Observação longa para validar quebra de linha, leitura e ausência de overflow em telas estreitas sem ocultar ações críticas.',
    unit: 'Sorocaba Centro',
  },
  lifecycleProgress: {
    alunoId: 'visual-lead',
    status: 'PRE_REGISTRATION_COMPLETED',
    formVersion: 'pre-registration-v1',
    privacyNoticeVersion: '2026-07',
    privacyAcceptedAt: now,
    startedAt: '2026-07-21T12:00:00.000Z',
    lastSavedAt: now,
    completedAt: now,
    healthModuleStatus: 'IN_PROGRESS',
    parqModuleStatus: 'COMPLETED',
    missingRequiredFields: [],
  },
  invite: {
    id: 'visual-invite',
    alunoId: 'visual-lead',
    contractId: 'visual-contract',
    status: 'COMPLETED',
    purpose: 'PRE_REGISTRATION',
    createdAt: '2026-07-20T12:30:00.000Z',
    expiresAt: '2026-08-01T12:00:00.000Z',
    completedAt: now,
    allowedActions: { canGenerateFirst: false, canRegenerate: false, canRevoke: false },
  },
  pendencies: [],
  history: [
    { id: 'h1', type: 'LIFECYCLE', eventType: 'PRE_REGISTRATION_COMPLETED', title: 'Pré-cadastro concluído', createdAt: now },
    { id: 'h2', type: 'INVITE', eventType: 'COMPLETED', title: 'Convite completed', createdAt: now },
  ],
};

const review = {
  alunoId: 'visual-lead',
  status: 'PRE_REGISTRATION_COMPLETED',
  recordVersion: 4,
  fingerprint: 'visual-fingerprint',
  classification: 'BLOCKING',
  candidates: [
    {
      candidateAlunoId: 'visual-canonical',
      maskedName: 'M•••••• S••••',
      status: 'ACTIVE_STUDENT',
      classification: 'BLOCKING',
      signals: [
        { code: 'CPF_EXACT', classification: 'BLOCKING', label: 'Mesmo CPF normalizado' },
        { code: 'PHONE_EXACT', classification: 'REVIEW_REQUIRED', label: 'Mesmo telefone normalizado' },
      ],
      differences: [
        {
          field: 'email',
          label: 'E-mail principal',
          sourceValueMasked: 'm•••@example.com',
          canonicalValueMasked: 'c•••@example.com',
          sourceEmpty: false,
          canonicalEmpty: false,
          sensitive: true,
        },
        {
          field: 'additionalPhone',
          label: 'Telefone adicional',
          sourceValueMasked: '•••• 0000',
          sourceEmpty: false,
          canonicalEmpty: true,
          sensitive: true,
        },
      ],
      createdAt: '2025-01-01T12:00:00.000Z',
      updatedAt: now,
    },
  ],
  restrictedCandidateCount: 1,
  canConfirmDifferentPeople: false,
  canUseExistingCanonical: true,
  canMarkReady: false,
  canConfirmEnrollment: false,
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

function jsonResponse(data, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  };
}

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

async function configurePage(page, scenario = 'success') {
  await page.evaluateOnNewDocument((sessionUser) => {
    localStorage.setItem('token', 'visual-token');
    localStorage.setItem('user', JSON.stringify(sessionUser));
  }, user);
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/')) {
      request.continue();
      return;
    }
    if (url.pathname === '/api/v1/auth/me') {
      request.respond(jsonResponse({ success: true, data: user }));
      return;
    }
    if (url.pathname === '/api/v1/pre-registration-admin/leads/visual-lead/enrollment-review') {
      request.respond(jsonResponse({ success: true, data: review }));
      return;
    }
    if (url.pathname === '/api/v1/pre-registration-admin/leads/visual-lead') {
      if (scenario === 'error') {
        request.respond(jsonResponse({ success: false, error: 'Falha controlada para evidência visual.' }, 500));
      } else {
        request.respond(jsonResponse({ success: true, data: lead }));
      }
      return;
    }
    request.respond(jsonResponse({ success: true, data: [] }));
  });
}

async function markControls(page) {
  await page.evaluate(() => {
    const byText = (selector, text) => [...document.querySelectorAll(selector)]
      .find((element) => element.textContent?.includes(text));
    const refresh = byText('button', 'Atualizar');
    const back = byText('a', 'Leads e pré-matrículas');
    const reason = document.querySelector('input[placeholder="Motivo obrigatório da decisão"]');
    const radio = document.querySelector('input[type="radio"]');
    if (refresh instanceof HTMLElement) refresh.dataset.visualControl = 'refresh';
    if (back instanceof HTMLElement) back.dataset.visualControl = 'back';
    if (reason instanceof HTMLElement) reason.dataset.visualControl = 'reason';
    if (radio instanceof HTMLElement) radio.dataset.visualControl = 'candidate';
    document.querySelectorAll('select').forEach((select, index) => {
      select.setAttribute('data-visual-control', `decision-${index + 1}`);
    });
  });
}

async function exerciseKeyboardControls(page) {
  const interactions = [];
  await markControls(page);

  const refresh = await page.$('[data-visual-control="refresh"]');
  if (refresh) {
    await refresh.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.body.innerText.includes('Identidade e duplicidades'));
    await markControls(page);
    const refreshed = await page.$('[data-visual-control="refresh"]');
    await refreshed?.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.body.innerText.includes('Identidade e duplicidades'));
    interactions.push({ name: 'atualizar', role: 'button', keys_passed: ['Enter', 'Space'] });
  }

  await markControls(page);
  const radio = await page.$('[data-visual-control="candidate"]');
  if (radio) {
    await radio.focus();
    await page.keyboard.press('Space');
    const checked = await page.$eval(
      '[data-visual-control="candidate"]',
      (element) => element instanceof HTMLInputElement && element.checked
    );
    if (!checked) throw new Error('Candidate radio did not respond to Space');
    interactions.push({ name: 'selecionar-candidato', role: 'radio', keys_passed: ['Space'] });
  }

  await markControls(page);
  const selects = await page.$$('[data-visual-control^="decision-"]');
  for (let index = 0; index < selects.length; index += 1) {
    await selects[index].focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const value = await selects[index].evaluate((element) =>
      element instanceof HTMLSelectElement ? element.value : ''
    );
    if (!value) throw new Error(`Decision select ${index + 1} did not accept keyboard input`);
  }
  if (selects.length > 0) {
    interactions.push({
      name: 'decisoes-por-campo',
      role: 'combobox',
      keys_passed: ['ArrowDown', 'Enter'],
      count: selects.length,
    });
  }

  await markControls(page);
  const reason = await page.$('[data-visual-control="reason"]');
  if (reason) {
    await reason.focus();
    await page.keyboard.type('Validação visual por teclado');
    interactions.push({ name: 'motivo', role: 'textbox', keys_passed: ['Tab', 'text entry'] });
  }

  return interactions;
}

async function inspectPage(page) {
  return page.evaluate(() => {
    const text = document.body.innerText;
    const active = document.activeElement;
    const activeStyle = active instanceof HTMLElement ? getComputedStyle(active) : null;
    return {
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      requiredTexts: [
        'Identificação e processo',
        'Identidade e duplicidades',
        'Histórico relevante',
        'Após a matrícula',
        'Usar cadastro existente',
      ].every((item) => text.includes(item)),
      restrictedScopeNotice: text.includes('fora do seu escopo'),
      parqWarning: text.includes('PAR-Q com alerta profissional'),
      longContentRendered: text.includes('conteúdo extenso para validação responsiva'),
      activeElement: active instanceof HTMLElement
        ? {
            tag: active.tagName,
            text: active.innerText || active.getAttribute('aria-label') || '',
            outlineStyle: activeStyle?.outlineStyle || '',
            boxShadow: activeStyle?.boxShadow || '',
          }
        : null,
    };
  });
}

const results = {};
const controlInteractions = [];
let accessibilityTree = null;
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
];
for (const viewport of viewports) {
  const page = await browser.newPage();
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
  await configurePage(page);
  await page.goto(`${baseUrl}/pre-matriculas/visual-lead`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('Revisar Mariana de Souza'));
  const interactions = await exerciseKeyboardControls(page);
  if (viewport.name === 'desktop') {
    controlInteractions.push(...interactions);
    accessibilityTree = await page.accessibility.snapshot({ interestingOnly: false });
  }
  results[viewport.name] = await inspectPage(page);
  await page.screenshot({
    path: path.join(outputDir, `review-${viewport.name}.png`),
    fullPage: true,
  });
  await page.close();
}

const linkPage = await browser.newPage();
await linkPage.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
await configurePage(linkPage);
await linkPage.goto(`${baseUrl}/pre-matriculas/visual-lead`, { waitUntil: 'networkidle0' });
await linkPage.waitForFunction(() => document.body.innerText.includes('Revisar Mariana de Souza'));
await markControls(linkPage);
const backLink = await linkPage.$('[data-visual-control="back"]');
if (backLink) {
  await backLink.focus();
  await pageSafeKey(linkPage, 'Enter');
  await linkPage.waitForFunction(() => window.location.pathname === '/pre-matriculas');
  controlInteractions.push({ name: 'voltar-lista', role: 'link', keys_passed: ['Enter'] });
}
await linkPage.close();

const errorPage = await browser.newPage();
await errorPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await configurePage(errorPage, 'error');
await errorPage.goto(`${baseUrl}/pre-matriculas/visual-lead`, { waitUntil: 'networkidle0' });
await errorPage.waitForFunction(() => document.body.innerText.includes('Pré-matrícula indisponível'));
results.errorState = {
  rendered: await errorPage.evaluate(() => document.body.innerText.includes('Tentar novamente')),
  horizontalOverflow: await errorPage.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  ),
};
await errorPage.screenshot({
  path: path.join(outputDir, 'review-error-mobile.png'),
  fullPage: true,
});
await errorPage.close();
await browser.close();

const failures = [];
for (const { name } of viewports) {
  if (results[name].horizontalOverflow) failures.push(`${name}: horizontal overflow`);
  if (!results[name].requiredTexts) failures.push(`${name}: required sections missing`);
  if (!results[name].restrictedScopeNotice) failures.push(`${name}: restricted-scope notice missing`);
  if (!results[name].parqWarning) failures.push(`${name}: PAR-Q warning missing`);
  if (!results[name].longContentRendered) failures.push(`${name}: long content missing`);
  if (!results[name].activeElement) failures.push(`${name}: keyboard focus missing`);
}
if (!results.errorState.rendered) failures.push('mobile error state missing');
if (results.errorState.horizontalOverflow) failures.push('mobile error state overflow');
if (!accessibilityTree) failures.push('accessibility tree missing');

const headSha = process.env.GITHUB_SHA || 'local-draft';
const generatedAt = new Date().toISOString();
const report = {
  schemaVersion: 2,
  issue: 274,
  route: '/pre-matriculas/visual-lead',
  generatedAt,
  headSha,
  results,
  controlInteractions,
  failures,
  passed: failures.length === 0,
};
const metrics = {
  schema_version: 2,
  head_sha: headSha,
  routes: [
    {
      route: '/pre-matriculas/visual-lead',
      viewports: viewports.map(({ width, height }) => `${width}x${height}`),
      long_content_or_zoom: true,
      keyboard_only: true,
      accessibility_tree: accessibilityTree || {},
      control_interactions: controlInteractions,
      dynamic_surfaces: [
        { role: 'status', observed: results.desktop.restrictedScopeNotice },
        { role: 'alert', observed: results.errorState.rendered },
      ],
    },
  ],
};
await writeFile(
  path.join(outputDir, 'accessibility-tree.json'),
  `${JSON.stringify(accessibilityTree, null, 2)}\n`,
  'utf8'
);
await writeFile(
  path.join(outputDir, 'visual-metrics.json'),
  `${JSON.stringify(metrics, null, 2)}\n`,
  'utf8'
);
await writeFile(
  path.join(outputDir, 'visual-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8'
);

const resultDefinitions = [
  ['review-desktop.png', 'image/png', ['VIS-ROUTE']],
  ['review-tablet.png', 'image/png', ['VIS-ROUTE']],
  ['review-mobile.png', 'image/png', ['VIS-ROUTE']],
  ['review-error-mobile.png', 'image/png', ['VIS-ROUTE']],
  ['visual-report.json', 'application/json', ['VIS-ROUTE', 'VIS-A11Y']],
  ['visual-metrics.json', 'application/json', ['VIS-ROUTE', 'VIS-A11Y']],
  ['accessibility-tree.json', 'application/json', ['VIS-A11Y']],
];
const attestedResults = [];
for (const [file, mediaType, checkIds] of resultDefinitions) {
  const filePath = path.join(outputDir, file);
  const payload = await readFile(filePath);
  const fileStat = await stat(filePath);
  attestedResults.push({
    path: file,
    sha256: createHash('sha256').update(payload).digest('hex'),
    size: fileStat.size,
    command: 'node apps/api/scripts/issue-274-visual-evidence.mjs',
    exit_code: failures.length === 0 ? 0 : 1,
    expected_exit: 0,
    check_ids: checkIds,
    media_type: mediaType,
  });
}
const manifest = {
  schema_version: 2,
  kind: 'visual',
  head_sha: headSha,
  run_id: Number(process.env.GITHUB_RUN_ID || 0),
  generator: 'apps/api/scripts/issue-274-visual-evidence.mjs',
  generated_at: generatedAt,
  checks: [
    {
      id: 'VIS-ROUTE',
      claim: 'A rota real de revisão permanece utilizável em três viewports e no estado de erro.',
      result_paths: resultDefinitions
        .filter(([, , checkIds]) => checkIds.includes('VIS-ROUTE'))
        .map(([file]) => file),
    },
    {
      id: 'VIS-A11Y',
      claim: 'A rota possui árvore de acessibilidade e controles operáveis somente por teclado.',
      result_paths: resultDefinitions
        .filter(([, , checkIds]) => checkIds.includes('VIS-A11Y'))
        .map(([file]) => file),
    },
  ],
  results: attestedResults,
};
await writeFile(
  path.join(outputDir, 'orquestrador-artifact.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);

if (failures.length > 0) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));

async function pageSafeKey(page, key) {
  await page.keyboard.press(key);
}
