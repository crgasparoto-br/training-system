const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = process.env.ISSUE318_BASE_URL || 'http://127.0.0.1:4173';
const ORIGIN = new URL(BASE_URL).origin;
const OUTPUT_DIR = process.env.ISSUE318_EVIDENCE_DIR || path.resolve('issue-318-browser-evidence');
const AXE_PATH = require.resolve('axe-core/axe.min.js');
const ROUTE = '/central-do-aluno/aluno-1/montagem-consolidada';
const TOKEN = 'issue-318-browser-evidence-token';
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const capacities = ['resisted', 'flexibility', 'cyclic', 'balance'];
const labels = { resisted: 'Resistido', flexibility: 'Flexibilidade', cyclic: 'Cíclico', balance: 'Equilíbrio' };

function candidates() {
  return capacities.map((capacity, index) => ({
    capacity,
    prescriptionId: `prescription-${capacity}`,
    prescriptionStatus: 'active',
    capacityPrescriptionVersionId: `capacity-version-${capacity}`,
    version: 2,
    versionStatus: 'active',
    eligible: true,
    reasonCode: 'eligible',
    reason: null,
    professorSummary: `Resumo ${labels[capacity]}`,
    sourceRefs: [{
      type: 'physical_assessment',
      id: `assessment-${index}`,
      label: `Avaliação ${index + 1}`,
      assessedAt: '2026-08-08T09:00:00.000Z',
      origin: 'Avaliação Física',
    }],
  }));
}

const workspace = {
  aluno: { id: 'aluno-1', name: 'Maria Atleta' },
  actorProfessor: { id: 'professor-manager', name: 'Gestora Paula' },
  assignedProfessor: { id: 'professor-assigned', name: 'Prof. Bruno' },
  responsibleProfessor: { id: 'professor-responsible', name: 'Prof. Renata' },
  capacityCandidates: candidates(),
  capacityCandidatesError: null,
};

function versionFixture(status, version, conflicts = []) {
  return {
    id: `assembly-version-${version}`,
    assemblyId: 'assembly-1',
    contractId: 'contract-1',
    alunoId: 'aluno-1',
    version,
    status,
    responsibleProfessorId: 'professor-responsible',
    technicalObservation: 'Observação persistida para revisão profissional.',
    professorJustification: 'Justificativa persistida da montagem consolidada.',
    studentInstruction: 'Orientação prática persistida para o aluno.',
    createdByProfessorId: 'professor-manager',
    createdAt: `2026-08-0${Math.min(version, 9)}T10:00:00.000Z`,
    capacityBlocks: workspace.capacityCandidates.map((candidate, index) => ({
      id: `block-${version}-${index}`,
      capacityPrescriptionVersionId: candidate.capacityPrescriptionVersionId,
      capacity: candidate.capacity,
      capacityVersion: candidate.version,
      capacityStatus: 'active',
      position: index,
    })),
    dataRefs: [{
      id: `data-ref-${version}`,
      role: 'assessment',
      sourceType: 'physical_assessment',
      sourceId: 'assessment-base-1',
      label: 'Avaliação física de referência',
      assessedAt: '2026-08-08T09:00:00.000Z',
      origin: 'PRNT',
      sourceVersion: 4,
      responsibleProfessorId: 'professor-responsible',
    }],
    conflicts,
    traceability: {
      capacityCount: 4,
      sourceRefIds: ['assessment-base-1'],
      capacityVersions: workspace.capacityCandidates.map((candidate) => ({
        capacityPrescriptionVersionId: candidate.capacityPrescriptionVersionId,
        capacity: candidate.capacity,
        version: 2,
        status: 'active',
      })),
    },
    canReleaseOperationalWorkout: status === 'approved',
    createsTodayWorkoutDirectly: false,
  };
}

function assemblyFixture(status = 'draft', version = 3, conflicts = []) {
  return {
    id: 'assembly-1', contractId: 'contract-1', alunoId: 'aluno-1', currentVersion: version,
    currentStatus: status, createdByProfessorId: 'professor-manager', updatedByProfessorId: 'professor-manager',
    createdAt: '2026-08-08T10:00:00.000Z', updatedAt: '2026-08-09T10:00:00.000Z',
    latestVersion: versionFixture(status, version, conflicts),
  };
}

const warningConflict = {
  code: 'review-warning', message: 'Revisar origem antes do envio.', severity: 'warning',
  affectedCapacities: ['resisted'], sourceRefIds: ['assessment-base-1'],
};
const criticalConflict = {
  code: 'critical-structured-restriction', message: 'Restrição estruturada ainda ativa para a composição.',
  severity: 'critical', affectedCapacities: ['resisted'], sourceRefIds: ['assessment-base-1'],
};

