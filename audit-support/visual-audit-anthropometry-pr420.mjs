import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const repoRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const outputDir = path.join(repoRoot, 'artifacts', 'pr420-anthropometry-visual');
const baseUrl = 'http://127.0.0.1:4173';
const route = '/protocolo-avaliacao-fisica/antropometria?alunoId=student-visual';
const materialHeadSha = process.env.AUDIT_MATERIAL_HEAD_SHA || 'unknown';
const publishedHeadSha = process.env.AUDIT_PUBLISHED_HEAD_SHA || 'unknown';

const masterUser = {
  id: 'user-visual', userId: 'user-visual', email: 'master@example.com', name: 'Professor Master', type: 'professor',
  contractId: 'contract-visual', professorId: 'professor-visual',
  professor: {
    id: 'professor-visual', role: 'master',
    collaboratorFunction: { id: 'function-master', name: 'Master', code: 'master', isActive: true },
    contract: { id: 'contract-visual', type: 'academy', document: '00000000000100', name: 'Academia Visual' },
  },
  accessControl: { isMaster: true, permissions: [] },
};
const professor = {
  id: 'professor-visual', role: 'master', collaboratorFunction: masterUser.professor.collaboratorFunction,
  user: { id: 'user-visual', email: masterUser.email, profile: { name: 'Professor Master' } },
};
const aluno = {
  id: 'student-visual', userId: 'student-user-visual', professorId: 'professor-visual', schedulePlan: 'free', age: 38,
  createdAt: '2026-01-01T12:00:00.000Z', updatedAt: '2026-09-01T12:00:00.000Z',
  user: { email: 'aluna@example.com', isActive: true, profile: { name: 'Mariana de Souza Lima', gender: 'female', birthDate: '1988-04-12' } },
  professor: { id: 'professor-visual', user: { profile: { name: 'Professor Master' } } },
};
const segments = [
  {
    id: 'seg-cintura', contractId: 'contract-visual', name: 'Circunferência da cintura', description: 'Medida no ponto médio entre a última costela e a crista ilíaca.', technicalDescription: null,
    sexApplicability: 'ambos', type: 'principal', order: 10, active: true, importByDefault: true, importObservationByDefault: false, requiredForCompletion: true,
    requirementVersion: 3, requirementConfiguredAt: '2026-08-20T10:00:00.000Z', femaleImageUrl: null, maleImageUrl: null, tutorialVideoUrl: null, formulaHint: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z',
  },
  {
    id: 'seg-quadril', contractId: 'contract-visual', name: 'Circunferência do quadril', description: 'Maior perímetro da região glútea.', technicalDescription: null,
    sexApplicability: 'ambos', type: 'principal', order: 20, active: true, importByDefault: true, importObservationByDefault: false, requiredForCompletion: true,
    requirementVersion: 2, requirementConfiguredAt: '2026-08-20T10:00:00.000Z', femaleImageUrl: null, maleImageUrl: null, tutorialVideoUrl: null, formulaHint: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z',
  },
  {
    id: 'seg-braco', contractId: 'contract-visual', name: 'Braço relaxado — lado direito', description: 'Segmento opcional para acompanhamento complementar.', technicalDescription: null,
    sexApplicability: 'ambos', type: 'opcional', order: 30, active: true, importByDefault: true, importObservationByDefault: false, requiredForCompletion: false,
    requirementVersion: 1, requirementConfiguredAt: '2026-08-20T10:00:00.000Z', femaleImageUrl: null, maleImageUrl: null, tutorialVideoUrl: null, formulaHint: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z',
  },
];

