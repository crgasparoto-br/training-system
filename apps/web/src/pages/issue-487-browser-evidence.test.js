// @vitest-environment node
import { createHash } from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import { accessSync, constants, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const puppeteer = apiRequire('puppeteer');
const HOST = '127.0.0.1', WEB_PORT = 4870, API_PORT = 4871;
const WEB_ORIGIN = `http://${HOST}:${WEB_PORT}`, API_ORIGIN = `http://${HOST}:${API_PORT}`;
const CONTRACT_ID = 'contract-487';
const TODAY = '2026-10-28';
const user = { id: 'student-487', type: 'aluno', name: 'Aluno Evidência 487', email: 'aluno.487@example.com' };
let executionVersion = 1;
let completed = 0;

const execution = () => ({
  sessionId: 'day-487', status: 'in_progress', version: executionVersion,
  startedAt: '2026-10-28T18:00:00.000Z', finishedAt: null,
  currentPauseStartedAt: null, pausedDurationMs: 0, interruptionReason: null,
  origin: { releaseId: 'release-487', workoutTemplateId: 'template-487', trainingPlanId: 'plan-487' },
  sessionValues: {}, items: [],
});
const summary = () => ({
  sessionId: 'day-487', workoutTemplateId: 'template-487', trainingPlanId: 'plan-487',
  planName: 'Plano força guiada', date: TODAY, dayOfWeek: 3, mesocycleNumber: 1, weekNumber: 4,
  modalities: ['resistance'], durationMin: 55, location: 'Academia', method: 'Força',
  status: 'in_progress', origin: { kind: 'consolidated', releasedAt: '2026-10-28T10:00:00.000Z' },
});
const detail = () => ({
  ...summary(), execution: execution(), objective: 'Executar o bi-set com técnica controlada',
  guidelines: ['Mantenha a técnica prevista.'], cyclic: null,
  blocks: [{
    key: 'main',
    exercises: [
      { id: 'exercise-a', order: 1, name: 'Agachamento', system: null, sets: 2, reps: 8, loadKg: 40, intervalSec: 15, notes: null },
      { id: 'exercise-b', order: 2, name: 'Remada', system: null, sets: 2, reps: 10, loadKg: null, intervalSec: 75, notes: null },
    ],
  }],
});
const routine = () => ({
  alunoId: user.id, audience: 'student', referenceDate: TODAY, timeZone: 'America/Sao_Paulo',
  week: { startDate: '2026-10-26', endDate: '2026-11-01' },
  days: [
    { date: TODAY, isToday: true, sessions: [summary()], pendingReleaseCount: 0 },
  ],
  today: { date: TODAY, state: 'released', sessions: [detail()] },
  execution: { available: true, reason: null },
  nextSession: null,
  lastExecution: null,
  feedbackContinuity: { state: 'available', pendingCount: 0, registeredCount: 0 },
});
const unit = (which, round) => {
  const isA = which === 'a';
  return {
    plannedUnitId: isA ? 'exercise-a' : 'exercise-b',
    plannedSetId: `set-${which}-${round}`,
    setNumber: round,
    exerciseName: isA ? 'Agachamento' : 'Remada',
    videoUrl: null, section: 'principal', blockKind: 'principal',
    blockPosition: 1, setPosition: round, exerciseSetTotal: 2,
    groupId: 'group-487', groupType: 'bi_set', groupPosition: isA ? 1 : 2,
    groupSize: 2, roundNumber: round, roundTotal: 2,
    repsMin: isA ? 8 : 10, repsMax: isA ? 8 : 12,
    loadKg: isA ? 40 : null, loadPercent: null, rir: 2, rpe: 8,
    tempo: '3-1-1', restSec: isA ? 60 : 75, notes: isA ? 'Controle a descida' : null,
  };
};
function guided() {
  const sequence = [unit('a', 1), unit('b', 1), unit('a', 2), unit('b', 2)];
  return {
    sessionId: 'day-487', status: 'in_progress', version: executionVersion,
    availability: 'available', completed, total: 4,
    current: sequence[completed] ?? null, next: sequence[completed + 1] ?? null,
  };
}
function identity() {
  let event = {};
  try { if (process.env.GITHUB_EVENT_PATH) event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')); } catch {}
  return { headSha: event?.pull_request?.head?.sha || process.env.VERIFICATION_HEAD_SHA || process.env.GITHUB_SHA || 'unknown' };
}
function chromeExecutable() {
  for (const candidate of [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].filter(Boolean)) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {}
  }
  return puppeteer.executablePath();
}
function respond(res, status, payload) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': WEB_ORIGIN,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Contract-Id',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(payload === undefined ? '' : JSON.stringify(payload));
}
async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
async function startApi() {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', API_ORIGIN);
    if (req.method === 'OPTIONS') return respond(res, 204);
    requests.push({ method: req.method, path: url.pathname, contractId: req.headers['x-contract-id'] || null });
    if (url.pathname === '/api/v1/auth/me') return respond(res, 200, { data: user });
    if (url.pathname === '/api/v1/student/me/summary') {
      return respond(res, 200, { success: true, data: { name: user.name, hasPendingProfileReview: false, nextProfileReviewAt: null, recentNotifications: [] } });
    }
    if (url.pathname === '/api/v1/student/me/training-routine' && req.method === 'GET') {
      return respond(res, 200, { success: true, data: routine() });
    }
    if (url.pathname === '/api/v1/student/me/training-sessions/day-487/execution/guided' && req.method === 'GET') {
      return respond(res, 200, { success: true, data: guided() });
    }
    if (url.pathname === '/api/v1/student/me/training-sessions/day-487/execution/guided/complete' && req.method === 'POST') {
      const body = await readJson(req);
      const current = guided().current;
      if (!current || body.expectedVersion !== executionVersion
        || body.plannedSetId !== current.plannedSetId || body.plannedUnitId !== current.plannedUnitId) {
        return respond(res, 409, { error: 'conflict' });
      }
      completed += 1;
      executionVersion += 1;
      return respond(res, 200, { success: true, data: guided() });
    }
    return respond(res, 404, { message: 'unexpected', path: url.pathname });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(API_PORT, HOST, resolve); });
  return { server, requests };
}
async function startVite() {
  const previous = {
    api: process.env.VITE_API_URL,
    rollout: process.env.VITE_PRE_REGISTRATION_ENABLED,
  };
  process.env.VITE_API_URL = API_ORIGIN;
  process.env.VITE_PRE_REGISTRATION_ENABLED = 'false';
  const { createServer } = await import('vite');
  const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { host: HOST, port: WEB_PORT, strictPort: true } });
  await server.listen();
  return { server, previous };
}
async function stopApi(server) { if (!server) return; server.closeAllConnections?.(); await new Promise((resolve) => server.close(resolve)); }
async function stopVite(value) {
  if (!value) return;
  await value.server.close();
  if (value.previous.api === undefined) delete process.env.VITE_API_URL;
  else process.env.VITE_API_URL = value.previous.api;
  if (value.previous.rollout === undefined) delete process.env.VITE_PRE_REGISTRATION_ENABLED;
  else process.env.VITE_PRE_REGISTRATION_ENABLED = value.previous.rollout;
}
async function setSession(page) {
  await page.goto(`${WEB_ORIGIN}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((u, contractId) => {
    localStorage.setItem('token', 'issue-487-browser-token');
    localStorage.setItem('user', JSON.stringify(u));
    localStorage.setItem('studentContractId', contractId);
  }, user, CONTRACT_ID);
}
async function waitText(page, text) {
  try {
    await page.waitForFunction(
      (value) => document.body?.innerText.toLocaleLowerCase('pt-BR').includes(value.toLocaleLowerCase('pt-BR')),
      { timeout: 12000 },
      text,
    );
  } catch (error) {
    console.log('WAIT_DEBUG_487', text, await page.evaluate(() => location.href + '\n' + document.body?.innerText));
    throw error;
  }
}
async function assertNoOverflow(page) {
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
}
async function shot(page, name) {
  const bytes = await page.screenshot({ fullPage: true });
  const directory = path.resolve(process.cwd(), '../../artifacts/issue-487');
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, `${name}.png`), bytes);
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

const suite = process.env.GITHUB_ACTIONS === 'true' || process.env.ISSUE_487_BROWSER_EVIDENCE === '1' ? describe : describe.skip;
suite('Issue #487 - evidência browser execução resistida guiada', () => {
  it('valida bi-set guiado, teclado e responsividade em desktop/mobile sem descanso final precoce', async () => {
    executionVersion = 1; completed = 0;
    let api, vite, browser;
    const scenarios = [];
    try {
      api = await startApi(); vite = await startVite();
      browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const page = await browser.newPage();
      await setSession(page);
      for (const viewport of [
        { name: 'desktop-1440x900', width: 1440, height: 900 },
        { name: 'mobile-390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
      ]) {
        executionVersion = 1; completed = 0;
        await page.setViewport(viewport);
        await page.goto(`${WEB_ORIGIN}/student/training?contractId=${CONTRACT_ID}`, { waitUntil: 'domcontentloaded' });
        await waitText(page, 'Passo a passo');
        await waitText(page, 'Bi-set · rodada 1 de 2 · item 1 de 2');
        await waitText(page, 'Agachamento');
        await assertNoOverflow(page);
        const focusable = await page.evaluate(() => {
          const label = [...document.querySelectorAll('label')]
            .find((item) => item.textContent?.includes('Repetições realizadas'));
          const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
          const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Concluir série'));
          if (!(input instanceof HTMLInputElement) || input.disabled
            || !(button instanceof HTMLButtonElement) || button.disabled) return false;
          input.focus();
          const inputFocused = document.activeElement === input;
          button.focus();
          return inputFocused && document.activeElement === button;
        });
        expect(focusable).toBe(true);
        await page.evaluate(() => {
          const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Ver ficha completa'));
          if (!(button instanceof HTMLButtonElement)) throw new Error('Ver ficha completa não encontrado');
          button.click();
        });
        await waitText(page, 'Continuar execução guiada');
        await page.evaluate(() => {
          const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Continuar execução guiada'));
          if (!(button instanceof HTMLButtonElement)) throw new Error('Continuar execução guiada não encontrado');
          button.click();
        });
        await waitText(page, 'Bi-set · rodada 1 de 2 · item 1 de 2');
        const before = await shot(page, `${viewport.name}-group-round1-item1`);
        await page.evaluate(() => {
          const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Concluir série'));
          if (!(button instanceof HTMLButtonElement)) throw new Error('Concluir série não encontrado');
          button.click();
        });
        await waitText(page, 'Remada');
        await waitText(page, 'Bi-set · rodada 1 de 2 · item 2 de 2');
        const text = await page.evaluate(() => document.body?.innerText || '');
        expect(text).not.toContain('Descanso prescrito após a série anterior');
        expect(text).toContain('Próximo: Agachamento, rodada 2');
        await assertNoOverflow(page);
        const after = await shot(page, `${viewport.name}-group-round1-item2`);
        scenarios.push({ viewport, before, after });
      }
      const guidedWrites = api.requests.filter((request) => request.path.endsWith('/execution/guided/complete'));
      expect(guidedWrites).toHaveLength(2);
      expect(guidedWrites.every((request) => request.method === 'POST' && request.contractId === CONTRACT_ID)).toBe(true);
      const evidence = {
        kind: 'issue-487-browser-evidence', result: 'PASS', identity: identity(),
        browser: await browser.version(), scenarios,
        verified: ['desktop-1440x900', 'mobile-390x844', 'keyboard-focus', 'no-horizontal-overflow',
          'one-unit-at-a-time', 'group-round-context', 'overview-return-position', 'next-participant-before-final-rest', 'x-contract-id'],
      };
      console.log(`BROWSER_EVIDENCE_487 ${JSON.stringify(evidence)}`);
      console.log(`BROWSER_EVIDENCE_487 PASS head=${evidence.identity.headSha}`);
    } finally {
      await browser?.close().catch(() => {});
      await stopVite(vite).catch(() => {});
      await stopApi(api?.server).catch(() => {});
    }
  }, 150000);
});
