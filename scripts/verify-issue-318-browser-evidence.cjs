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

const capacityTypes = ['resisted', 'flexibility', 'cyclic', 'balance'];
const capacityLabels = {
  resisted: 'Resistido',
  flexibility: 'Flexibilidade',
  cyclic: 'Cíclico',
  balance: 'Equilíbrio',
};

function capacityFixture(capacity, index) {
  return {
    id: `prescription-${capacity}`,
    contractId: 'contract-1',
    alunoId: 'aluno-1',
    capacity,
    status: 'active',
    currentVersion: 2,
    createdByProfessorId: 'professor-1',
    updatedByProfessorId: 'professor-1',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-09T10:00:00.000Z',
    publishesTodayWorkout: false,
    latestVersion: {
      id: `capacity-version-${capacity}`,
      prescriptionId: `prescription-${capacity}`,
      contractId: 'contract-1',
      alunoId: 'aluno-1',
      capacity,
      status: 'active',
      version: 2,
      responsibleProfessorId: 'professor-1',
      technicalJustification: `Justificativa ${capacityLabels[capacity]}`,
      professorSummary: `Resumo ${capacityLabels[capacity]}`,
      methodologyVersion: 'v1',
      parameterSetIds: [],
      sourceRefs: [{
        type: 'physical_assessment',
        id: `assessment-${index}`,
        label: `Avaliação ${index + 1}`,
        assessedAt: '2026-08-08T09:00:00.000Z',
        origin: 'Avaliação Física',
      }],
      linkedProntuarioGoalIds: [],
      alerts: [],
      createdAt: '2026-08-09T10:00:00.000Z',
      publishesTodayWorkout: false,
    },
  };
}

const capacities = capacityTypes.map(capacityFixture);

