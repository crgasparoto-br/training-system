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
const WEB_PORT = 4310;
const API_PORT = 4311;
const WEB_ORIGIN = `http://${HOST}:${WEB_PORT}`;
const API_ORIGIN = `http://${HOST}:${API_PORT}`;
const ALUNO_ID = 'aluno-browser-evidence';

const user = {
  id: 'lead-browser-evidence-user',
  type: 'aluno',
  name: 'Lead Evidência Browser',
  email: 'lead.browser@example.com',
};

const session = {
  alunoId: ALUNO_ID,
  status: 'PRE_REGISTRATION_COMPLETED',
  version: 3,
  currentStep: 'COMPLETED',
  completedAt: '2026-08-07T18:00:00.000Z',
  tenant: { name: 'Academia Evidência', privacyNoticeUrl: 'https://example.com/privacy' },
  identity: {
    name: 'Lead Evidência Browser',
    birthDate: '1990-01-01',
    cpf: '52998224725',
    gender: 'male',
    phone: '15999990000',
    additionalPhone: '15999990001',
    email: 'lead.browser@example.com',
    additionalEmail: 'lead.browser.alt@example.com',
    addressZipCode: '18000000',
    addressStreet: 'Rua Evidência Responsiva com Nome Longo',
    addressNumber: '12345',
    addressComplement: 'Bloco B, apartamento 1204',
    addressNeighborhood: 'Centro Expandido',
    addressCity: 'Sorocaba',
    addressState: 'SP',
  },
  isMinor: false,
  claimRole: 'STUDENT',
  guardianAuthorization: { status: 'NOT_REQUIRED', role: 'STUDENT' },
  privacy: {
    noticeVersion: '2026-08',
    noticeUrl: 'https://example.com/privacy',
    acceptedAt: '2026-08-07T17:50:00.000Z',
  },
  missingRequiredFields: [],
  duplicateWarnings: [],
  nextSteps: [
    {
      key: 'ANAMNESIS',
      title: 'Anamnese Inicial',
      description: 'Conte informações importantes para orientar seu acompanhamento.',
      optional: true,
      status: 'NOT_STARTED',
      action: 'START',
      href: `/pre-cadastro/anamnese?alunoId=${ALUNO_ID}`,
    },
    {
      key: 'PARQ',
      title: 'PAR-Q',
      description: 'Questionário de prontidão para atividade física.',
      optional: true,
      status: 'NOT_STARTED',
      action: 'START',
      href: `/pre-cadastro/par-q?alunoId=${ALUNO_ID}`,
    },
  ],
};

function githubIdentity() {
  let event = {};
  try {
    if (process.env.GITHUB_EVENT_PATH) {
      event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    }
  } catch {
    // The fallback below still provides the merge SHA outside pull_request events.
  }
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

function startApi() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', API_ORIGIN);
    requests.push(`${req.method} ${url.pathname}`);
    if (req.method === 'OPTIONS') return respond(res, 204);
    if (req.method !== 'GET') return respond(res, 405, { error: 'Method not allowed' });
    if (url.pathname === '/api/v1/pre-registration/availability') return respond(res, 204);
    if (url.pathname === '/api/v1/auth/me') return respond(res, 200, { data: user });
    if (url.pathname === '/api/v1/pre-registration/processes') {
      return respond(res, 200, { data: [{ alunoId: ALUNO_ID, status: session.status }] });
    }
    if (url.pathname === `/api/v1/pre-registration/processes/${ALUNO_ID}/session`) {
      return respond(res, 200, { data: session });
    }
    if (url.pathname === `/api/v1/pre-registration/processes/${ALUNO_ID}/parq`) {
      return respond(res, 200, { data: { alunoId: ALUNO_ID, status: 'NOT_STARTED' } });
    }
    return respond(res, 404, { error: 'Unexpected browser evidence request', path: url.pathname });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(API_PORT, HOST, () => resolve({ server, requests }));
  });
}