function scenarioFixture(name) {
  if (name === 'draft') return {
    assembly: assemblyFixture('draft', 3, [warningConflict]),
    conflicts: { version: 3, status: 'draft', conflicts: [warningConflict], hasCritical: false, canUnblock: false, unavailableChecks: [] },
  };
  if (name === 'ready_for_review') return {
    assembly: assemblyFixture('ready_for_review', 4, []),
    conflicts: { version: 4, status: 'ready_for_review', conflicts: [], hasCritical: false, canUnblock: false, unavailableChecks: [] },
  };
  if (name === 'blocked') return {
    assembly: assemblyFixture('blocked', 5, [warningConflict, criticalConflict]),
    conflicts: { version: 5, status: 'blocked', conflicts: [warningConflict, criticalConflict], hasCritical: true, canUnblock: false, unavailableChecks: [] },
  };
  if (name === 'approved') return {
    assembly: assemblyFixture('approved', 6, []),
    conflicts: { version: 6, status: 'approved', conflicts: [], hasCritical: false, canUnblock: false, unavailableChecks: [] },
  };
  throw new Error(`Cenário desconhecido: ${name}`);
}

const masterUser = {
  id: 'user-professor-manager', email: 'manager@teste.com', name: 'Gestora Paula', type: 'professor',
  profile: { name: 'Gestora Paula' },
  professor: {
    id: 'professor-manager', role: 'master',
    collaboratorFunction: { id: 'function-1', code: 'master', name: 'Master', isActive: true },
    contract: { id: 'contract-1', type: 'academy', document: '00000000000000', name: 'Academia Teste', tradeName: 'Academia Teste' },
  },
  accessControl: { isMaster: true, permissions: [] },
};

function historyFixture(current) {
  return {
    assembly: {
      id: current.id, contractId: current.contractId, alunoId: current.alunoId,
      currentVersion: current.currentVersion, currentStatus: current.currentStatus,
      createdByProfessorId: current.createdByProfessorId, updatedByProfessorId: current.updatedByProfessorId,
      createdAt: current.createdAt, updatedAt: current.updatedAt,
    },
    versions: [versionFixture('draft', 1), versionFixture('approved', 2), current.latestVersion],
    auditEvents: [],
  };
}

function storageState() {
  return {
    cookies: [],
    origins: [{ origin: ORIGIN, localStorage: [
      { name: 'token', value: TOKEN },
      { name: 'user', value: JSON.stringify(masterUser) },
    ] }],
  };
}

