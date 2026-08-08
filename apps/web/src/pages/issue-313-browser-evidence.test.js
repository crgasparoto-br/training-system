import { createHash } from 'node:crypto';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const WORKER_FLAG = '--browser-evidence-worker';
const HOST = '127.0.0.1';
const WEB_PORT = 4320;
const API_PORT = 4321;
const WEB_ORIGIN = `http://${HOST}:${WEB_PORT}`;
const API_ORIGIN = `http://${HOST}:${API_PORT}`;
const ALUNO_ID = 'lead-313-browser-evidence';
const DESTINATION_PATH = '/protocolo-avaliacao-fisica/prontuario-entrevista-acompanhamento';
const OP_TIMEOUT = 10000;
const NORMALIZE_JS = `(v)=>(v||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/\\s+/g,' ').trim()`;

const user = {
  id: 'professor-313-browser-evidence',
  type: 'professor',
  name: 'Profissional Evidencia 313',
  email: 'professor.313@example.com',
  professor: {
    id: 'professor-313',
    role: 'master',
    collaboratorFunction: {
      id: 'function-master-313',
      code: 'manager',
      name: 'Gestor',
      accessPermissions: [],
    },
  },
  accessControl: { isMaster: true, permissions: [] },
};

const lead = {
  id: ALUNO_ID,
  name: 'Lead Pre-Matricula 313',
  contacts: {
    phone: '15999990000',
    email: 'lead.313@example.com',
    cpf: '52998224725',
    masked: false,
  },
  origin: 'Indicacao',
  status: 'PRE_REGISTRATION_COMPLETED',
  responsible: { id: 'professor-313', name: 'Profissional Evidencia 313' },
  createdAt: '2026-08-07T12:00:00.000Z',
  updatedAt: '2026-08-08T10:00:00.000Z',
  lastActivityAt: '2026-08-08T10:00:00.000Z',
  inviteAllowedActions: { canGenerate: false, canRegenerate: false, canRevoke: false },
  progress: {
    basicRegistration: 'COMPLETED',
    healthModuleStatus: 'COMPLETED',
    parqModuleStatus: 'COMPLETED',
    parqRequiresProfessionalReview: true,
    completedFields: 8,
    totalFields: 8,
    missingRequiredFields: [],
    startedAt: '2026-08-07T12:30:00.000Z',
    lastSavedAt: '2026-08-08T09:55:00.000Z',
    completedAt: '2026-08-08T10:00:00.000Z',
  },
  nextAction: {
    code: 'REVIEW_REGISTRATION',
    label: 'Revisar pre-matricula',
    description: 'Revisar dados antes da matricula.',
    enabled: true,
  },
  allowedActions: {
    canEditCommercialData: true,
    canGenerateInvite: false,
    canRegenerateInvite: false,
    canRevokeInvite: false,
    canReview: true,
    canValidateGuardianAuthorization: false,
    canDiscard: true,
    canReopen: false,
    canConvert: false,
    canOpenStudentCentral: false,
  },
  commercial: { notes: 'Fixture browser da issue 313', unit: 'Unidade Centro' },
  lifecycleProgress: {
    startedAt: '2026-08-07T12:30:00.000Z',
    lastSavedAt: '2026-08-08T09:55:00.000Z',
    completedAt: '2026-08-08T10:00:00.000Z',
    privacyAcceptedAt: '2026-08-07T12:25:00.000Z',
    privacyNoticeVersion: '2026-08',
  },
  pendencies: [],
  history: [],
};