function assessment({ id, code, date, status, waist, hip, arm, notes, corrections = [] }) {
  const completed = status === 'COMPLETED';
  return {
    id, contractId: 'contract-visual', alunoId: 'student-visual', professorId: 'professor-visual', code, assessmentDate: date, notes, status,
    completedAt: completed ? `${date.slice(0, 10)}T15:30:00.000Z` : null, completedByUserId: completed ? 'user-visual' : null,
    completionRequirementsSnapshot: completed ? { legacy: false, requiredSegments: ['seg-cintura', 'seg-quadril'] } : null,
    corrections, createdAt: `${date.slice(0, 10)}T12:00:00.000Z`, updatedAt: `${date.slice(0, 10)}T15:30:00.000Z`, professor,
    values: [
      { id: `${id}-waist`, assessmentId: id, segmentId: 'seg-cintura', value: waist, unit: 'cm', variationFromPrevious: null },
      { id: `${id}-hip`, assessmentId: id, segmentId: 'seg-quadril', value: hip, unit: 'cm', variationFromPrevious: null },
      { id: `${id}-arm`, assessmentId: id, segmentId: 'seg-braco', value: arm, unit: 'cm', variationFromPrevious: null },
    ],
    observations: [{ id: `${id}-obs`, assessmentId: id, segmentId: null, text: `Observação ${code}: ${notes}`, importable: false }],
  };
}

function withVariations(items) {
  const chronological = [...items].sort((a, b) => new Date(a.assessmentDate) - new Date(b.assessmentDate));
  const previousBySegment = new Map();
  for (const item of chronological) {
    item.values = item.values.map((value) => {
      const previous = previousBySegment.get(value.segmentId);
      const currentNumber = Number(String(value.value).replace(',', '.'));
      const previousNumber = previous == null ? null : Number(String(previous).replace(',', '.'));
      const absolute = previousNumber == null ? null : Math.round((currentNumber - previousNumber) * 10000) / 10000;
      previousBySegment.set(value.segmentId, value.value);
      return { ...value, variationFromPrevious: absolute == null ? null : { absolute, percentage: previousNumber === 0 ? null : Math.round(((absolute / Math.abs(previousNumber)) * 100) * 10000) / 10000 } };
    });
  }
  return items;
}

const completedHistory = withVariations([
  assessment({ id: 'a1', code: 'ANTR-001', date: '2026-05-10T12:00:00.000Z', status: 'COMPLETED', waist: '88,0', hip: '104,0', arm: '31,0', notes: 'Avaliação inicial concluída' }),
  assessment({ id: 'a2', code: 'ANTR-002', date: '2026-07-15T12:00:00.000Z', status: 'COMPLETED', waist: '84,5', hip: '101,5', arm: '31,5', notes: 'Evolução intermediária' }),
]);
const draftAssessment = assessment({ id: 'a3', code: 'ANTR-003', date: '2026-09-04T12:00:00.000Z', status: 'DRAFT', waist: '82,0', hip: '100,0', arm: '32,0', notes: 'Rascunho atual para validação visual' });
const draftData = withVariations([...completedHistory, draftAssessment]).sort((a, b) => new Date(b.assessmentDate) - new Date(a.assessmentDate));
const completedOnlyData = withVariations([
  ...completedHistory,
  assessment({
    id: 'a3c', code: 'ANTR-003', date: '2026-09-04T12:00:00.000Z', status: 'COMPLETED', waist: '82,0', hip: '100,0', arm: '32,0', notes: 'Avaliação atual concluída',
    corrections: [{ id: 'corr-1', assessmentId: 'a3c', contractId: 'contract-visual', alunoId: 'student-visual', actorUserId: 'user-visual', actorProfessorId: 'professor-visual', reason: 'Correção técnica conferida', beforeSnapshot: {}, afterSnapshot: {}, createdAt: '2026-09-04T16:00:00.000Z' }],
  }),
]).sort((a, b) => new Date(b.assessmentDate) - new Date(a.assessmentDate));

const json = (data, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(data) });
const ok = (data) => json({ success: true, data });

