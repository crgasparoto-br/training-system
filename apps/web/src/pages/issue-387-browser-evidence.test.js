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
  nextSession: { sessionId: 'future-day', date: '2026-10-03', status: 'not_started' },
  lastExecution: { sessionId: 'past-day', date: '2026-09-28', status: 'completed' },
  feedbackContinuity: audience === 'student' ? { state: 'available', pendingCount: 1, registeredCount: 0 } : { state: 'unavailable', pendingCount: 0, registeredCount: 0 },
  ...overrides,
});

// Synthetic, contract-scoped API readings exercise the real student/professor UI.
// Aggregation, revision deduplication and authorization are covered by API tests.
function populatedEvolution(audience, updated) {
  const time = updated ? '2026-09-30T16:30:00.000Z' : '2026-09-30T13:00:00.000Z';
  const revision = updated ? 'feedback-revision-405-v2' : 'feedback-revision-405-v1';
  const samples = [
    { key: 'duration', label: 'Tempo executado', unit: 'min', value: 48, status: 'available', count: 2,
      sourceLabel: 'Execução registrada da sessão' },
    { key: 'distance', label: 'Distância executada', unit: 'km', value: 8, status: 'available', count: 2,
      sourceLabel: 'Execução cíclica registrada' },
    { key: 'pace', label: 'Ritmo registrado', unit: 'min/km', value: 5.5, status: 'available', count: 2,
      sourceLabel: 'Ritmo cíclico registrado' },
    { key: 'tonnage', label: 'Volume resistido registrado', unit: 'kg × rep', value: 1080, status: 'available', count: 2,
      sourceLabel: 'Séries resistidas executadas' },
    { key: 'load', label: 'Carga por exercício e série', unit: 'kg', value: null, status: 'incomparable', count: 2,
      sourceLabel: 'Séries resistidas e planejamento histórico' },
    { key: 'repetitions', label: 'Repetições por exercício e série', unit: 'rep', value: 10, status: 'available', count: 1,
      sourceLabel: 'Séries resistidas e planejamento histórico' },
    { key: 'pse', label: 'PSE registrada', unit: '0–10', value: updated ? 7 : 6, status: 'available', count: 1,
      sourceLabel: 'Revisão vigente do feedback pós-treino' },
    { key: 'psr', label: 'PSR registrada', unit: '0–10', value: 8, status: 'available', count: 1,
      sourceLabel: 'Revisão vigente do feedback pós-treino' },
    { key: 'substitutions', label: 'Substituições executadas', unit: 'ocorrências', value: 1, status: 'available', count: 1,
      sourceLabel: 'Unidades efetivamente substituídas na execução' },
  ];
  const source = (sessionId, sourceId) => ({
    sessionId, releaseId: 'release-405', sourceId, updatedAt: time,
  });
  const seriesData = [
    { key: 'duration', label: 'Tempo executado', unit: 'min', modality: 'cyclic',
      scopeLabel: 'Sessao · corrida continua',
      points: [{ date: '2026-09-28', value: 20 }, { date: '2026-09-29', value: 28 }],
      sources: [source('day-completed', 'duration-1'), source('day-partial', 'duration-2')] },
    { key: 'distance', label: 'Distância executada', unit: 'km', modality: 'cyclic',
      scopeLabel: 'Sessão · corrida contínua',
      points: [{ date: '2026-09-28', value: 3 }, { date: '2026-09-29', value: 5 }],
      sources: [source('day-completed', 'distance-1'), source('day-partial', 'distance-2')] },
    { key: 'pace', label: 'Ritmo registrado', unit: 'min/km', modality: 'cyclic',
      scopeLabel: 'Sessão · corrida contínua',
      points: [{ date: '2026-09-28', value: 5.33 }, { date: '2026-09-29', value: 5.67 }],
      sources: [source('day-completed', 'pace-1'), source('day-partial', 'pace-2')] },
    { key: 'tonnage', label: 'Volume resistido registrado', unit: 'kg x rep', modality: 'resistance',
      scopeLabel: 'Sessao', points: [{ date: '2026-09-28', value: 450 }, { date: '2026-09-29', value: 630 }],
      sources: [source('day-completed', 'tonnage-1'), source('day-partial', 'tonnage-2')] },
    { key: 'load', label: 'Carga por exercício e série', unit: 'kg', modality: 'resistance',
      scopeLabel: 'Agachamento · série 1', points: [{ date: '2026-09-28', value: 30 }],
      sources: [source('day-completed', 'exercise-set-1')] },
    { key: 'load', label: 'Carga por exercício e série', unit: 'kg', modality: 'resistance',
      scopeLabel: 'Leg press · série 1', points: [{ date: '2026-09-29', value: 50 }],
      sources: [source('day-partial', 'exercise-set-2')] },
    { key: 'repetitions', label: 'Repeticoes por exercicio e serie', unit: 'rep', modality: 'resistance',
      scopeLabel: 'Agachamento · serie 1', points: [{ date: '2026-09-28', value: 10 }],
      sources: [source('day-completed', 'repetitions-1')] },
    { key: 'psr', label: 'PSR registrada', unit: '0–10', modality: 'cyclic+resistance',
      scopeLabel: 'Sessao', points: [{ date: '2026-09-29', value: 8 }],
      sources: [source('day-partial', 'feedback-psr-405-v1')] },
    { key: 'substitutions', label: 'Substituicoes executadas', unit: 'ocorrencias', modality: 'cyclic+resistance',
      scopeLabel: 'Sessao', points: [{ date: '2026-09-29', value: 1 }],
      sources: [source('day-partial', 'substitution-405')] },
    { key: 'pse', label: 'PSE registrada', unit: '0–10', modality: 'cyclic+resistance',
      scopeLabel: 'Sessão', points: [{ date: '2026-09-29', value: updated ? 7 : 6 }],
      sources: [source('day-partial', revision)] },
  ];
  return {
    metrics: samples.map(({ count, ...metric }) => ({ ...metric, sampleCount: count, lastSourceUpdateAt: time })),
    series: seriesData.map(({ sources, ...entry }) => ({ ...entry,
      ...(audience === 'professor' ? { technical: { ruleVersion: 'training-evolution-v1', sources } } : {}),
    })),
    ...(audience === 'professor' ? { indicators: samples.map((sample) => ({
      key: sample.key, ruleVersion: 'training-evolution-v1',
      formula: sample.key === 'pse' ? 'mean(latest_revision_pse) within same feedback_scope'
        : 'canonical confirmed observations, grouped by modality and scope',
      source: sample.key === 'pse' ? 'canonical_post_workout_feedback_current_revision'
        : 'captured_plan_and_canonical_session_execution',
      observations: seriesData.filter((entry) => entry.key === sample.key).flatMap((entry) => entry.sources),
    })) } : {}),
  };
}

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
  if (['adherence', 'evolution', 'evolution_updated'].includes(mode)) {
    // A coherent synthetic contract-scoped week: completed, partial and pending.
    // This browser fixture verifies rendering, not the backend calculation.
    const origin = audience === 'professor' ? professorOrigin : session.origin;
    const releasedDays = audienceDays.map((day) => {
      const previous = day.date === '2026-09-28'
        ? { sessionId: 'day-completed', date: day.date, dayOfWeek: 1, status: 'completed' }
        : day.date === '2026-09-29'
          ? { sessionId: 'day-partial', date: day.date, dayOfWeek: 2, status: 'partial' }
          : null;
      return previous ? { ...day, sessions: [{ ...session, ...previous, origin }] } : day;
    });
    const technicalSessions = [
      { sessionId: 'day-completed', status: 'completed' },
      { sessionId: 'day-partial', status: 'partial' },
      { sessionId: 'day-today', status: 'not_started' },
    ];
    return routine({
      days: releasedDays,
      today: { date: TODAY, state: 'released', sessions: [audienceDetail] },
      lastExecution: { sessionId: 'day-completed', date: '2026-09-28', status: 'completed' },
      weeklyEvolution: {
        period: { startDate: '2026-09-28', endDate: '2026-10-04' },
        sourceLabel: 'Montagem Consolidada e execução das sessões',
        counts: {
          prescribedSessions: 3, completedSessions: 1, partialSessions: 1,
          notPerformedSessions: 0, pendingSessions: 1,
        },
        adherence: { status: 'available', value: 33.33, unit: '%' },
        lastSourceUpdateAt: mode === 'evolution_updated' ? '2026-09-30T16:30:00.000Z' : '2026-09-30T13:00:00.000Z',
        ...(['evolution', 'evolution_updated'].includes(mode) ? (() => {
          const result = populatedEvolution(audience, mode === 'evolution_updated');
          return { metrics: result.metrics, series: result.series };
        })() : {}),
        ...(audience === 'professor' ? { technical: {
          ruleVersion: 'weekly-adherence-v1',
          source: 'consolidated_release_and_session_execution',
          formula: 'completedSessions / prescribedSessions * 100',
          sessions: technicalSessions,
          ...(['evolution', 'evolution_updated'].includes(mode)
            ? { indicators: populatedEvolution('professor', mode === 'evolution_updated').indicators } : {}),
        } } : {}),
      },
    }, audience);
  }
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
  const directory = process.env.EVIDENCE_SCREENSHOT_DIR || path.resolve(process.cwd(), '../../artifacts/issue-391');
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, `${name}.png`), b);
  return { bytes: b.length, sha256: createHash('sha256').update(b).digest('hex') };
}
async function captureAccessibility(page, name) {
  const session = await page.target().createCDPSession();
  try {
    await session.send('Accessibility.enable');
    const { nodes } = await session.send('Accessibility.getFullAXTree');
    const directory = process.env.EVIDENCE_SCREENSHOT_DIR || path.resolve(process.cwd(), '../../artifacts/issue-391');
    mkdirSync(directory, { recursive: true });
    const bytes = Buffer.from(JSON.stringify({ identity: identity(), nodes }));
    writeFileSync(path.join(directory, `${name}.accessibility.json`), bytes);
    return { nodes: nodes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  } finally { await session.detach(); }
}
async function waitText(page, text) { try { await page.waitForFunction((t) => document.body?.innerText.toLocaleLowerCase('pt-BR').includes(t.toLocaleLowerCase('pt-BR')), { timeout: 12000 }, text); } catch (error) { console.log("WAIT_DEBUG", text, await page.evaluate(() => location.href + "\n" + document.body?.innerText)); throw error; } }
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
        await waitText(page, 'Próximo treino');
        const studentLayout = await page.evaluate(() => {
          const section = document.querySelector('section[aria-label="Continuidade do treinamento"]');
          if (!section) return null;
          return { text: section.textContent || '', columns: new Set([...section.children].map((node) => Math.round(node.getBoundingClientRect().left))).size };
        });
        expect(studentLayout?.text).toContain('Última execução');
        expect(studentLayout?.text).toContain('Feedback pós-treino');
        expect(studentLayout?.text).toContain('Aderência semanal');
        expect(studentLayout?.columns).toBe(viewport.width < 640 ? 1 : viewport.width < 1280 ? 2 : 4);
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

  it('captura aderência preenchida para aluno e detalhe técnico exclusivo do professor em desktop/mobile', async () => {
    let api, vite, browser;
    try {
      api = await startApi(); vite = await startVite();
      browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const page = await browser.newPage();
      mode = 'adherence';
      await setSession(page);
      for (const viewport of [
        { name: 'desktop-1440x900', width: 1440, height: 900 },
        { name: 'mobile-390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
      ]) {
        await page.setViewport(viewport);
        await gotoTraining(page);
        await waitText(page, '33,33%');
        const studentCard = await page.evaluate(() => {
          const section = document.querySelector('section[aria-label="Continuidade do treinamento"]');
          const card = [...(section?.children || [])].find((node) => node.textContent?.includes('Aderência semanal'));
          return card ? { text: card.innerText, html: card.innerHTML } : null;
        });
        expect(studentCard?.text).toContain('3 previstas · 1 concluída · 1 parcial · 0 não realizadas · 1 pendente');
        expect(studentCard?.text).toContain('Fonte: Montagem Consolidada e execução das sessões');
        expect(studentCard?.text).toContain('Última atualização:');
        expect(studentCard?.text).toContain('Unidade: %');
        expect(studentCard?.html).not.toMatch(/day-completed|weekly-adherence-v1|completedSessions \/ prescribedSessions/);
        await assertNoOverflow(page);
        await shot(page, `${viewport.name}-weekly-adherence-student`);

        authUser = professorUser(true);
        await setSession(page, authUser, null);
        await gotoCentral(page);
        await waitText(page, '33,33%');
        await waitText(page, 'Detalhes técnicos do indicador');
        await page.evaluate(() => {
          const summary = [...document.querySelectorAll('summary')]
            .find((node) => node.textContent?.includes('Detalhes técnicos do indicador'));
          if (!summary) throw new Error('Detalhe técnico da aderência ausente');
          summary.click();
        });
        await waitText(page, 'completedSessions / prescribedSessions * 100');
        await waitText(page, 'day-completed');
        await waitText(page, 'day-partial');
        await assertNoOverflow(page);
        await shot(page, `${viewport.name}-weekly-adherence-professor-expanded`);
        authUser = user;
        await setSession(page);
      }
      const studentResponse = routinePayload('student');
      const professorResponse = routinePayload('professor');
      expect(studentResponse.weeklyEvolution?.technical).toBeUndefined();
      expect(professorResponse.weeklyEvolution?.technical?.sessions).toEqual([
        { sessionId: 'day-completed', status: 'completed' },
        { sessionId: 'day-partial', status: 'partial' },
        { sessionId: 'day-today', status: 'not_started' },
      ]);
      expect(api.requests.filter((r) => r.method !== 'GET' && r.method !== 'OPTIONS')).toEqual([]);
      expect(api.requests.some((r) => r.path === '/api/v1/student/me/training-routine' && r.contractId === CONTRACT_ID)).toBe(true);
      expect(api.requests.some((r) => r.path === `/api/v1/alunos/${centralStudent.id}/training-routine`)).toBe(true);
    } finally {
      authUser = user;
      mode = 'released';
      await browser?.close().catch(() => {});
      await stopVite(vite).catch(() => {});
      await stopApi(api?.server).catch(() => {});
    }
  }, 150000);

  it('issue #405: homologa visualmente series preenchidas, incomparaveis e revisao de feedback em Chrome', async () => {
    let api, vite, browser;
    const viewports = [
      { name: 'desktop-1440x900', width: 1440, height: 900 },
      { name: 'desktop-1366x768', width: 1366, height: 768 },
      { name: 'mobile-390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
    ];
    const shots = [];
    try {
      mode = 'evolution'; authUser = user;
      api = await startApi(); vite = await startVite();
      browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const page = await browser.newPage();
      for (const viewport of viewports) {
        await page.setViewport(viewport);
        await setSession(page, user);
        mode = 'evolution';
        await gotoTraining(page);
        await waitText(page, '8 km');
        await waitText(page, 'Não comparável');
        const student = await page.evaluate(() => {
          const card = document.querySelector('section[aria-label="Indicadores de evolução"]');
          return card?.textContent ?? '';
        });
        expect(student).toContain('6 0–10');
        expect(student).toContain('5:30 min/km');
        expect(student).toContain('Não comparável');
        expect(student).toContain('Unidade: km');
        expect(student).toContain('Fonte:');
        expect(student).not.toContain('Regras técnicas e rastreabilidade');
        expect(student).not.toContain('feedback-revision-405-v1');
        await page.evaluate(() => {
          const el = [...document.querySelectorAll('summary')]
            .find((n) => n.textContent?.includes('Ver medições históricas'));
          if (!el) throw new Error('series details missing');
          el.focus();
        });
        await page.keyboard.press('Enter');
        expect(await page.evaluate(() => [...document.querySelectorAll('summary')]
          .find((el) => el.textContent?.includes('Ver medições históricas'))?.parentElement?.open)).toBe(true);
        await waitText(page, '28/09/2026: 3 km');
        await waitText(page, '29/09/2026: 5 km');
        expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('SUMMARY');
        await assertNoOverflow(page);
        shots.push({ viewport: viewport.name, audience: 'student', state: 'filled',
          accessibility: await captureAccessibility(page, `issue-405-${viewport.name}-student-filled`),
          screenshot: await shot(page, `issue-405-${viewport.name}-student-filled`) });

        // Refresh via the same window-focus handler used after a persisted revision.
        // The fixture changes the canonical current revision, not the number of feedback scopes.
        mode = 'evolution_updated';
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await waitText(page, '7 0–10');
        const after = await page.evaluate(() => document.querySelector('section[aria-label="Indicadores de evolução"]')?.textContent ?? '');
        expect(after).not.toContain('6 0–10');
        const pse = await page.evaluate(() => [...document.querySelectorAll('section[aria-label="Indicadores de evolução"] article')]
          .find((article) => article.querySelector('h3')?.textContent === 'PSE registrada')?.textContent ?? '');
        expect(pse).toContain('1 medição');
        expect(after).not.toContain('feedback-revision-405-v2');
        expect(after).not.toContain('release-405');
        await assertNoOverflow(page);
        shots.push({ viewport: viewport.name, audience: 'student', state: 'feedback-revised',
          screenshot: await shot(page, `issue-405-${viewport.name}-student-feedback-revised`) });

        authUser = professorUser(true);
        mode = 'evolution';
        await setSession(page, authUser, null);
        await gotoCentral(page);
        await waitText(page, '8 km');
        await waitText(page, 'Regras técnicas e rastreabilidade');
        await page.evaluate(() => {
          for (const text of ['Ver medições históricas', 'Regras técnicas e rastreabilidade']) {
            const el = [...document.querySelectorAll('summary')].find((node) => node.textContent?.includes(text));
            if (!el) throw new Error(`summary missing: ${text}`);
            el.click();
          }
          const source = [...document.querySelectorAll('summary')]
            .find((node) => node.textContent?.includes('Origem das medições')
              && node.closest('div')?.textContent?.includes('PSE registrada'));
          if (!source) throw new Error('technical source expander missing');
          source.click();
        });
        await waitText(page, 'training-evolution-v1');
        await waitText(page, 'feedback-revision-405-v1');
        await waitText(page, 'release-405');
        await assertNoOverflow(page);
        shots.push({ viewport: viewport.name, audience: 'professor', state: 'filled-technical',
          accessibility: await captureAccessibility(page, `issue-405-${viewport.name}-professor-technical`),
          screenshot: await shot(page, `issue-405-${viewport.name}-professor-technical`) });

        mode = 'evolution_updated';
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await waitText(page, '7 0–10');
        const professor = await page.evaluate(() => document.querySelector('section[aria-label="Indicadores de evolução"]')?.textContent ?? '');
        expect(professor).not.toContain('feedback-revision-405-v1');
        // The refetch remounts the card: expand the updated sources explicitly.
        await page.evaluate(() => {
          const outer = [...document.querySelectorAll('summary')].find((el) => el.textContent?.includes('Ver medições históricas'));
          if (outer && !outer.parentElement?.open) outer.click();
          const inner = [...document.querySelectorAll('summary')].find((el) => el.textContent?.includes('Origem das medições') && el.closest('div')?.textContent?.includes('PSE'));
          if (inner && !inner.parentElement?.open) inner.click();
        });
        await waitText(page, 'feedback-revision-405-v2');
        await assertNoOverflow(page);
        shots.push({ viewport: viewport.name, audience: 'professor', state: 'feedback-revised',
          screenshot: await shot(page, `issue-405-${viewport.name}-professor-feedback-revised`) });
        authUser = user;
      }
      // API audience projection must not serialize sources into student payloads.
      mode = 'evolution_updated';
      const studentPayload = JSON.stringify(routinePayload('student').weeklyEvolution);
      const professorPayload = JSON.stringify(routinePayload('professor').weeklyEvolution);
      expect(studentPayload).not.toMatch(/feedback-revision-405|release-405|training-evolution-v1|technical/);
      expect(professorPayload).toContain('feedback-revision-405-v2');
      expect(professorPayload).not.toContain('feedback-revision-405-v1');
      expect(api.requests.some((req) => req.path === '/api/v1/student/me/training-routine' && req.contractId === CONTRACT_ID)).toBe(true);
      expect(api.requests.some((req) => req.path === `/api/v1/alunos/${centralStudent.id}/training-routine`)).toBe(true);
      expect(api.requests.filter((req) => !['GET', 'OPTIONS'].includes(req.method))).toEqual([]);
      const evidence = {
        schemaVersion: 1, kind: 'issue-405-filled-browser-evidence', result: 'PASS',
        identity: identity(), browser: await browser.version(), syntheticApiFixture: true,
        scenarios: shots,
        verified: ['student-professor', 'filled-series', 'historical-comparable-distance',
          'incomparable-resistance', 'technical-only-professor', 'keyboard-details',
          'feedback-refetch-without-duplicate', 'no-overflow', 'contract-header'],
      };
      const dir = process.env.EVIDENCE_SCREENSHOT_DIR || path.resolve(process.cwd(), '../../artifacts/issue-391');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'issue-405-filled-evolution-evidence.json'), JSON.stringify(evidence, null, 2));
      console.log(`BROWSER_EVIDENCE_405 ${JSON.stringify(evidence)}`);
    } finally {
      authUser = user; mode = 'released';
      await browser?.close().catch(() => {});
      await stopVite(vite).catch(() => {});
      await stopApi(api?.server).catch(() => {});
    }
  }, 180000);

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
        await waitText(page, 'Próximo treino');
        const professorLayout = await page.evaluate(() => {
          const section = document.querySelector('section[aria-label="Continuidade do treinamento"]');
          if (!section) return null;
          return { text: section.textContent || '', columns: new Set([...section.children].map((node) => Math.round(node.getBoundingClientRect().left))).size };
        });
        expect(professorLayout?.text).toContain('Feedback indisponível');
        expect(professorLayout?.text).toContain('Aderência semanal');
        expect(professorLayout?.columns).toBe(viewport.width < 640 ? 1 : viewport.width < 1280 ? 2 : 4);
        await assertNoOverflow(page);
        await shot(page, viewport.name);
        await page.click('#aluno-details-menu-selectedStudent');
        await page.waitForSelector('#aluno-details-tab-treinos', { visible: true });
        await page.click('#aluno-details-tab-treinos');
        await waitText(page, 'Rotina da semana');
        await assertNoOverflow(page);
        await shot(page, `${viewport.name}-treinos-tab`);
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