function versionFixture(status, version, conflicts = []) {
  return {
    id: `assembly-version-${version}`,
    assemblyId: 'assembly-1',
    contractId: 'contract-1',
    alunoId: 'aluno-1',
    version,
    status,
    responsibleProfessorId: 'professor-1',
    technicalObservation: 'Observação persistida para revisão profissional.',
    professorJustification: 'Justificativa persistida da montagem consolidada.',
    studentInstruction: 'Orientação prática persistida para o aluno.',
    createdByProfessorId: 'professor-1',
    createdAt: `2026-08-0${Math.min(version, 9)}T10:00:00.000Z`,
    capacityBlocks: capacities.map((prescription, index) => ({
      id: `block-${version}-${index}`,
      capacityPrescriptionVersionId: prescription.latestVersion.id,
      capacity: prescription.capacity,
      capacityVersion: prescription.latestVersion.version,
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
    }],
    conflicts,
    traceability: {
      capacityCount: 4,
      sourceRefIds: ['assessment-base-1'],
      capacityVersions: capacities.map((prescription) => ({
        capacityPrescriptionVersionId: prescription.latestVersion.id,
        capacity: prescription.capacity,
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
    id: 'assembly-1',
    contractId: 'contract-1',
    alunoId: 'aluno-1',
    currentVersion: version,
    currentStatus: status,
    createdByProfessorId: 'professor-1',
    updatedByProfessorId: 'professor-1',
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-09T10:00:00.000Z',
    latestVersion: versionFixture(status, version, conflicts),
  };
}

const warningConflict = {
  code: 'review-warning',
  message: 'Revisar origem antes do envio.',
  severity: 'warning',
  affectedCapacities: ['resisted'],
  sourceRefIds: ['assessment-base-1'],
};

const criticalConflict = {
  code: 'critical-structured-restriction',
  message: 'Restrição estruturada ainda ativa para a composição.',
  severity: 'critical',
  affectedCapacities: ['resisted'],
  sourceRefIds: ['assessment-base-1'],
};

function scenarioFixture(name) {
  if (name === 'draft') {
    return {
      assembly: assemblyFixture('draft', 3, [warningConflict]),
      conflicts: { version: 3, status: 'draft', conflicts: [warningConflict], hasCritical: false, canUnblock: false, unavailableChecks: [] },
    };
  }
  if (name === 'ready_for_review') {
    return {
      assembly: assemblyFixture('ready_for_review', 4, []),
      conflicts: { version: 4, status: 'ready_for_review', conflicts: [], hasCritical: false, canUnblock: false, unavailableChecks: [] },
    };
  }
  if (name === 'blocked') {
    return {
      assembly: assemblyFixture('blocked', 5, [warningConflict, criticalConflict]),
      conflicts: { version: 5, status: 'blocked', conflicts: [warningConflict, criticalConflict], hasCritical: true, canUnblock: false, unavailableChecks: [] },
    };
  }
  if (name === 'approved') {
    return {
      assembly: assemblyFixture('approved', 6, []),
      conflicts: { version: 6, status: 'approved', conflicts: [], hasCritical: false, canUnblock: false, unavailableChecks: [] },
    };
  }
  throw new Error(`Cenário desconhecido: ${name}`);
}

const aluno = {
  id: 'aluno-1',
  userId: 'user-aluno-1',
  professorId: 'professor-1',
  schedulePlan: 'fixed',
  age: 35,
  user: { email: 'aluno@teste.com', profile: { name: 'Maria Atleta' } },
  professor: { id: 'professor-1', user: { profile: { name: 'Prof. Bruno' } } },
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-08-09T10:00:00.000Z',
};

const masterUser = {
  id: 'user-professor-1',
  email: 'professor@teste.com',
  name: 'Prof. Bruno',
  type: 'professor',
  profile: { name: 'Prof. Bruno' },
  professor: {
    id: 'professor-1',
    role: 'master',
    collaboratorFunction: {
      id: 'function-1',
      code: 'master',
      name: 'Master',
      isActive: true,
    },
    contract: {
      id: 'contract-1',
      type: 'academy',
      document: '00000000000000',
      name: 'Academia Teste',
      tradeName: 'Academia Teste',
    },
  },
  accessControl: { isMaster: true, permissions: [] },
};

function assemblySummary(assembly) {
  return {
    id: assembly.id,
    contractId: assembly.contractId,
    alunoId: assembly.alunoId,
    currentVersion: assembly.currentVersion,
    currentStatus: assembly.currentStatus,
    createdByProfessorId: assembly.createdByProfessorId,
    updatedByProfessorId: assembly.updatedByProfessorId,
    createdAt: assembly.createdAt,
    updatedAt: assembly.updatedAt,
  };
}

function historyFixture(current) {
  return {
    assembly: assemblySummary(current),
    versions: [versionFixture('draft', 1, []), versionFixture('approved', 2, []), current.latestVersion],
    auditEvents: [],
  };
}

function storageState() {
  return {
    cookies: [],
    origins: [{
      origin: ORIGIN,
      localStorage: [
        { name: 'token', value: TOKEN },
        { name: 'user', value: JSON.stringify(masterUser) },
      ],
    }],
  };
}

async function waitForServer() {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(BASE_URL, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error(`Servidor não respondeu em ${BASE_URL}`);
}

async function createScenarioPage(browser, scenario, deviceLabel, viewport, options = {}) {
  const fixture = scenarioFixture(scenario);
  const context = await browser.newContext({ viewport, storageState: storageState() });
  const diagnostics = {
    pageErrors: [],
    consoleErrors: [],
    requestFailures: [],
    unexpectedApiRequests: [],
  };

  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    const fulfill = (data, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(status >= 400 ? data : { success: true, data }),
    });

    if (method === 'GET' && pathname === '/api/v1/auth/me') return fulfill(masterUser);
    if (method === 'GET' && pathname === '/api/v1/alunos/aluno-1') return fulfill(aluno);
    if (method === 'GET' && pathname === '/api/v1/capacity-prescriptions/alunos/aluno-1') return fulfill(capacities);
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
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    diagnostics.requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'unknown'}`);
  });

  const label = `${deviceLabel}-${scenario}`;
  await page.goto(`${BASE_URL}${ROUTE}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);

  const heading = page.getByRole('heading', { name: 'Montagem Consolidada da Prescrição' });
  try {
    await heading.waitFor({ state: 'visible', timeout: 10000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: window.location.href,
      token: localStorage.getItem('token'),
      user: localStorage.getItem('user'),
      bodyText: document.body?.innerText?.slice(0, 6000) || '',
    }));
    const diagnosticPayload = { label, state, diagnostics };
    fs.writeFileSync(path.join(OUTPUT_DIR, `${label}-startup-diagnostics.json`), JSON.stringify(diagnosticPayload, null, 2));
    await page.screenshot({ path: path.join(OUTPUT_DIR, `${label}-startup-failure.png`), fullPage: true }).catch(() => undefined);
    throw new Error(`${label}: workspace não abriu. url=${state.url}; body=${state.bodyText.slice(0, 500)}; pageErrors=${diagnostics.pageErrors.join(' | ')}`);
  }

  assert.equal(await page.evaluate(() => localStorage.getItem('token')), TOKEN, `${label}: token de sessão não permaneceu no origin`);
  assert.deepEqual(diagnostics.unexpectedApiRequests, [], `${label}: chamadas de API não mockadas: ${diagnostics.unexpectedApiRequests.join(' | ')}`);
  return { context, page, diagnostics, label };
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({ viewportWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(metrics.scrollWidth <= metrics.viewportWidth + 1, `${label}: overflow horizontal (${metrics.scrollWidth}px > ${metrics.viewportWidth}px)`);
}

async function scanA11y(page, label) {
  await page.addScriptTag({ path: AXE_PATH });
  const result = await page.evaluate(async () => {
    const root = document.querySelector('main') || document.body;
    return window.axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
  });
  fs.writeFileSync(path.join(OUTPUT_DIR, `${label}-axe.json`), JSON.stringify({ violations: result.violations, passes: result.passes.map((item) => item.id) }, null, 2));
  assert.equal(result.violations.length, 0, `${label}: axe encontrou ${result.violations.length} violação(ões): ${result.violations.map((item) => item.id).join(', ')}`);
}

async function saveAriaSnapshot(page, label) {
  const root = page.locator('main').first();
  const target = (await root.count()) > 0 ? root : page.locator('body');
  const snapshot = await target.ariaSnapshot();
  fs.writeFileSync(path.join(OUTPUT_DIR, `${label}-aria.yml`), snapshot);
  assert.match(snapshot, /Montagem Consolidada da Prescrição/);
  assert.match(snapshot, /1\. Dados gerais/);
  assert.match(snapshot, /8\. Histórico de versões/);
}

async function keyboardOpenAccordion(page, name) {
  const trigger = page.getByRole('button', { name });
  await trigger.focus();
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  await page.keyboard.press('Enter');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
}

async function verifyScenario(browser, scenario, deviceLabel, viewport) {
  const { context, page, diagnostics, label } = await createScenarioPage(browser, scenario, deviceLabel, viewport);
  try {
    const expectedStatus = {
      draft: 'Rascunho',
      ready_for_review: 'Pronta para revisão',
      blocked: 'Bloqueada',
      approved: 'Aprovada',
    }[scenario];
    await page.getByText(expectedStatus, { exact: true }).first().waitFor();
    await assertNoHorizontalOverflow(page, label);

    if (scenario === 'blocked') {
      await keyboardOpenAccordion(page, '4. Alertas e conflitos');
      const warning = page.getByText('Atenção', { exact: true });
      const critical = page.getByText('Bloqueador crítico', { exact: true });
      await warning.waitFor();
      await critical.waitFor();
      const styles = await page.evaluate(() => {
        const findText = (text) => [...document.querySelectorAll('p')].find((node) => node.textContent === text);
        const warningNode = findText('Atenção')?.closest('.rounded-lg.border');
        const criticalNode = findText('Bloqueador crítico')?.closest('.rounded-lg.border');
        if (!warningNode || !criticalNode) return null;
        const warningStyle = getComputedStyle(warningNode);
        const criticalStyle = getComputedStyle(criticalNode);
        return {
          warningBackground: warningStyle.backgroundColor,
          warningBorder: warningStyle.borderColor,
          criticalBackground: criticalStyle.backgroundColor,
          criticalBorder: criticalStyle.borderColor,
        };
      });
      assert.ok(styles, `${label}: não foi possível medir estilos de warning/critical`);
      assert.notEqual(styles.warningBackground, styles.criticalBackground, `${label}: warning e critical precisam de fundos distintos`);
      assert.notEqual(styles.warningBorder, styles.criticalBorder, `${label}: warning e critical precisam de bordas distintas`);
    } else if (scenario === 'approved') {
      await keyboardOpenAccordion(page, '8. Histórico de versões');
      const summary = page.locator('summary').filter({ hasText: 'Versão 2' }).first();
      const historyItem = summary.locator('xpath=..');
      await summary.waitFor();
      await summary.focus();
      await page.keyboard.press('Enter');
      assert.notEqual(await historyItem.getAttribute('open'), null, `${label}: versão histórica não abriu via teclado`);
      await historyItem.getByText(/Somente leitura — versões históricas nunca são editadas nesta tela\./).waitFor();
    } else {
      await keyboardOpenAccordion(page, '7. Revisão e validação final');
      if (scenario === 'ready_for_review') await page.getByRole('button', { name: 'Aprovar montagem' }).waitFor();
    }

    await scanA11y(page, label);
    await saveAriaSnapshot(page, label);
    await page.screenshot({ path: path.join(OUTPUT_DIR, `${label}.png`), fullPage: true });
    assert.deepEqual(diagnostics.pageErrors, [], `${label}: erros JavaScript: ${diagnostics.pageErrors.join(' | ')}`);
  } finally {
    await context.close();
  }
}

async function verifyConcurrency409(browser) {
  const { context, page, diagnostics } = await createScenarioPage(
    browser,
    'draft',
    'desktop-concurrency',
    { width: 1440, height: 1000 },
    { forceConflict409: true }
  );
  try {
    await keyboardOpenAccordion(page, '5. Composição e ordem técnica');
    const observation = page.getByLabel('Observação técnica interna');
    await observation.fill('Alteração local preservada no navegador real');
    await keyboardOpenAccordion(page, '7. Revisão e validação final');
    await page.getByRole('button', { name: 'Salvar rascunho' }).click();
    await page.getByText('Conflito de versão detectado', { exact: true }).waitFor();
    await page.getByText(/Suas alterações locais foram preservadas/i).waitFor();
    await keyboardOpenAccordion(page, '5. Composição e ordem técnica');
    assert.equal(await observation.inputValue(), 'Alteração local preservada no navegador real');
    assert.deepEqual(diagnostics.unexpectedApiRequests, [], `desktop-concurrency-409: chamadas inesperadas: ${diagnostics.unexpectedApiRequests.join(' | ')}`);
    assert.deepEqual(diagnostics.pageErrors, [], `desktop-concurrency-409: erros JavaScript: ${diagnostics.pageErrors.join(' | ')}`);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'desktop-concurrency-409.png'), fullPage: true });
  } finally {
    await context.close();
  }
}

async function main() {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const scenarios = ['draft', 'ready_for_review', 'blocked', 'approved'];
    const devices = [
      ['desktop', { width: 1440, height: 1000 }],
      ['mobile', { width: 390, height: 844 }],
    ];

    for (const [deviceLabel, viewport] of devices) {
      for (const scenario of scenarios) {
        await verifyScenario(browser, scenario, deviceLabel, viewport);
      }
    }
    await verifyConcurrency409(browser);

    const summary = {
      issue: 318,
      route: ROUTE,
      generatedAt: new Date().toISOString(),
      candidateSha: process.env.ISSUE318_HEAD_SHA || process.env.GITHUB_SHA || null,
      assertions: {
        responsiveViewports: ['1440x1000', '390x844'],
        states: ['draft', 'ready_for_review', 'blocked', 'approved', 'concurrency-409'],
        session: 'Authenticated professor master is seeded through BrowserContext storageState before application JavaScript runs, and /auth/me returns the same public AuthResponse.user contract.',
        keyboard: 'Accordion sections activated with focused control + Enter; historical details activated with keyboard.',
        accessibility: 'axe-core WCAG 2 A/AA scan over main content plus Chromium ARIA snapshots for each desktop/mobile state.',
        warningVsCritical: 'Text labels and computed background/border styles asserted as distinct.',
        history: 'Historical version opened and read-only copy asserted.',
        concurrency: 'HTTP 409 mocked at the API boundary; local textarea value asserted preserved.',
      },
      note: 'ARIA snapshots represent the Chromium accessibility tree used by assistive technologies; this automated evidence does not claim a native NVDA/VoiceOver/Orca manual session.',
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(`Issue #318 browser evidence generated at ${OUTPUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