const review = {
  alunoId: ALUNO_ID,
  status: 'PRE_REGISTRATION_COMPLETED',
  recordVersion: 4,
  fingerprint: 'issue-313-browser-fingerprint',
  classification: 'NONE',
  candidates: [],
  restrictedCandidateCount: 0,
  canConfirmDifferentPeople: false,
  canUseExistingCanonical: false,
  canMarkReady: false,
  canConfirmEnrollment: false,
  health: {
    healthModuleStatus: 'COMPLETED',
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

const filledIntake = {
  alunoId: ALUNO_ID,
  source: { type: 'student', reference: `onboarding:${ALUNO_ID}` },
  status: 'COMPLETED',
  version: 3,
  currentStep: 'review',
  assessmentDate: '2026-08-07T12:00:00.000Z',
  questionnaires: { american: { chestPain: 'Nao' } },
  clinicalHistory: {
    medicalHistory: 'Historico canonico da Anamnese 313',
    trainingBackground: 'Corrida recreativa',
  },
  medications: { currentMedications: 'Nenhuma' },
  injuries: { injuriesHistory: 'Entorse antiga' },
  allergies: { notes: 'Sem alergias conhecidas' },
  rawFormResponses: { mainGoal: 'Condicionamento' },
  observations: 'Resposta original somente leitura',
};

const emptyIntake = {
  alunoId: ALUNO_ID,
  source: { type: 'student', reference: ALUNO_ID },
  status: 'NOT_STARTED',
  questionnaires: {},
  clinicalHistory: null,
  medications: null,
  injuries: null,
  allergies: null,
  rawFormResponses: null,
  observations: null,
};

const parqSubmission = {
  id: 'parq-313',
  alunoId: ALUNO_ID,
  contractId: 'contract-313',
  catalogVersion: 'parq-2026-01',
  submittedAt: '2026-08-08T09:00:00.000Z',
  responses: { q1: true, q2: false },
  positiveItems: [
    { key: 'q1', itemKey: 'q1', label: 'Questao positiva de evidencia', itemLabel: 'Questao positiva de evidencia' },
  ],
  positiveCount: 1,
  declarationAccepted: true,
  sourceType: 'student',
};

const stage = (value) => console.log(`BROWSER_EVIDENCE_313_STAGE ${value}`);

function bounded(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function githubIdentity() {
  let event = {};
  try {
    if (process.env.GITHUB_EVENT_PATH) event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  } catch {}
  return {
    headSha: event?.pull_request?.head?.sha || process.env.GITHUB_SHA || 'unknown',
    baseSha: event?.pull_request?.base?.sha || null,
    mergePreviewSha: process.env.GITHUB_SHA || null,
  };
}

function respond(res, status, payload) {
  const headers = {
    'Access-Control-Allow-Origin': WEB_ORIGIN,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-store',
  };
  if (payload !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
  res.writeHead(status, headers);
  res.end(payload === undefined ? '' : JSON.stringify(payload));
}

function clinicalFixture(mode) {
  const hasAnamnesis = mode === 'both' || mode === 'anamnesis';
  const hasParq = mode === 'both' || mode === 'parq';
  const submissions = hasParq ? [parqSubmission] : [];
  return {
    intake: hasAnamnesis ? filledIntake : emptyIntake,
    submissions,
    overview: {
      records: [],
      currentRecord: null,
      latestParqSubmission: submissions[0] || null,
      parqSubmissions: submissions,
      parqState: null,
      parqLegacy: null,
    },
  };
}

async function startApi() {
  const requests = [];
  const state = { mode: 'both' };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', API_ORIGIN);
    requests.push(`${req.method} ${url.pathname}${url.search}`);
    if (req.method === 'OPTIONS') return respond(res, 204);
    if (req.method !== 'GET') return respond(res, 405, { error: 'Method not allowed' });

    if (url.pathname === '/api/v1/pre-registration/availability') return respond(res, 204);
    if (url.pathname === '/api/v1/auth/me') return respond(res, 200, { data: user });
    if (url.pathname === `/api/v1/pre-registration-admin/leads/${ALUNO_ID}`) {
      return respond(res, 200, { success: true, data: lead });
    }
    if (url.pathname === `/api/v1/pre-registration-admin/leads/${ALUNO_ID}/enrollment-review`) {
      return respond(res, 200, { success: true, data: review });
    }
    if (url.pathname === '/api/v1/alunos') {
      return respond(res, 200, {
        success: true,
        data: { alunos: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } },
      });
    }

    const fixture = clinicalFixture(state.mode);
    if (url.pathname === `/api/v1/prontuario/alunos/${ALUNO_ID}/clinical-identity`) {
      return respond(res, 200, {
        success: true,
        data: { alunoId: ALUNO_ID, name: lead.name, email: lead.contacts.email },
      });
    }
    if (url.pathname === `/api/v1/prontuario/alunos/${ALUNO_ID}/initial-anamnesis`) {
      return respond(res, 200, { success: true, data: fixture.intake });
    }
    if (url.pathname === `/api/v1/prontuario/alunos/${ALUNO_ID}/parq-submissions`) {
      return respond(res, 200, { success: true, data: fixture.submissions });
    }
    if (url.pathname === `/api/v1/prontuario/alunos/${ALUNO_ID}`) {
      return respond(res, 200, { success: true, data: fixture.overview });
    }
    return respond(res, 404, { error: 'Unexpected issue 313 browser evidence request', path: url.pathname });
  });
  await bounded(
    new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(API_PORT, HOST, resolve);
    }),
    OP_TIMEOUT,
    'fake API startup'
  );
  return { server, requests, state };
}

