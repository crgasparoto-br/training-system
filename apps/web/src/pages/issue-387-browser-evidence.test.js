// @vitest-environment node
import { createHash } from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import { accessSync, constants, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const puppeteer = apiRequire('puppeteer');
const HOST = '127.0.0.1', WEB_PORT = 4350, API_PORT = 4351;
const WEB_ORIGIN = `http://${HOST}:${WEB_PORT}`, API_ORIGIN = `http://${HOST}:${API_PORT}`;
const CONTRACT_ID = 'contract-387';
const user = { id: 'student-387', type: 'aluno', name: 'Aluno Evidencia 387', email: 'aluno.387@example.com' };
const centralStudent = {
  id: 'aluno-central-387',
  userId: 'student-central-user-387',
  professorId: 'professor-387',
  schedulePlan: 'fixed',
  age: 35,
  maxHeartRate: 185,
  restingHeartRate: 58,
  createdAt: '2026-01-10T10:00:00.000Z',
  updatedAt: '2026-09-30T10:00:00.000Z',
  user: {
    email: 'aluno.central.387@example.com',
    profile: { name: 'Aluno Central 387', phone: null, gender: 'male', avatar: null },
  },
};
const professorUser = (canViewTraining = true) => ({
  id: 'professor-user-387',
  type: 'professor',
  name: 'Professora Evidencia 387',
  email: 'professora.387@example.com',
  professor: {
    id: 'professor-387',
    role: 'professor',
    contract: { id: CONTRACT_ID, name: 'Contrato 387', tradeName: 'Contrato 387' },
  },
  accessControl: {
    isMaster: false,
    permissions: [
      { screenKey: 'students.details', blockKey: null, canView: true },
      { screenKey: 'students.details', blockKey: 'students.details.summary', canView: true },
      ...(canViewTraining
        ? [{ screenKey: 'students.details', blockKey: 'students.details.trainingPlans', canView: true }]
        : []),
    ],
  },
});
const TODAY = '2026-09-30';
let authUser = user;

const session = {
  sessionId: 'day-today', workoutTemplateId: 'template-1', trainingPlanId: 'plan-1',
  planName: 'Plano Performance com nome longo para validar responsividade', date: TODAY, dayOfWeek: 3,
  mesocycleNumber: 2, weekNumber: 4, modalities: ['resistance', 'cyclic'], durationMin: 75,
  location: 'Academia principal', method: 'Forca', status: 'not_started',
  origin: { kind: 'consolidated', releasedAt: '2026-09-27T10:00:00.000Z' },
};
const detail = {
  ...session,
  objective: 'Ganhar forca nas pernas com tecnica controlada',
  guidelines: ['Pare se sentir dor.', 'Hidrate-se entre os blocos.'],
  cyclic: { durationMin: 20, distanceKm: 5, heartRate: { min: '120', max: '150' }, speed: null, pace: { min: '6:00', max: '6:30' } },
  blocks: [
    { key: 'warmup', exercises: [{ id: 'ex-0', order: 1, name: 'Mobilidade de quadril', system: null, sets: 2, reps: 10, loadKg: null, intervalSec: 30, notes: null }] },
    { key: 'main', exercises: [{ id: 'ex-1', order: 1, name: 'Agachamento livre', system: 'Series', sets: 4, reps: 10, loadKg: 20, intervalSec: 60, notes: 'Movimento controlado' }] },
  ],
};
const days = ['2026-09-28', '2026-09-29', TODAY, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((date) => ({
  date, isToday: date === TODAY,
  sessions: date === TODAY ? [session] : [],
  pendingReleaseCount: date === '2026-10-02' ? 1 : 0,
}));
const routine = (overrides = {}, audience = 'student') => ({
  alunoId: audience === 'professor' ? centralStudent.id : user.id, audience, referenceDate: TODAY, timeZone: 'America/Sao_Paulo',
  week: { startDate: '2026-09-28', endDate: '2026-10-04' }, days,
  today: { date: TODAY, state: 'released', sessions: [detail] },
  execution: { available: false, reason: 'execution_contract_pending' },
  ...overrides,
});

let mode = 'released';
function identity() { let e = {}; try { if (process.env.GITHUB_EVENT_PATH) e = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')); } catch {} return { headSha: e?.pull_request?.head?.sha || process.env.GITHUB_SHA || process.env.EVIDENCE_HEAD_SHA || 'unknown' }; }
function chromeExecutable() { for (const c of [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean)) { try { accessSync(c, constants.X_OK); return c; } catch {} } return puppeteer.executablePath(); }
function respond(res, status, payload) { res.writeHead(status, { 'Access-Control-Allow-Origin': WEB_ORIGIN, 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Contract-Id', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' }); res.end(payload === undefined ? '' : JSON.stringify(payload)); }
function routinePayload(audience = 'student') {
  const professorOrigin = {
    ...session.origin,
    consolidatedRelease: {
      releaseId: 'release-387',
      assemblyId: 'assembly-387',
      sourceAssemblyVersion: 3,
      releasedAssemblyVersion: 4,
    },
  };
  const audienceSummary = audience === 'professor' ? { ...session, origin: professorOrigin } : session;
  const audienceDetail = audience === 'professor'
    ? {
        ...detail,
        origin: professorOrigin,
        technical: {
          coachGoal: 'Objetivo do professor',
          trainingMethod: 'Forca progressiva',
          trainingDivision: 'AB',
          repReserve: 2,
          vo2maxPct: 80,
        },
      }
    : detail;
  const audienceDays = days.map((d) => (
    d.isToday ? { ...d, sessions: [audienceSummary] } : { ...d }
  ));
  if (mode === 'not_released') {
    return routine({
      days: audienceDays.map((d) => d.isToday ? { ...d, sessions: [], pendingReleaseCount: 1 } : d),
      today: { date: TODAY, state: 'not_released', sessions: [] },
    }, audience);
  }
  if (mode === 'none') {
    return routine({
      days: audienceDays.map((d) => d.isToday ? { ...d, sessions: [], pendingReleaseCount: 0 } : d),
      today: { date: TODAY, state: 'none', sessions: [] },
    }, audience);
  }
  return routine({
    days: audienceDays,
    today: { date: TODAY, state: 'released', sessions: [audienceDetail] },
  }, audience);
}
async function startApi() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url || '/', API_ORIGIN);
    requests.push({ method: req.method, path: u.pathname, search: u.search, contractId: req.headers['x-contract-id'] || null });
    if (req.method === 'OPTIONS') return respond(res, 204);
    if (u.pathname === '/api/v1/auth/me') return respond(res, 200, { data: authUser });
    if (u.pathname === '/api/v1/student/me/summary') return respond(res, 200, { success: true, data: { name: user.name, hasPendingProfileReview: false, nextProfileReviewAt: null, recentNotifications: [] } });
    if (u.pathname === '/api/v1/student/me/training-routine' && req.method === 'GET') {
      if (mode === 'error') return respond(res, 500, { message: 'temporary' });
      if (mode === 'forbidden') return respond(res, 403, { message: 'forbidden' });
      return respond(res, 200, { success: true, data: routinePayload('student') });
    }
    if (u.pathname === `/api/v1/alunos/${centralStudent.id}`) {
      return respond(res, 200, { success: true, data: centralStudent });
    }
    if (u.pathname === `/api/v1/plans/aluno/${centralStudent.id}`) {
      return respond(res, 200, { success: true, data: { plans: [] } });
    }
    if (u.pathname === `/api/v1/alunos/${centralStudent.id}/summary`) {
      return respond(res, 200, { success: true, data: null });
    }
    if (u.pathname === `/api/v1/alunos/${centralStudent.id}/training-routine` && req.method === 'GET') {
      if (mode === 'error') return respond(res, 500, { message: 'temporary' });
      if (mode === 'forbidden') return respond(res, 403, { message: 'forbidden' });
      return respond(res, 200, { success: true, data: routinePayload('professor') });
    }
    return respond(res, 404, { message: 'unexpected', path: u.pathname });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(API_PORT, HOST, resolve); });
  return { server, requests };
}
async function startVite() { const prev = { api: process.env.VITE_API_URL, rollout: process.env.VITE_PRE_REGISTRATION_ENABLED }; process.env.VITE_API_URL = API_ORIGIN; process.env.VITE_PRE_REGISTRATION_ENABLED = 'false'; const { createServer } = await import('vite'); const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { host: HOST, port: WEB_PORT, strictPort: true } }); await server.listen(); return { server, prev }; }
async function stopApi(server) { if (!server) return; server.closeAllConnections?.(); await new Promise((r) => server.close(r)); }
async function stopVite(v) { if (!v) return; await v.server.close(); if (v.prev.api === undefined) delete process.env.VITE_API_URL; else process.env.VITE_API_URL = v.prev.api; if (v.prev.rollout === undefined) delete process.env.VITE_PRE_REGISTRATION_ENABLED; else process.env.VITE_PRE_REGISTRATION_ENABLED = v.prev.rollout; }
async function setSession(page, sessionUser = user, contractId = CONTRACT_ID) { await page.goto(`${WEB_ORIGIN}/login`, { waitUntil: 'domcontentloaded' }); await page.evaluate((u, c) => { localStorage.setItem('token', 'issue-387-browser-token'); localStorage.setItem('user', JSON.stringify(u)); if (c) localStorage.setItem('studentContractId', c); else localStorage.removeItem('studentContractId'); }, sessionUser, contractId); }
async function shot(page, name) {
  const b = await page.screenshot({ fullPage: true });
  if (process.env.EVIDENCE_SCREENSHOT_DIR) { mkdirSync(process.env.EVIDENCE_SCREENSHOT_DIR, { recursive: true }); writeFileSync(path.join(process.env.EVIDENCE_SCREENSHOT_DIR, `${name}.png`), b); }
  return { bytes: b.length, sha256: createHash('sha256').update(b).digest('hex') };
}
async function waitText(page, text) { try { await page.waitForFunction((t) => document.body?.innerText.includes(t), { timeout: 12000 }, text); } catch (error) { console.log("WAIT_DEBUG", text, await page.evaluate(() => location.href + "\n" + document.body?.innerText)); throw error; } }
async function layout(page) { return page.evaluate(() => { const scope = document.querySelector('main') || document.body; return { pathname: location.pathname, innerWidth, scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), buttons: [...scope.querySelectorAll('a,button')].filter((el) => el.getClientRects().length > 0).map((el) => { const r = el.getBoundingClientRect(); return { text: (el.textContent || el.getAttribute('aria-label') || '').trim(), left: r.left, right: r.right }; }) }; }); }
async function assertNoOverflow(page) { const l = await layout(page); expect(l.scrollWidth).toBeLessThanOrEqual(l.innerWidth + 1); for (const b of l.buttons) { expect(b.left, b.text).toBeGreaterThanOrEqual(-1); expect(b.right, b.text).toBeLessThanOrEqual(l.innerWidth + 1); } return l; }
async function clickText(page, text) { await page.evaluate((t) => { const n = [...document.querySelectorAll('a,button')].find((x) => (x.textContent || '').trim() === t); if (!n) throw new Error('not found ' + t); n.click(); }, text); }
async function gotoTraining(page) { await page.goto(`${WEB_ORIGIN}/student/training?contractId=${CONTRACT_ID}`, { waitUntil: 'domcontentloaded' }); }
async function gotoCentral(page) { await page.goto(`${WEB_ORIGIN}/central-do-aluno/${centralStudent.id}`, { waitUntil: 'domcontentloaded' }); }