async function waitForServer() {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(BASE_URL, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error(`Servidor não respondeu em ${BASE_URL}`);
}

async function createScenarioPage(browser, scenario, label, viewport, options = {}) {
  const fixture = scenarioFixture(scenario);
  const context = await browser.newContext({ viewport, storageState: storageState() });
  const diagnostics = { pageErrors: [], consoleErrors: [], requestFailures: [], unexpectedApiRequests: [] };
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();
    const fulfill = (data, status = 200) => route.fulfill({
      status, contentType: 'application/json',
      body: JSON.stringify(status >= 400 ? data : { success: true, data }),
    });

    if (method === 'GET' && pathname === '/api/v1/auth/me') return fulfill(masterUser);
    if (method === 'GET' && pathname === '/api/v1/consolidated-prescriptions/alunos/aluno-1/workspace') return fulfill(workspace);
    if (method === 'GET' && pathname === '/api/v1/consolidated-prescriptions/alunos/aluno-1/conflicts') return fulfill(fixture.conflicts);
    if (method === 'GET' && pathname === '/api/v1/consolidated-prescriptions/alunos/aluno-1/history') return fulfill(historyFixture(fixture.assembly));
    if (method === 'GET' && pathname === '/api/v1/consolidated-prescriptions/alunos/aluno-1') return fulfill(fixture.assembly);
    if (options.forceConflict409 && method === 'PATCH' && pathname === '/api/v1/consolidated-prescriptions/alunos/aluno-1/composition') {
      return fulfill({ error: 'A montagem foi alterada por outro usuário' }, 409);
    }

    diagnostics.unexpectedApiRequests.push(`${method} ${pathname}`);
    return fulfill({ error: `Unexpected browser evidence API request: ${method} ${pathname}` }, 501);
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()); });
  page.on('requestfailed', (request) => diagnostics.requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'unknown'}`));
  await page.goto(`${BASE_URL}${ROUTE}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.getByRole('heading', { name: 'Montagem Consolidada da Prescrição' }).waitFor({ state: 'visible', timeout: 10000 });
  assert.deepEqual(diagnostics.unexpectedApiRequests, [], `${label}: chamadas de API inesperadas`);
  return { context, page, diagnostics };
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({ viewportWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(metrics.scrollWidth <= metrics.viewportWidth + 1, `${label}: overflow horizontal (${metrics.scrollWidth} > ${metrics.viewportWidth})`);
}

async function scanA11y(page, label) {
  await page.addScriptTag({ path: AXE_PATH });
  const result = await page.evaluate(async () => {
    const root = document.querySelector('main') || document.body;
    return window.axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
  });
  fs.writeFileSync(path.join(OUTPUT_DIR, `${label}-axe.json`), JSON.stringify({ violations: result.violations, passes: result.passes.map((item) => item.id) }, null, 2));
  assert.equal(result.violations.length, 0, `${label}: axe encontrou ${result.violations.length} violações: ${result.violations.map((item) => item.id).join(', ')}`);
}

async function saveAriaSnapshot(page, label) {
  const target = page.locator('main').first();
  const snapshot = await target.ariaSnapshot();
  fs.writeFileSync(path.join(OUTPUT_DIR, `${label}-aria.yml`), snapshot);
  assert.match(snapshot, /Montagem Consolidada da Prescrição/);
  assert.match(snapshot, /1\. Dados gerais/);
  assert.match(snapshot, /8\. Histórico de versões/);
}

async function keyboardOpenAccordion(page, name) {
  const trigger = page.getByRole('button', { name });
  await trigger.focus();
  if ((await trigger.getAttribute('aria-expanded')) === 'false') {
    await page.keyboard.press('Enter');
  }
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
}

async function verifyScenario(browser, scenario, deviceLabel, viewport) {
  const label = `${deviceLabel}-${scenario}`;
  const { context, page, diagnostics } = await createScenarioPage(browser, scenario, label, viewport);
  try {
    const expectedStatus = { draft: 'Rascunho', ready_for_review: 'Pronta para revisão', blocked: 'Bloqueada', approved: 'Aprovada' }[scenario];
    await page.getByText(expectedStatus, { exact: true }).first().waitFor();
    await page.getByText('Prof. Renata', { exact: true }).first().waitFor();
    await assertNoHorizontalOverflow(page, label);

    if (scenario === 'blocked') {
      await keyboardOpenAccordion(page, '4. Alertas e conflitos');
      await page.getByText('Atenção', { exact: true }).waitFor();
      await page.getByText('Bloqueador crítico', { exact: true }).waitFor();
      const styles = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('p')];
        const warning = nodes.find((node) => node.textContent === 'Atenção')?.closest('.rounded-lg.border');
        const critical = nodes.find((node) => node.textContent === 'Bloqueador crítico')?.closest('.rounded-lg.border');
        if (!warning || !critical) return null;
        return {
          warningBackground: getComputedStyle(warning).backgroundColor,
          criticalBackground: getComputedStyle(critical).backgroundColor,
          warningBorder: getComputedStyle(warning).borderColor,
          criticalBorder: getComputedStyle(critical).borderColor,
        };
      });
      assert.ok(styles);
      assert.notEqual(styles.warningBackground, styles.criticalBackground);
      assert.notEqual(styles.warningBorder, styles.criticalBorder);
    } else if (scenario === 'approved') {
      await keyboardOpenAccordion(page, '8. Histórico de versões');
      const summary = page.locator('summary').filter({ hasText: 'Versão 2' }).first();
      const item = summary.locator('xpath=..');
      await summary.focus();
      await page.keyboard.press('Enter');
      assert.notEqual(await item.getAttribute('open'), null, `${label}: histórico não abriu via teclado`);
      await item.getByText(/Somente leitura — versões históricas nunca são editadas/).waitFor();
    } else {
      await keyboardOpenAccordion(page, '7. Revisão e validação final');
      if (scenario === 'ready_for_review') await page.getByRole('button', { name: 'Aprovar montagem' }).waitFor();
    }

    await scanA11y(page, label);
    await saveAriaSnapshot(page, label);
    await page.screenshot({ path: path.join(OUTPUT_DIR, `${label}.png`), fullPage: true });
    assert.deepEqual(diagnostics.pageErrors, [], `${label}: erros JavaScript: ${diagnostics.pageErrors.join(' | ')}`);
  } finally { await context.close(); }
}