async function stopApi(server) {
  if (!server) return;
  server.closeAllConnections?.();
  await bounded(new Promise((resolve) => server.close(resolve)), 5000, 'fake API shutdown').catch(() => {});
}

async function startVite() {
  const previous = { api: process.env.VITE_API_URL, rollout: process.env.VITE_PRE_REGISTRATION_ENABLED };
  process.env.VITE_API_URL = API_ORIGIN;
  process.env.VITE_PRE_REGISTRATION_ENABLED = 'true';
  const { createServer } = await import('vite');
  const server = await bounded(
    createServer({
      root: process.cwd(),
      logLevel: 'error',
      server: { host: HOST, port: WEB_PORT, strictPort: true },
    }),
    OP_TIMEOUT,
    'Vite createServer'
  );
  await bounded(server.listen(), OP_TIMEOUT, 'Vite listen');
  return { server, previous };
}

async function stopVite(vite) {
  if (!vite) return;
  await bounded(vite.server.close(), 5000, 'Vite shutdown').catch(() => {});
  if (vite.previous.api === undefined) delete process.env.VITE_API_URL;
  else process.env.VITE_API_URL = vite.previous.api;
  if (vite.previous.rollout === undefined) delete process.env.VITE_PRE_REGISTRATION_ENABLED;
  else process.env.VITE_PRE_REGISTRATION_ENABLED = vite.previous.rollout;
}

async function waitHttp(url, ms = 20000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).status < 500) return;
    } catch {}
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  throw new Error(`Chrome/Chromium not found: ${candidates.join(', ')}`);
}