const suite = process.env.GITHUB_ACTIONS === 'true' || process.env.ISSUE_387_BROWSER_EVIDENCE === '1' ? describe : describe.skip;
suite('Issue #387 - evidencia browser Treino de hoje', () => {
  it('valida entrada pela home, treino liberado, em preparação, sem treino, erro/retry e sem permissão em desktop/mobile', async () => {
    const id = identity(); let api, vite, browser; const scenarios = [];
    try {
      api = await startApi(); vite = await startVite();
      browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const page = await browser.newPage(); await setSession(page);
      for (const viewport of [
        { name: 'desktop-1440x900', width: 1440, height: 900, isMobile: false },
        { name: 'desktop-1366x768', width: 1366, height: 768, isMobile: false },
        { name: 'mobile-390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
      ]) {
        await page.setViewport(viewport);
        mode = 'released';
        await page.goto(`${WEB_ORIGIN}/inicio?contractId=${CONTRACT_ID}`, { waitUntil: 'domcontentloaded' });
        await waitText(page, 'Ver treino de hoje'); const home = await assertNoOverflow(page);
        await clickText(page, 'Ver treino de hoje');
        await waitText(page, 'Agachamento livre'); await waitText(page, 'Rotina da semana');
        const released = await assertNoOverflow(page); expect(released.pathname).toBe('/student/training');
        const disabled = await page.evaluate(() => [...document.querySelectorAll('main button[disabled]')].map((b) => (b.textContent || '').trim()));
        expect(disabled.length).toBeGreaterThan(0);
        const releasedShot = await shot(page, `${viewport.name}-released`);

        mode = 'not_released'; await gotoTraining(page); await waitText(page, 'Seu treino de hoje ainda está sendo preparado');
        const notReleased = await assertNoOverflow(page); const notReleasedShot = await shot(page, `${viewport.name}-not-released`);
        mode = 'none'; await gotoTraining(page); await waitText(page, 'Nenhum treino para hoje'); const none = await assertNoOverflow(page);
        mode = 'error'; await gotoTraining(page); await waitText(page, 'Não foi possível carregar os treinos');
        const errorShot = await shot(page, `${viewport.name}-error`);
        mode = 'released'; await clickText(page, 'Tentar novamente'); await waitText(page, 'Agachamento livre'); const retry = await assertNoOverflow(page);
        mode = 'forbidden'; await gotoTraining(page); await waitText(page, 'Sem permissão para ver os treinos'); const forbidden = await assertNoOverflow(page);

        scenarios.push({ viewport, home, released, notReleased, none, retry, forbidden, disabledExecutionControls: disabled, screenshots: { released: releasedShot, notReleased: notReleasedShot, error: errorShot } });
      }
      const routineRequests = api.requests.filter((r) => r.path === '/api/v1/student/me/training-routine' && r.method !== 'OPTIONS');
      expect(routineRequests.length).toBeGreaterThan(0);
      expect(routineRequests.every((r) => r.method === 'GET' && r.contractId === CONTRACT_ID)).toBe(true);
      expect(api.requests.some((r) => !['GET', 'OPTIONS'].includes(r.method))).toBe(false);
      const evidence = { kind: 'issue-387-browser-evidence', result: 'PASS', identity: id, browser: await browser.version(), viewports: scenarios, verified: ['home-entry', 'today-released', 'not-released', 'no-session', 'retryable-error', 'access-denied', 'execution-controls-disabled', 'read-only-requests', 'x-contract-id', 'no-horizontal-overflow', 'desktop-1440x900', 'desktop-1366x768', 'mobile-390x844'], apiRequests: api.requests };
      console.log(`BROWSER_EVIDENCE_387 ${JSON.stringify(evidence)}`); console.log(`BROWSER_EVIDENCE_387 PASS head=${id.headSha}`);
    } finally { await browser?.close().catch(() => {}); await stopVite(vite).catch(() => {}); await stopApi(api?.server).catch(() => {}); }
  }, 150000);

  it('valida a Central do Aluno do professor com estados, responsividade e teclado', async () => {
    let api, vite, browser;
    try {
      authUser = professorUser(true);
      mode = 'released';
      api = await startApi();
      vite = await startVite();
      browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const page = await browser.newPage();
      await setSession(page, authUser, null);

      for (const viewport of [
        { name: 'central-desktop-1440x900', width: 1440, height: 900 },
        { name: 'central-mobile-390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
      ]) {
        await page.setViewport(viewport);
        mode = 'released';
        await gotoCentral(page);
        await waitText(page, 'Aluno Central 387');
        await waitText(page, 'Objetivo do professor');
        await waitText(page, 'Rotina da semana');
        await assertNoOverflow(page);
        await shot(page, viewport.name);
      }

      await page.setViewport({ width: 1366, height: 768 });
      mode = 'released';
      await gotoCentral(page);
      await waitText(page, 'Rotina da semana');
      const keyboardFocused = await page.evaluate(() => {
        const button = document.querySelector('button[aria-label="Semana anterior"]');
        if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
        button.focus();
        return document.activeElement === button;
      });
      expect(keyboardFocused).toBe(true);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('section[aria-busy="false"]') !== null, { timeout: 5000 });
      expect(api.requests.some((r) => r.path === `/api/v1/alunos/${centralStudent.id}/training-routine` && r.search.includes('date=2026-09-21'))).toBe(true);

      mode = 'not_released';
      await gotoCentral(page);
      await waitText(page, 'Sessão de hoje ainda não liberada');

      mode = 'none';
      await gotoCentral(page);
      await waitText(page, 'Nenhuma sessão liberada para hoje');

      mode = 'error';
      await gotoCentral(page);
      await waitText(page, 'Não foi possível carregar os treinos');
      await waitText(page, 'Aluno Central 387');

      const callsBeforeDenied = api.requests.filter((r) => r.path === `/api/v1/alunos/${centralStudent.id}/training-routine`).length;
      authUser = professorUser(false);
      await setSession(page, authUser, null);
      mode = 'released';
      await gotoCentral(page);
      await waitText(page, 'Sem permissão para ver os treinos');
      const callsAfterDenied = api.requests.filter((r) => r.path === `/api/v1/alunos/${centralStudent.id}/training-routine`).length;
      expect(callsAfterDenied).toBe(callsBeforeDenied);

      expect(api.requests.some((r) => !['GET', 'OPTIONS'].includes(r.method))).toBe(false);
    } finally {
      authUser = user;
      await browser?.close().catch(() => {});
      await stopVite(vite).catch(() => {});
      await stopApi(api?.server).catch(() => {});
    }
  }, 150000);
});
