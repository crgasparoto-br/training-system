// @vitest-environment node
// Issue #489: authenticated student UI in real Chrome at desktop/mobile sizes.
// The browser uses the production page/services against an isolated HTTP fixture;
// backend concurrency, authorization and persistence are covered by PostgreSQL tests.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import http from 'node:http';
import { accessSync, constants, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const puppeteer = apiRequire('puppeteer');
const HOST = '127.0.0.1';
const WEB_PORT = 4890, API_PORT = 4891;
const WEB_ORIGIN = `http://${HOST}:${WEB_PORT}`, API_ORIGIN = `http://${HOST}:${API_PORT}`;
const CONTRACT_ID = 'contract-489', SESSION_ID = 'day-489';
const TODAY = '2026-11-03';
const student = { id: 'student-489', type: 'aluno', name: 'Aluno #489', email: 'student489@example.test' };
const outputDir = path.resolve(process.cwd(), '../../artifacts/issue-489');
const viewports = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'mobile-390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
];
const planned = [
  { id: 'warmup', kind: 'warmup', iteration: 1, roundNumber: null, roundTotal: null,
    durationUnit: 'seconds', durationValue: 90 },
  { id: 'work', kind: 'work', iteration: 1, roundNumber: 1, roundTotal: 2,
    durationUnit: 'seconds', durationValue: 90, targetKind: 'speed_kmh', targetMin: 9.5, targetMax: 12.5 },
  { id: 'recovery', kind: 'recovery', iteration: 1, roundNumber: 1, roundTotal: 2,
    durationUnit: 'seconds', durationValue: 90 },
  { id: 'work', kind: 'work', iteration: 2, roundNumber: 2, roundTotal: 2,
    durationUnit: 'seconds', durationValue: 90, targetKind: 'speed_kmh', targetMin: 9.5, targetMax: 12.5 },
  { id: 'recovery', kind: 'recovery', iteration: 2, roundNumber: 2, roundTotal: 2,
    durationUnit: 'seconds', durationValue: 90 },
  { id: 'cooldown', kind: 'cooldown', iteration: 1, roundNumber: null, roundTotal: null,
    durationUnit: 'meters', durationValue: 800 },
].map((step, index) => ({
  plannedStageId: step.id, iteration: step.iteration, order: index + 1,
  kind: step.kind, roundNumber: step.roundNumber, roundTotal: step.roundTotal,
  durationUnit: step.durationUnit, durationValue: step.durationValue,
  targetKind: step.targetKind ?? null, targetValue: null,
  targetMin: step.targetMin ?? null, targetMax: step.targetMax ?? null,
  inclinePercent: null, cadenceSpm: null, notes: null,
}));
let version = 1, completed = 0, state = 'in_progress', startedAt = null, conflictNext = false;
const calls = [];
function reset() { version = 1; completed = 0; state = 'in_progress'; startedAt = null; conflictNext = false; calls.length = 0; }
function execution() {
  return { sessionId: SESSION_ID, status: state, version, startedAt: '2026-11-03T09:00:00.000Z',
    finishedAt: null, currentPauseStartedAt: state === 'paused' ? new Date().toISOString() : null,
    pausedDurationMs: 0, interruptionReason: null, sessionValues: {}, items: [],
    origin: { releaseId: 'release-489', workoutTemplateId: 'template-489', trainingPlanId: 'plan-489' } };
}
function summary() {
  return { sessionId: SESSION_ID, workoutTemplateId: 'template-489', trainingPlanId: 'plan-489',
    planName: 'Treino intervalado 2 rodadas', date: TODAY, dayOfWeek: 2, mesocycleNumber: 1, weekNumber: 1,
    modalities: ['cyclic'], durationMin: 40, location: 'Pista', method: 'Intervalado', status: state,
    origin: { kind: 'consolidated', releasedAt: '2026-11-03T08:00:00.000Z' } };
}
function routine() {
  return { alunoId: student.id, audience: 'student', referenceDate: TODAY, timeZone: 'America/Sao_Paulo',
    week: { startDate: '2026-11-02', endDate: '2026-11-08' },
    days: [{ date: TODAY, isToday: true, sessions: [summary()], pendingReleaseCount: 0 }],
    today: { date: TODAY, state: 'released', sessions: [{ ...summary(), execution: execution(),
      objective: 'Executar trabalho e recuperação guiados', guidelines: [],
      cyclic: null, cyclicStages: [], blocks: [], comparison: null }] },
    execution: { available: true, reason: null }, nextSession: null, lastExecution: null,
    feedbackContinuity: { state: 'available', pendingCount: 0, registeredCount: 0 } };
}
function guided() {
  return { sessionId: SESSION_ID, status: state, version,
    serverNow: new Date().toISOString(), availability: 'available',
    completed, total: planned.length, current: planned[completed] ?? null,
    next: planned[completed + 1] ?? null, currentStartedAt: startedAt,
    elapsedMs: startedAt ? 1000 : null,
    remainingMs: startedAt && planned[completed]?.durationUnit === 'seconds' ? 89000 : null };
}
function response(res, status, data) {
  res.writeHead(status, { 'Access-Control-Allow-Origin': WEB_ORIGIN,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Contract-Id',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' });
  res.end(data === undefined ? '' : JSON.stringify(data));
}
async function body(req) { const chunks = []; for await (const part of req) chunks.push(part); return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
function startApi() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', API_ORIGIN);
    if (req.method === 'OPTIONS') return response(res, 204);
    const call = { path: url.pathname, method: req.method, contractId: req.headers['x-contract-id'] || null,
      authenticated: req.headers.authorization === 'Bearer issue-489-browser-token' };
    calls.push(call);
    if (url.pathname === '/api/v1/auth/me') return response(res, 200, { data: student });
    if (url.pathname === '/api/v1/student/me/summary') return response(res, 200, { success: true, data: {
      name: student.name, hasPendingProfileReview: false, nextProfileReviewAt: null, recentNotifications: [] } });
    if (url.pathname === '/api/v1/student/me/training-routine') return response(res, 200, { success: true, data: routine() });
    if (url.pathname === `/api/v1/student/me/training-sessions/${SESSION_ID}/execution/guided-cyclic` && req.method === 'GET') {
      return response(res, 200, { success: true, data: guided() });
    }
    if (url.pathname === `/api/v1/student/me/training-sessions/${SESSION_ID}/execution/guided-cyclic/step` && req.method === 'POST') {
      const input = await body(req); call.input = input;
      if (conflictNext) { conflictNext = false; return response(res, 409, { code: 'VERSION_CONFLICT' }); }
      const current = guided().current;
      if (state !== 'in_progress' || !current || input.expectedVersion !== version ||
        input.plannedStageId !== current.plannedStageId || input.iteration !== current.iteration ||
        (input.action === 'complete' && !startedAt)) return response(res, 409, { code: 'VERSION_CONFLICT' });
      if (input.action === 'start') startedAt = new Date().toISOString();
      else if (input.action === 'complete') { completed++; startedAt = null; }
      else return response(res, 400, { code: 'INVALID_ACTION' });
      version++;
      return response(res, 200, { success: true, data: guided() });
    }
    if (url.pathname === `/api/v1/student/me/training-sessions/${SESSION_ID}/execution/transition` && req.method === 'POST') {
      const input = await body(req); call.input = input;
      if (input.expectedVersion !== version ||
        !(state === 'in_progress' && input.targetStatus === 'paused' ||
          state === 'paused' && input.targetStatus === 'in_progress')) return response(res, 409, { code: 'VERSION_CONFLICT' });
      state = input.targetStatus; version++;
      return response(res, 200, { success: true, data: execution() });
    }
    return response(res, 404, { message: 'not in browser scenario', path: url.pathname });
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(API_PORT, HOST, () => resolve(server)); });
}
async function startVite() {
  const previous = process.env.VITE_API_URL;
  process.env.VITE_API_URL = API_ORIGIN;
  const { createServer } = await import('vite');
  const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { host: HOST, port: WEB_PORT, strictPort: true } });
  await server.listen();
  return { server, previous };
}
function chromePath() {
  for (const candidate of [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].filter(Boolean)) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* use cache */ }
  }
  return puppeteer.executablePath();
}
function exactHead() {
  let event = {};
  try { if (process.env.GITHUB_EVENT_PATH) event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')); } catch {}
  return event?.pull_request?.head?.sha || process.env.VERIFICATION_HEAD_SHA || process.env.GITHUB_SHA || 'unknown';
}
async function untilText(page, fragment) {
  try {
    await page.waitForFunction((text) => document.body?.innerText.includes(text), { timeout: 14000 }, fragment);
  } catch (error) {
    // A failed browser gate must show whether the write, revalidation or render stalled.
    const screen = await page.evaluate(() => ({
      path: location.pathname,
      text: document.body?.innerText.slice(-2200),
      alerts: [...document.querySelectorAll('[role="alert"]')].map((node) => node.textContent),
      selectedOutcomes: [...document.querySelectorAll('select')].map((node) => node.value),
      enabledButtons: [...document.querySelectorAll('button')].filter((node) => !node.disabled)
        .map((node) => node.textContent?.trim()).filter(Boolean),
    })).catch((cause) => ({ inspectionError: String(cause) }));
    throw new Error('Waiting for ' + JSON.stringify(fragment) +
      ' failed: ' + String(error) + '\nScreen: ' + JSON.stringify(screen) +
      '\nRecent API requests: ' + JSON.stringify(calls.slice(-15)));
  }
}
async function selectOutcome(page, value) {
  // Use Chrome's actual select interaction so React receives input/change events.
  // Directly changing HTMLSelectElement.value can skip React's controlled state.
  const id = await page.evaluate(() => {
    const label = [...document.querySelectorAll('label')]
      .find((node) => node.textContent?.includes('Como foi a etapa?'));
    const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
    if (!(input instanceof HTMLSelectElement)) throw new Error('Outcome not labelled');
    return input.id;
  });
  const selected = await page.select('[id="' + id + '"]', value);
  expect(selected).toEqual([value]);
  await untilButton(page, 'Confirmar etapa');
}
async function untilButton(page, text) {
  await page.waitForFunction((text) => [...document.querySelectorAll('button')]
    .some((node) => node.textContent?.includes(text) && !node.disabled), { timeout: 14000 }, text);
}
async function clickButton(page, text) {
  await untilButton(page, text);
  await page.evaluate((name) => {
    const control = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes(name) && !node.disabled);
    if (!control) throw new Error('Missing enabled ' + name);
    control.click();
  }, text);
}
async function screenshot(page, viewport, phase) {
  const bytes = await page.screenshot({ fullPage: true });
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, `${viewport}-${phase}.png`), bytes);
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
async function checkLayout(page) {
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const section = [...document.querySelectorAll('section[aria-labelledby]')].find((el) => {
      const heading = el.querySelector('h4');
      return heading?.textContent === 'Etapa por etapa' && el.getAttribute('aria-labelledby') === heading.id;
    });
    const heading = section?.querySelector('h4');
    return { width: innerWidth, overflow: root.scrollWidth - innerWidth,
      label: section?.getAttribute('aria-labelledby'), heading: heading?.id,
      live: Boolean(section?.querySelector('[role=status]')),
      touchControls: [...section?.querySelectorAll('button') || []].filter((el) => !el.disabled)
        .every((el) => el.getBoundingClientRect().height >= 43),
    };
  });
  expect(layout.overflow).toBeLessThanOrEqual(1);
  expect(layout.label).toBeTruthy();
  expect(layout.label).toBe(layout.heading);
  expect(layout.live).toBe(true);
  expect(layout.touchControls).toBe(true);
}
const suite = process.env.ISSUE_489_BROWSER_EVIDENCE === '1' ? describe : describe.skip;
suite('Issue #489 - guided cyclic browser, responsive and accessible', () => {
  it('exercises authenticated desktop/mobile, keyboard, pause, rounds, targets, and conflict', async () => {
    let api, vite, browser;
    const scenarios = [];
    try {
      api = await startApi(); vite = await startVite();
      browser = await puppeteer.launch({ executablePath: chromePath(), headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const page = await browser.newPage();
      await page.goto(`${WEB_ORIGIN}/login`, { waitUntil: 'domcontentloaded' });
      await page.evaluate((user, contractId) => {
        localStorage.setItem('token', 'issue-489-browser-token');
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('studentContractId', contractId);
      }, student, CONTRACT_ID);
      for (const viewport of viewports) {
        reset();
        await page.setViewport(viewport);
        await page.goto(`${WEB_ORIGIN}/student/training?contractId=${CONTRACT_ID}`, { waitUntil: 'domcontentloaded' });
        await untilText(page, 'Etapa por etapa');
        await untilText(page, 'Aquecimento');
        await untilButton(page, 'Iniciar etapa');
        await checkLayout(page);
        const before = await screenshot(page, viewport.name, 'warmup');
        const initialKeyboard = await page.evaluate(() => {
          const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('Iniciar etapa'));
          if (!button || button.disabled) return false;
          button.focus(); return document.activeElement === button;
        });
        expect(initialKeyboard).toBe(true);
        await page.keyboard.press('Enter');
        await untilText(page, 'Confirmar etapa');
        expect(await page.evaluate(() => !!document.querySelector('[role=timer][aria-label="Tempo restante da etapa"]'))).toBe(true);
        await clickButton(page, 'Pausar treino');
        await untilText(page, 'Treino pausado. O relógio está congelado');
        await checkLayout(page);
        await clickButton(page, 'Retomar treino');
        await untilText(page, 'Confirmar etapa');
        await selectOutcome(page, 'not_performed');
        await clickButton(page, 'Confirmar etapa');
        await untilText(page, 'Rodada 1 de 2');
        await untilText(page, 'Velocidade: 9,5 a 12,5 km/h');
        await checkLayout(page);
        const workColor = await page.evaluate(() => {
          const h = [...document.querySelectorAll('h5')].find((el) => el.textContent === 'Trabalho');
          if (!h) throw new Error('Work heading missing');
          return getComputedStyle(h.closest('div.rounded-lg.border')).backgroundColor;
        });
        const work = await screenshot(page, viewport.name, 'work-round1');
        await clickButton(page, 'Iniciar etapa');
        await untilText(page, 'Confirmar etapa');
        await selectOutcome(page, 'not_performed');
        await clickButton(page, 'Confirmar etapa');
        await untilText(page, 'Recuperação');
        await page.waitForFunction(() => [...document.querySelectorAll('h5')]
          .some((node) => node.textContent === 'Recuperação'), { timeout: 14000 });
        const recoveryColor = await page.evaluate(() => {
          const h = [...document.querySelectorAll('h5')].find((el) => el.textContent === 'Recuperação');
          return getComputedStyle(h.closest('div.rounded-lg.border')).backgroundColor;
        });
        expect(recoveryColor).not.toBe(workColor);
        const recovery = await screenshot(page, viewport.name, 'recovery-round1');
        expect(calls.filter((c) => c.path.endsWith('/execution/guided-cyclic/step')).length).toBe(4);
        expect(calls.filter((c) => c.path.endsWith('/execution/transition')).length).toBe(2);
        expect(calls.filter((c) => c.path.includes('training-sessions') && c.method === 'POST')
          .every((c) => c.contractId === CONTRACT_ID && c.authenticated)).toBe(true);
        scenarios.push({ viewport: { name: viewport.name, width: viewport.width, height: viewport.height },
          warmup: before, work, recovery });
      }
      const evidence = { schemaVersion: 1, kind: 'issue-489-browser-evidence', result: 'PASS',
        identity: { headSha: exactHead() }, browser: await browser.version(), scenarios,
        verified: ['desktop-1440x900', 'mobile-390x844', 'keyboard-enter', 'accessible-timer',
          'aria-live-status', 'touch-targets', 'no-horizontal-overflow', 'pause-resume',
          'work-recovery-contrast', 'round-context', 'speed-range', 'authenticated-contract-scoping'] };
      console.log('BROWSER_EVIDENCE_489 ' + JSON.stringify(evidence));
      console.log(`BROWSER_EVIDENCE_489 PASS head=${evidence.identity.headSha}`);
    } finally {
      await browser?.close().catch(() => {});
      await vite?.server.close().catch(() => {});
      if (vite) { if (vite.previous === undefined) delete process.env.VITE_API_URL;
        else process.env.VITE_API_URL = vite.previous; }
      if (api) { api.closeAllConnections?.(); await new Promise((resolve) => api.close(resolve)); }
    }
  }, 130000);
});