async function stopChild(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit').catch(() => []);
  child.kill(signal);
  await Promise.race([exited, delay(2000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([once(child, 'exit').catch(() => []), delay(2000)]);
  }
}

async function startChrome() {
  const profile = mkdtempSync(path.join(os.tmpdir(), 'issue-313-browser-'));
  const executable = chromeExecutable();
  const child = spawn(
    executable,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--window-size=1366,768',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-4000);
  });
  const activePort = path.join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + 15000;
  let port;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Chrome exited before CDP: ${stderr || child.exitCode}`);
    }
    try {
      port = Number(readFileSync(activePort, 'utf8').trim().split(/\r?\n/)[0]);
      if (port) break;
    } catch {}
    await delay(100);
  }
  if (!port) throw new Error(`Chrome did not expose DevToolsActivePort. ${stderr}`);
  const targets = await bounded(
    fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) }).then((r) => r.json()),
    4000,
    'Chrome target discovery'
  );
  const page = targets.find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('Chrome page target not found');
  return { child, profile, port, url: page.webSocketDebuggerUrl, executable };
}

class Cdp {
  async connect(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      const pending = message.id ? this.pending.get(message.id) : null;
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`CDP ${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result || {});
    };
    const rejectPending = (reason) => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`${pending.method} aborted: ${reason}`));
      }
      this.pending.clear();
    };
    this.ws.onclose = () => rejectPending('socket closed');
    this.ws.onerror = () => rejectPending('socket error');
    await bounded(
      new Promise((resolve, reject) => {
        if (this.ws.readyState === WebSocket.OPEN) return resolve();
        this.ws.addEventListener('open', resolve, { once: true });
        this.ws.addEventListener('error', () => reject(new Error('CDP websocket connection failed')), { once: true });
      }),
      OP_TIMEOUT,
      'CDP websocket connect'
    );
  }

  send(method, params = {}, ms = OP_TIMEOUT) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`CDP socket is not open for ${method}`));
    }
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${ms}ms`));
      }, ms);
      this.pending.set(id, { resolve, reject, timer, method });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  close() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.ws.close();
    }
  }
}

async function evaluate(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'Browser evaluation failed');
  return response.result?.value;
}

async function wait(cdp, expression, label, ms = 12000) {
  const deadline = Date.now() + ms;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await evaluate(cdp, expression);
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(
    `Timed out waiting for ${label}${lastError instanceof Error ? `; last error: ${lastError.message}` : ''}`
  );
}

async function navigate(cdp, url) {
  await cdp.send('Page.navigate', { url });
  await wait(cdp, `location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`, url);
}

const text = (cdp, value) =>
  wait(
    cdp,
    `(() => { const n=${NORMALIZE_JS}; return n(document.body?.innerText).includes(n(${JSON.stringify(value)})); })()`,
    `text ${value}`
  );

async function click(cdp, label) {
  const ok = await evaluate(
    cdp,
    `(() => { const n=${NORMALIZE_JS}; const expected=n(${JSON.stringify(label)}); const el=[...document.querySelectorAll('a,button')].find((x)=>n(x.textContent)===expected); if(!el)return false; el.click(); return true; })()`
  );
  if (!ok) throw new Error(`Interactive element not found: ${label}`);
}

async function layout(cdp, labels) {
  const value = await evaluate(
    cdp,
    `(() => { const n=${NORMALIZE_JS}; const labels=${JSON.stringify(labels)}; const nodes=[...document.querySelectorAll('a,button')]; return { pathname:location.pathname, search:location.search, innerWidth, innerHeight, scrollWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth), elements:labels.map((label)=>{const expected=n(label); const node=nodes.find((x)=>n(x.textContent)===expected); if(!node)return {label,found:false}; const r=node.getBoundingClientRect(); const s=getComputedStyle(node); return {label,found:true,left:r.left,right:r.right,display:s.display,visibility:s.visibility};})}; })()`
  );
  if (value.scrollWidth > value.innerWidth + 1) {
    throw new Error(`Horizontal overflow: ${value.scrollWidth} > ${value.innerWidth}`);
  }
  for (const el of value.elements) {
    if (!el.found || el.display === 'none' || el.visibility === 'hidden') {
      throw new Error(`Interactive element not visible: ${el.label}`);
    }
    if (el.left < -1 || el.right > value.innerWidth + 1) {
      throw new Error(`Interactive element outside viewport: ${el.label}`);
    }
  }
  return value;
}

async function screenshotHash(cdp) {
  const capture = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const bytes = Buffer.from(capture.data, 'base64');
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function assertReadOnlyOriginalAnswers(cdp) {
  const result = await evaluate(
    cdp,
    `(() => { const controls=[...document.querySelectorAll('input,textarea,select')]; const forbidden=['Historico canonico da Anamnese 313','Resposta original somente leitura','Condicionamento']; const editable=controls.filter((node)=>forbidden.some((value)=>String(node.value||'').includes(value))).map((node)=>({tag:node.tagName,value:node.value})); const n=${NORMALIZE_JS}; const actions=[...document.querySelectorAll('button,a')].map((node)=>n(node.textContent)).filter(Boolean); return {editable,hasEditAction:actions.some((value)=>/Editar Anamnese|Salvar Anamnese|Alterar Anamnese/i.test(value))}; })()`
  );
  if (result.editable.length || result.hasEditAction) {
    throw new Error(`Original Anamnese is editable: ${JSON.stringify(result)}`);
  }
  return result;
}

async function assertClinicalState(cdp, mode) {
  await text(cdp, lead.name);
  await text(cdp, 'Anamnese Inicial');
  await text(cdp, 'Acompanhamento dos itens positivos do PAR-Q');

  if (mode === 'both') {
    await text(cdp, 'Historico canonico da Anamnese 313');
    await text(cdp, 'PAR-Q preenchido disponivel para consulta');
  } else if (mode === 'anamnesis') {
    await text(cdp, 'Historico canonico da Anamnese 313');
    await text(cdp, 'PAR-Q ainda nao possui conteudo preenchido');
  } else if (mode === 'parq') {
    await text(cdp, 'Anamnese Inicial ainda nao possui conteudo preenchido');
    await text(cdp, 'PAR-Q preenchido disponivel para consulta');
  } else if (mode === 'empty') {
    await text(cdp, 'Ainda nao existem Anamnese ou PAR-Q preenchidos para esta pre-matricula');
  } else {
    throw new Error(`Unknown clinical mode: ${mode}`);
  }

  const route = await evaluate(cdp, `({ pathname: location.pathname, search: location.search })`);
  if (route.pathname !== DESTINATION_PATH || route.search !== `?alunoId=${ALUNO_ID}`) {
    throw new Error(`Canonical alunoId was not preserved: ${JSON.stringify(route)}`);
  }
  return {
    mode,
    route,
    readOnly: await assertReadOnlyOriginalAnswers(cdp),
    screenshot: await screenshotHash(cdp),
  };
}

async function enterClinicalAreaFromPreRegistration(cdp, api, viewport) {
  stage(`${viewport.name}:origin:start`);
  api.state.mode = 'both';
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
  await navigate(cdp, `${WEB_ORIGIN}/login`);
  await evaluate(
    cdp,
    `localStorage.setItem('token','issue-313-browser-token'); localStorage.setItem('user',${JSON.stringify(JSON.stringify(user))}); true`
  );
  await navigate(cdp, `${WEB_ORIGIN}/pre-matriculas/${ALUNO_ID}`);
  await text(cdp, 'Abrir area clinica');
  const originLayout = await layout(cdp, ['Abrir area clinica']);
  const originShot = await screenshotHash(cdp);
  await click(cdp, 'Abrir area clinica');
  await wait(
    cdp,
    `location.pathname === ${JSON.stringify(DESTINATION_PATH)} && location.search === ${JSON.stringify(`?alunoId=${ALUNO_ID}`)}`,
    'clinical destination with canonical alunoId'
  );
  const clinical = await assertClinicalState(cdp, 'both');
  const clinicalLayout = await layout(cdp, ['Voltar a pre-matricula']);
  await click(cdp, 'Voltar a pre-matricula');
  await wait(
    cdp,
    `location.pathname === ${JSON.stringify(`/pre-matriculas/${ALUNO_ID}`)}`,
    'return to pre-registration'
  );
  stage(`${viewport.name}:origin:pass`);
  return { viewport, originLayout, originShot, clinicalLayout, clinical };
}

async function directClinicalStates(cdp, api) {
  const results = [];
  for (const mode of ['anamnesis', 'parq', 'empty']) {
    stage(`desktop:${mode}:start`);
    api.state.mode = mode;
    await navigate(cdp, `${WEB_ORIGIN}${DESTINATION_PATH}?alunoId=${ALUNO_ID}`);
    results.push(await assertClinicalState(cdp, mode));
    stage(`desktop:${mode}:pass`);
  }
  return results;
}

async function runBrowserEvidence() {
  const identity = githubIdentity();
  let api;
  let vite;
  let chrome;
  const cdp = new Cdp();
  try {
    stage('api:start');
    api = await startApi();
    stage('vite:start');
    vite = await startVite();
    await waitHttp(`${WEB_ORIGIN}/login`);
    stage('chrome:start');
    chrome = await startChrome();
    stage(`chrome:ready:${chrome.executable}`);
    await cdp.connect(chrome.url);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const version = await bounded(
      fetch(`http://127.0.0.1:${chrome.port}/json/version`, { signal: AbortSignal.timeout(3000) }).then((r) => r.json()),
      4000,
      'Chrome version discovery'
    );

    const desktop = await enterClinicalAreaFromPreRegistration(cdp, api, {
      name: 'desktop-1366x768',
      width: 1366,
      height: 768,
      mobile: false,
    });
    const directStates = await directClinicalStates(cdp, api);
    const mobile = await enterClinicalAreaFromPreRegistration(cdp, api, {
      name: 'mobile-390x844',
      width: 390,
      height: 844,
      mobile: true,
    });

    const evidence = {
      kind: 'issue-313-browser-evidence',
      result: 'PASS',
      identity,
      browser: version.Browser,
      fixture: {
        userType: user.type,
        professorRole: user.professor.role,
        alunoId: ALUNO_ID,
        leadStatus: lead.status,
        activeStudentSelectorCount: 0,
      },
      routeFlow: [
        `/pre-matriculas/${ALUNO_ID}`,
        `${DESTINATION_PATH}?alunoId=${ALUNO_ID}`,
        `/pre-matriculas/${ALUNO_ID}`,
      ],
      verifiedStates: ['both', 'anamnesis', 'parq', 'empty'],
      desktop,
      directStates,
      mobile,
      apiRequests: api.requests,
    };
    console.log(`BROWSER_EVIDENCE_313 ${JSON.stringify(evidence)}`);
    console.log(`BROWSER_EVIDENCE_313 PASS head=${identity.headSha}`);
  } catch (error) {
    console.error(
      `BROWSER_EVIDENCE_313 FAIL ${error instanceof Error ? error.stack || error.message : String(error)}`
    );
    throw error;
  } finally {
    stage('cleanup:start');
    cdp.close();
    await stopChild(chrome?.child, 'SIGKILL');
    if (chrome?.profile) {
      try {
        rmSync(chrome.profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {}
    }
    await stopVite(vite);
    await stopApi(api?.server);
    stage('cleanup:done');
  }
}

function terminateWorker(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, 'SIGKILL');
      return;
    } catch {}
  }
  child.kill('SIGKILL');
}