async function waitHttp(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {
      // Vite is still starting.
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startVite() {
  return spawn('pnpm', ['run', 'dev', '--', '--host', HOST, '--port', String(WEB_PORT), '--strictPort'], {
    env: { ...process.env, VITE_API_URL: API_ORIGIN, VITE_PRE_REGISTRATION_ENABLED: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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
    } catch {
      // Try the next common runner path.
    }
  }
  throw new Error(`Chrome/Chromium not found: ${candidates.join(', ')}`);
}

async function stopChild(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit').catch(() => []);
  child.kill(signal);
  await Promise.race([exited, delay(2000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

async function startChrome() {
  const profile = mkdtempSync(path.join(os.tmpdir(), 'issue-309-browser-'));
  const child = spawn(chromeExecutable(), [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--window-size=1366,768',
    'about:blank',
  ], { stdio: 'ignore' });
  const activePort = path.join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + 15000;
  let port;
  while (Date.now() < deadline) {
    try {
      port = Number(readFileSync(activePort, 'utf8').trim().split(/\r?\n/)[0]);
      if (port) break;
    } catch {
      // Chrome has not exposed CDP yet.
    }
    await delay(100);
  }
  if (!port) throw new Error('Chrome did not expose DevToolsActivePort');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('Chrome page target not found');
  return { child, profile, port, url: page.webSocketDebuggerUrl };
}

class Cdp {
  async connect(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result || {});
    };
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    this.ws?.close();
  }
}

async function evaluate(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'Browser evaluation failed');
  return response.result?.value;
}

async function wait(cdp, expression, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await evaluate(cdp, expression);
      if (value) return value;
    } catch {
      // Navigation can briefly replace the JavaScript execution context.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function navigate(cdp, url) {
  await cdp.send('Page.navigate', { url });
  await wait(cdp, `location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`, url);
}

async function text(cdp, value) {
  return wait(cdp, `document.body?.innerText.includes(${JSON.stringify(value)})`, `text ${value}`);
}

async function click(cdp, label) {
  const result = await evaluate(cdp, `(() => {
    const norm = (v) => (v || '').replace(/\\s+/g, ' ').trim();
    const el = [...document.querySelectorAll('a,button')].find((node) => norm(node.textContent) === ${JSON.stringify(label)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!result) throw new Error(`Interactive element not found: ${label}`);
}

async function layout(cdp, labels) {
  const value = await evaluate(cdp, `(() => {
    const labels = ${JSON.stringify(labels)};
    const norm = (v) => (v || '').replace(/\\s+/g, ' ').trim();
    const nodes = [...document.querySelectorAll('a,button')];
    return {
      pathname: location.pathname,
      search: location.search,
      innerWidth: innerWidth,
      innerHeight: innerHeight,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      elements: labels.map((label) => {
        const node = nodes.find((item) => norm(item.textContent) === label);
        if (!node) return { label, found: false };
        const r = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return { label, found: true, left: r.left, right: r.right, display: style.display, visibility: style.visibility };
      }),
    };
  })()`);
  if (value.scrollWidth > value.innerWidth + 1) {
    throw new Error(`Horizontal overflow: ${value.scrollWidth} > ${value.innerWidth}`);
  }
  for (const element of value.elements) {
    if (!element.found || element.display === 'none' || element.visibility === 'hidden') {
      throw new Error(`Interactive element not visible: ${element.label}`);
    }
    if (element.left < -1 || element.right > value.innerWidth + 1) {
      throw new Error(`Interactive element outside viewport: ${element.label}`);
    }
  }
  return value;
}

async function screenshotHash(cdp) {
  const capture = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const bytes = Buffer.from(capture.data, 'base64');
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function viewportScenario(cdp, viewport) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
  await navigate(cdp, `${WEB_ORIGIN}/login`);
  await evaluate(cdp, `localStorage.setItem('token','browser-evidence-token'); localStorage.setItem('user',${JSON.stringify(JSON.stringify(user))}); true`);
  await navigate(cdp, `${WEB_ORIGIN}/inicio`);
  await text(cdp, 'Seu processo de pré-matrícula');
  await text(cdp, 'Responder Anamnese');
  await text(cdp, 'Responder PAR-Q');
  if (await evaluate(cdp, `document.body.innerText.includes('Nenhuma rotina liberada')`)) {
    throw new Error('Lead fell back to generic home');
  }
  const home = await layout(cdp, ['Ver meus dados', 'Responder Anamnese', 'Responder PAR-Q']);
  const homeScreenshot = await screenshotHash(cdp);

  await click(cdp, 'Ver meus dados');
  await wait(cdp, `location.pathname === '/pre-cadastro'`, '/pre-cadastro');
  await text(cdp, 'Dados cadastrais');
  const portal = await layout(cdp, ['Voltar para início', 'Ver pré-cadastro']);
  const portalScreenshot = await screenshotHash(cdp);

  await click(cdp, 'Ver pré-cadastro');
  await wait(cdp, `location.search.includes('view=dados')`, 'pre-registration summary query');
  await text(cdp, 'Seus dados cadastrais');
  await text(cdp, 'somente para leitura');
  const summary = await layout(cdp, ['Voltar para início', 'Voltar para pré-cadastro']);
  const summaryScreenshot = await screenshotHash(cdp);

  await click(cdp, 'Voltar para início');
  await wait(cdp, `location.pathname === '/inicio'`, 'return to /inicio');
  await text(cdp, 'Ver meus dados');

  return { viewport, home, portal, summary, screenshots: [homeScreenshot, portalScreenshot, summaryScreenshot] };
}

async function runBrowserEvidence() {
  const identity = githubIdentity();
  const api = await startApi();
  const vite = startVite();
  let chrome;
  const cdp = new Cdp();
  let viteOutput = '';
  vite.stdout.on('data', (chunk) => { viteOutput += chunk.toString(); });
  vite.stderr.on('data', (chunk) => { viteOutput += chunk.toString(); });
  try {
    await waitHttp(`${WEB_ORIGIN}/login`);
    chrome = await startChrome();
    await cdp.connect(chrome.url);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const version = await (await fetch(`http://127.0.0.1:${chrome.port}/json/version`)).json();
    const scenarios = [];
    for (const viewport of [
      { name: 'desktop-1366x768', width: 1366, height: 768, mobile: false },
      { name: 'mobile-390x844', width: 390, height: 844, mobile: true },
    ]) scenarios.push(await viewportScenario(cdp, viewport));
    const evidence = {
      kind: 'issue-309-browser-evidence',
      result: 'PASS',
      identity,
      browser: version.Browser,
      fixture: { userType: user.type, alunoId: ALUNO_ID, status: session.status },
      routeFlow: ['/inicio', '/pre-cadastro', '/pre-cadastro?view=dados', '/inicio'],
      scenarios,
      apiRequests: api.requests,
    };
    console.log(`BROWSER_EVIDENCE ${JSON.stringify(evidence)}`);
    console.log(`BROWSER_EVIDENCE PASS head=${identity.headSha}`);
  } catch (error) {
    console.error(`BROWSER_EVIDENCE FAIL ${error instanceof Error ? error.stack || error.message : String(error)}`);
    if (viteOutput) console.error(`VITE_OUTPUT ${viteOutput.slice(-4000)}`);
    throw error;
  } finally {
    cdp.close();
    await stopChild(chrome?.child, 'SIGKILL');
    if (chrome?.profile) {
      try { rmSync(chrome.profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
    }
    await stopChild(vite);
    api.server.closeAllConnections?.();
    await new Promise((resolve) => api.server.close(resolve));
  }
}

if (process.argv.includes(WORKER_FLAG)) {
  runBrowserEvidence().catch(() => { process.exitCode = 1; });
} else {
  const { describe, expect, it } = await import('vitest');
  const suite = process.env.GITHUB_ACTIONS === 'true' ? describe : describe.skip;
  suite('Issue #309 - evidência browser responsiva', () => {
    it('valida o round-trip da home do lead em desktop e mobile', async () => {
      const child = spawn(process.execPath, ['--experimental-websocket', fileURLToPath(import.meta.url), WORKER_FLAG], {
        cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      const code = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (value) => resolve(value ?? 1));
      });
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      expect(code, stderr || stdout).toBe(0);
      expect(stdout).toContain('BROWSER_EVIDENCE PASS');
    }, 90000);
  });
}