async function waitForServer(url, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Preview did not start at ${url}`);
}

async function installMocking(page, mode) {
  const assessments = mode === 'completed' ? completedOnlyData : draftData;
  await page.evaluateOnNewDocument((user) => {
    localStorage.setItem('token', 'pr420-visual-token');
    localStorage.setItem('user', JSON.stringify(user));
  }, masterUser);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;
    if (pathname === '/api/v1/auth/me') return void request.respond(ok(masterUser));
    if (pathname === '/api/v1/alunos' && method === 'GET') return void request.respond(ok({ alunos: [aluno], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } }));
    if (pathname === '/api/v1/professores' && method === 'GET') return void request.respond(ok([professor]));
    if (pathname === '/api/v1/anthropometry/segments/active' && method === 'GET') return void request.respond(ok(segments));
    if (pathname === '/api/v1/anthropometry/segments' && method === 'GET') return void request.respond(ok(segments));
    if (pathname === '/api/v1/anthropometry/alunos/student-visual/assessments' && method === 'GET') return void request.respond(ok(assessments));
    if (pathname === '/api/v1/anthropometry/alunos/student-visual/assessments/last' && method === 'GET') return void request.respond(ok(assessments[0] || null));
    if (pathname === '/api/v1/anthropometry/alunos/student-visual/compare' && method === 'GET') return void request.respond(ok(assessments));
    if (pathname.startsWith('/api/v1/anthropometry/') && ['PUT', 'POST'].includes(method)) return void request.respond(ok(assessments[0]));
    if (pathname.startsWith('/api/v1/')) return void request.respond(json({ success: false, error: `Unexpected visual audit request: ${method} ${pathname}` }, 404));
    return void request.continue();
  });
}

async function clickButtonByText(page, text) {
  const clicked = await page.evaluate((label) => {
    const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.includes(label) && !item.disabled);
    if (!button) return false;
    button.focus(); button.click(); return true;
  }, text);
  if (!clicked) throw new Error(`Button not found: ${text}`);
}

async function diagnostics(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const comparisonTable = Array.from(document.querySelectorAll('table')).find((table) => table.textContent?.includes('Circunferência da cintura'));
    const tableContainer = comparisonTable?.parentElement;
    const visibleButtons = Array.from(document.querySelectorAll('button')).filter((button) => { const rect = button.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; });
    return {
      title: Array.from(document.querySelectorAll('h1')).map((node) => node.textContent?.trim()).find((value) => value === 'Avaliação Antropométrica') || null,
      viewportWidth: root.clientWidth, viewportHeight: root.clientHeight, documentScrollWidth: root.scrollWidth, documentScrollHeight: root.scrollHeight,
      hasComparisonTable: Boolean(comparisonTable), tableContainerOverflowX: tableContainer ? getComputedStyle(tableContainer).overflowX : null,
      tableScrollWidth: comparisonTable?.scrollWidth || 0, tableContainerClientWidth: tableContainer?.clientWidth || 0,
      hasEvolutionHeading: document.body.textContent?.includes('Evolução visual') || false,
      hasDraftState: document.body.textContent?.includes('Rascunho') || false,
      hasCompletedState: document.body.textContent?.includes('Concluída') || false,
      hasCorrectionReason: Boolean(document.querySelector('#anthropometry-correction-reason')),
      hasRequiredBadge: document.body.textContent?.includes('Obrigatória') || false,
      buttonsWithoutAccessibleName: visibleButtons.filter((button) => !button.textContent?.trim() && !button.getAttribute('aria-label')).length,
      activeElement: document.activeElement instanceof HTMLElement ? { tag: document.activeElement.tagName, text: document.activeElement.textContent?.trim() || null, id: document.activeElement.id || null } : null,
    };
  });
}

function validate(name, info, { mobile = false, correction = false } = {}) {
  if (info.title !== 'Avaliação Antropométrica') throw new Error(`${name}: route title missing`);
  if (!info.hasComparisonTable) throw new Error(`${name}: comparison table missing`);
  if (!info.hasEvolutionHeading) throw new Error(`${name}: evolution chart section missing`);
  if (!info.hasCompletedState) throw new Error(`${name}: completed state missing`);
  if (info.buttonsWithoutAccessibleName > 0) throw new Error(`${name}: visible button without accessible name`);
  if (info.documentScrollWidth > info.viewportWidth + 1) throw new Error(`${name}: accidental document horizontal overflow`);
  if (mobile) {
    if (info.tableContainerOverflowX !== 'auto') throw new Error(`${name}: comparison table does not use deliberate horizontal scroll`);
    if (info.tableScrollWidth <= info.tableContainerClientWidth) throw new Error(`${name}: mobile scenario did not exercise internal table scroll`);
  }
  if (correction && !info.hasCorrectionReason) throw new Error(`${name}: correction mode did not expose reason field`);
}

async function capture(browser, scenario) {
  const page = await browser.newPage();
  await page.setViewport(scenario.viewport);
  await installMocking(page, scenario.mode);
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => document.body.textContent?.includes('Avaliação Antropométrica'));
  if (scenario.openHistory) { await clickButtonByText(page, 'Histórico de avaliações'); await new Promise((resolve) => setTimeout(resolve, 150)); }
  if (scenario.correction) {
    await clickButtonByText(page, 'Corrigir avaliação');
    await page.waitForSelector('#anthropometry-correction-reason');
    await page.focus('#anthropometry-correction-reason');
    await page.keyboard.type('Correção visual auditada');
  }
  if (scenario.keyboard) {
    const focused = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.includes('Concluir avaliação') && !item.disabled);
      button?.focus(); return document.activeElement === button;
    });
    if (!focused) throw new Error(`${scenario.name}: primary action could not receive keyboard focus`);
  }
  const info = await diagnostics(page);
  validate(scenario.name, info, scenario);
  const accessibility = await page.accessibility.snapshot({ interestingOnly: true });
  await page.screenshot({ path: path.join(outputDir, `${scenario.name}.png`), fullPage: true });
  await writeFile(path.join(outputDir, `${scenario.name}.diagnostics.json`), `${JSON.stringify({ scenario, materialHeadSha, publishedHeadSha, route, info, consoleErrors }, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outputDir, `${scenario.name}.accessibility.json`), `${JSON.stringify(accessibility, null, 2)}\n`, 'utf8');
  await page.close();
  return { name: scenario.name, passed: true, viewport: scenario.viewport, mode: scenario.mode, correction: Boolean(scenario.correction), keyboard: Boolean(scenario.keyboard), diagnostics: info };
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
const preview = spawn('pnpm', ['--filter', '@corrida/web', 'preview', '--host', '127.0.0.1', '--port', '4173'], { cwd: repoRoot, stdio: 'inherit', detached: true });
let browser;
try {
  await waitForServer(baseUrl);
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const scenarios = [
    { name: 'desktop-draft-history', mode: 'draft', viewport: { width: 1366, height: 768 }, openHistory: true, keyboard: true },
    { name: 'mobile-draft', mode: 'draft', viewport: { width: 390, height: 844 }, mobile: true },
    { name: 'desktop-completed-correction', mode: 'completed', viewport: { width: 1366, height: 768 }, correction: true },
  ];
  const results = [];
  for (const scenario of scenarios) results.push(await capture(browser, scenario));
  const manifest = {
    schemaVersion: 1, kind: 'pr420-anthropometry-real-browser-evidence', repository: process.env.GITHUB_REPOSITORY || 'crgasparoto-br/training-system',
    workflowRunId: process.env.GITHUB_RUN_ID || null, workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    materialHeadSha, publishedHeadSha, route, browser: 'puppeteer-chrome-headless', scenarios: results,
  };
  await writeFile(path.join(outputDir, 'visual-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`ANTHROPOMETRY_VISUAL_OK material=${materialHeadSha} scenarios=${results.length}`);
} finally {
  if (browser) await browser.close();
  try { process.kill(-preview.pid, 'SIGTERM'); } catch {}
}