if (process.argv.includes(WORKER_FLAG)) {
  try {
    await runBrowserEvidence();
    process.exit(0);
  } catch {
    process.exit(1);
  }
} else {
  const { describe, expect, it } = await import('vitest');
  const suite = process.env.GITHUB_ACTIONS === 'true' ? describe : describe.skip;
  suite('Issue #313 - evidencia browser do fluxo pre-matricula para PRNT', () => {
    it('valida navegacao, identidade, estados clinicos, somente leitura e responsividade', async () => {
      const child = spawn(
        process.execPath,
        ['--experimental-websocket', fileURLToPath(import.meta.url), WORKER_FLAG],
        {
          cwd: process.cwd(),
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
        }
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        const value = chunk.toString();
        stdout += value;
        process.stdout.write(value);
      });
      child.stderr.on('data', (chunk) => {
        const value = chunk.toString();
        stderr += value;
        process.stderr.write(value);
      });
      const workerExit = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (value) => resolve(value ?? 1));
      });
      let code;
      try {
        code = await bounded(workerExit, 90000, 'issue 313 browser evidence worker');
      } catch (error) {
        terminateWorker(child);
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}\nstdout:\n${stdout.slice(-8000)}\nstderr:\n${stderr.slice(-8000)}`
        );
      }
      expect(code, stderr || stdout).toBe(0);
      expect(stdout).toContain('BROWSER_EVIDENCE_313 PASS');
      expect(stdout).toContain('"verifiedStates":["both","anamnesis","parq","empty"]');
      expect(stdout).toContain('"activeStudentSelectorCount":0');
    }, 100000);
  });
}