async function verifyConcurrency409(browser) {
  const label = 'desktop-concurrency-409';
  const { context, page, diagnostics } = await createScenarioPage(browser, 'draft', label, { width: 1440, height: 1000 }, { forceConflict409: true });
  try {
    await keyboardOpenAccordion(page, '5. Composição e ordem técnica');
    const observation = page.getByLabel('Observação técnica interna');
    await observation.fill('Alteração local preservada no navegador real');
    await keyboardOpenAccordion(page, '7. Revisão e validação final');
    await page.getByRole('button', { name: 'Salvar rascunho' }).click();
    await page.getByText('Conflito de versão detectado', { exact: true }).waitFor();
    await keyboardOpenAccordion(page, '5. Composição e ordem técnica');
    assert.equal(await observation.inputValue(), 'Alteração local preservada no navegador real');
    assert.deepEqual(diagnostics.unexpectedApiRequests, []);
    assert.deepEqual(diagnostics.pageErrors, []);
    await page.screenshot({ path: path.join(OUTPUT_DIR, `${label}.png`), fullPage: true });
  } finally { await context.close(); }
}

async function verifyTextZoom(browser) {
  const label = 'desktop-text-zoom-200-draft';
  const { context, page } = await createScenarioPage(browser, 'draft', label, { width: 1366, height: 768 });
  try {
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
    await assertNoHorizontalOverflow(page, label);
    await keyboardOpenAccordion(page, '7. Revisão e validação final');
    await scanA11y(page, label);
    await page.screenshot({ path: path.join(OUTPUT_DIR, `${label}.png`), fullPage: true });
  } finally { await context.close(); }
}

async function verifyDarkLoginContrast(browser) {
  const label = 'dark-login-contrast';
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.locator('a.text-primary').first().waitFor();
    await scanA11y(page, label);
    const contrast = await page.evaluate(() => {
      const link = document.querySelector('a.text-primary');
      if (!link) return null;
      const parseColor = (value) => {
        const channels = (value.match(/[\d.]+/g) || []).map(Number);
        return {
          rgb: channels.slice(0, 3),
          alpha: channels.length > 3 ? channels[3] : 1,
        };
      };
      const luminance = (rgb) => {
        const values = rgb.map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
      };
      const foreground = parseColor(getComputedStyle(link).color).rgb;
      let background = null;
      for (let node = link.parentElement; node; node = node.parentElement) {
        const parsed = parseColor(getComputedStyle(node).backgroundColor);
        if (parsed.rgb.length === 3 && parsed.alpha >= 0.99) {
          background = parsed.rgb;
          break;
        }
      }
      if (!background) background = parseColor(getComputedStyle(document.body).backgroundColor).rgb;
      const l1 = luminance(foreground);
      const l2 = luminance(background);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    });
    assert.ok(contrast && contrast >= 4.5, `${label}: contraste text-primary = ${contrast}`);
    await page.screenshot({ path: path.join(OUTPUT_DIR, `${label}.png`), fullPage: true });
  } finally { await context.close(); }
}

async function main() {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const scenarios = ['draft', 'ready_for_review', 'blocked', 'approved'];
    const viewports = [
      ['desktop', { width: 1440, height: 1000 }],
      ['desktop-low-height', { width: 1366, height: 768 }],
      ['mobile', { width: 390, height: 844 }],
    ];
    for (const [deviceLabel, viewport] of viewports) {
      for (const scenario of scenarios) await verifyScenario(browser, scenario, deviceLabel, viewport);
    }
    await verifyConcurrency409(browser);
    await verifyTextZoom(browser);
    await verifyDarkLoginContrast(browser);

    const summary = {
      issue: 318,
      route: ROUTE,
      generatedAt: new Date().toISOString(),
      candidateSha: process.env.ISSUE318_HEAD_SHA || process.env.GITHUB_SHA || null,
      assertions: {
        responsiveViewports: ['1440x1000', '1366x768', '390x844'],
        states: ['draft', 'ready_for_review', 'blocked', 'approved', 'concurrency-409'],
        authoritativeWorkspace: 'The browser only accepts the consolidated-prescriptions workspace endpoint for student context and capacity eligibility; generic /alunos and /capacity-prescriptions calls fail the harness.',
        keyboard: 'Accordion sections and historical details are activated from focused controls with Enter.',
        accessibility: 'axe-core WCAG A/AA scans plus Chromium ARIA snapshots are produced for each state.',
        textZoom: 'Root font-size is doubled in a 1366x768 viewport and checked for horizontal overflow and axe violations.',
        darkMode: 'The login text-primary link is checked in dark mode against its nearest opaque rendered surface with an explicit contrast ratio >= 4.5 plus axe.',
        warningVsCritical: 'Text labels and computed background/border styles are asserted as distinct.',
        history: 'A historical version is opened by keyboard and its read-only copy is asserted.',
        concurrency: 'HTTP 409 is injected at the API boundary and local textarea content must remain intact.',
      },
      limitation: 'Automated ARIA-tree evidence is not a native NVDA, VoiceOver, or Orca session. A native screen-reader pass remains a separate manual acceptance item.',
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(`Issue #318 browser evidence generated at ${OUTPUT_DIR}`);
  } finally { await browser.close(); }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
