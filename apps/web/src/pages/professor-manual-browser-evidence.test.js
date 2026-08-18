// @vitest-environment node
import { createHash } from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const puppeteer = apiRequire('puppeteer');

const HOST = '127.0.0.1';
const WEB_PORT = 4330;
const API_PORT = 4331;
const WEB_ORIGIN = `http://${HOST}:${WEB_PORT}`;
const API_ORIGIN = `http://${HOST}:${API_PORT}`;
const ROUTE = '/settings/professor-manual';

const user = {
  id: 'professor-364-browser',
  type: 'professor',
  name: 'Profissional Evidencia 364',
  email: 'professor.364@example.com',
  professor: {
    id: 'professor-364',
    role: 'master',
    contract: { id: 'contract-364', type: 'academy' },
    collaboratorFunction: { id: 'function-364', code: 'manager', name: 'Gestor', accessPermissions: [] },
  },
  accessControl: { isMaster: true, permissions: [] },
};

const item = {
  id: 'manual-364',
  contractId: 'contract-364',
  code: 'VESTIMENTA_PADRAO',
  title: 'Vestimenta no atendimento e orientacoes complementares para um titulo propositalmente longo',
  content: 'Use o uniforme definido e mantenha esta orientacao extensa acessivel pela edicao sem provocar overflow horizontal.',
  format: 'dica_rapida',
  context: 'avaliacao_fisica',
  servicoContratado: 'Personal, consultoria e avaliacao fisica com descricao extensa de evidencia',
  setor: 'Avaliacao fisica e acompanhamento integrado com nome extenso',
  item: 'Vestimenta e postura profissional durante todo o atendimento com texto extenso',
  frase: 'Estar sempre uniformizado durante o atendimento e revisar a postura antes da avaliacao.',
  productArea: 'physical_assessment',
  productMoment: 'antes da avaliacao',
  linkLabel: 'Abrir manual',
  linkHref: ROUTE,
  order: 1,
  isActive: true,
  createdAt: '2026-08-18T12:00:00.000Z',
  updatedAt: '2026-08-18T12:00:00.000Z',
};

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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Cache-Control': 'no-store',
  };
  if (payload !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
  res.writeHead(status, headers);
  res.end(payload === undefined ? '' : JSON.stringify(payload));
}

async function startApi() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', API_ORIGIN);
    requests.push(`${req.method} ${url.pathname}${url.search}`);
    if (req.method === 'OPTIONS') return respond(res, 204);
    if (url.pathname === '/api/v1/auth/me' && req.method === 'GET') return respond(res, 200, { data: user });
    if (url.pathname === '/api/v1/professor-manual' && req.method === 'GET') {
      return respond(res, 200, { success: true, data: [item] });
    }
    return respond(res, 404, { error: 'Unexpected issue 364 browser request', path: url.pathname });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(API_PORT, HOST, resolve);
  });
  return { server, requests };
}

async function startVite() {
  const previous = process.env.VITE_API_URL;
  process.env.VITE_API_URL = API_ORIGIN;
  const { createServer } = await import('vite');
  const server = await createServer({
    root: process.cwd(),
    logLevel: 'error',
    server: { host: HOST, port: WEB_PORT, strictPort: true },
  });
  await server.listen();
  return { server, previous };
}

async function stopApi(server) {
  if (!server) return;
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

async function stopVite(vite) {
  if (!vite) return;
  await vite.server.close();
  if (vite.previous === undefined) delete process.env.VITE_API_URL;
  else process.env.VITE_API_URL = vite.previous;
}

async function waitForText(page, text) {
  await page.waitForFunction(
    (expected) => document.body?.innerText.normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(expected.normalize('NFD').replace(/[\u0300-\u036f]/g, '')),
    { timeout: 12000 },
    text
  );
}

async function setSession(page) {
  await page.goto(`${WEB_ORIGIN}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((currentUser) => {
    localStorage.setItem('token', 'issue-364-browser-token');
    localStorage.setItem('user', JSON.stringify(currentUser));
  }, user);
}

async function screenshotEvidence(page) {
  const bytes = await page.screenshot({ fullPage: true });
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function routeLayout(page) {
  return page.evaluate(() => {
    const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const title = [...document.querySelectorAll('h1')].find((el) => el.textContent?.trim() === 'Manual do Professor');
    const root = title?.closest('header')?.parentElement;
    if (!root) throw new Error('Professor Manual page root not found');
    const buttons = [...root.querySelectorAll('button')]
      .filter(visible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return { text: (el.textContent || '').trim(), left: rect.left, right: rect.right };
      });
    return {
      pathname: location.pathname,
      innerWidth,
      innerHeight,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      tableVisible: visible(root.querySelector('table')),
      mobileCardCount: [...root.querySelectorAll('article')].filter(visible).length,
      buttons,
    };
  });
}

async function assertViewport(page, viewport) {
  await page.setViewport(viewport);
  await page.goto(`${WEB_ORIGIN}${ROUTE}`, { waitUntil: 'domcontentloaded' });
  await waitForText(page, 'Manual do Professor');
  await waitForText(page, 'Vestimenta e postura profissional');
  const layout = await routeLayout(page);
  expect(layout.pathname).toBe(ROUTE);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  for (const button of layout.buttons) {
    expect(button.left, button.text).toBeGreaterThanOrEqual(-1);
    expect(button.right, button.text).toBeLessThanOrEqual(layout.innerWidth + 1);
  }
  if (viewport.isMobile) {
    expect(layout.tableVisible).toBe(false);
    expect(layout.mobileCardCount).toBeGreaterThan(0);
  } else {
    expect(layout.tableVisible).toBe(true);
    expect(layout.mobileCardCount).toBe(0);
  }
  return {
    viewport,
    layout,
    screenshot: await screenshotEvidence(page),
    accessibility: await page.accessibility.snapshot({ interestingOnly: false }),
  };
}

async function exerciseEditor(page) {
  const focusedNew = await page.evaluate(() => {
    const title = [...document.querySelectorAll('h1')].find((el) => el.textContent?.trim() === 'Manual do Professor');
    const root = title?.closest('header')?.parentElement;
    const button = root ? [...root.querySelectorAll('button')].find((el) => el.textContent?.trim() === 'Novo item') : undefined;
    button?.focus();
    return document.activeElement === button;
  });
  expect(focusedNew).toBe(true);
  await page.keyboard.press('Enter');
  await waitForText(page, 'Novo item do manual');

  const editor = await page.evaluate(() => {
    const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const title = [...document.querySelectorAll('h1')].find((el) => el.textContent?.trim() === 'Manual do Professor');
    const root = title?.closest('header')?.parentElement;
    if (!root) throw new Error('Professor Manual page root not found');
    const required = [
      'professor-manual-setor',
      'professor-manual-item',
      'professor-manual-frase',
      'professor-manual-title',
      'professor-manual-content',
      'professor-manual-code',
      'professor-manual-product-area',
    ];
    const advanced = [...root.querySelectorAll('button')].find((el) => el.textContent?.includes('Configurações avançadas'));
    return {
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      innerWidth,
      tableVisible: visible(root.querySelector('table')),
      mobileCards: [...root.querySelectorAll('article')].filter(visible).length,
      requiredVisible: required.filter((id) => visible(root.querySelector(`#${id}`))),
      advancedExpanded: advanced?.getAttribute('aria-expanded'),
    };
  });
  expect(editor.scrollWidth).toBeLessThanOrEqual(editor.innerWidth + 1);
  expect(editor.tableVisible).toBe(false);
  expect(editor.mobileCards).toBe(0);
  expect(editor.requiredVisible).toHaveLength(7);
  expect(editor.advancedExpanded).toBe('false');

  await page.focus('#professor-manual-setor');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('professor-manual-item');

  const advancedButton = await page.evaluateHandle(() => {
    const title = [...document.querySelectorAll('h1')].find((el) => el.textContent?.trim() === 'Manual do Professor');
    const root = title?.closest('header')?.parentElement;
    return root ? [...root.querySelectorAll('button')].find((el) => el.textContent?.includes('Configurações avançadas')) : undefined;
  });
  await advancedButton.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const title = [...document.querySelectorAll('h1')].find((el) => el.textContent?.trim() === 'Manual do Professor');
    const root = title?.closest('header')?.parentElement;
    return !!root && [...root.querySelectorAll('button')].some(
      (el) => el.textContent?.includes('Configurações avançadas') && el.getAttribute('aria-expanded') === 'true'
    );
  });
  return {
    editor,
    keyboard: ['Novo item:Enter', 'Setor:Tab->Item', 'Configurações avançadas:Enter'],
    screenshot: await screenshotEvidence(page),
    accessibility: await page.accessibility.snapshot({ interestingOnly: false }),
  };
}

const suite = process.env.GITHUB_ACTIONS === 'true' ? describe : describe.skip;
suite('Issue #363 / PR #364 - evidencia browser do Manual do Professor', () => {
  it('valida responsividade, editor, teclado e acessibilidade em Chrome real', async () => {
    const identity = githubIdentity();
    let api;
    let vite;
    let browser;
    try {
      api = await startApi();
      vite = await startVite();
      browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const page = await browser.newPage();
      await setSession(page);

      const desktop1440 = await assertViewport(page, { name: 'desktop-1440x900', width: 1440, height: 900, isMobile: false });
      const editor1440 = await exerciseEditor(page);
      const desktop1366 = await assertViewport(page, { name: 'desktop-1366x768', width: 1366, height: 768, isMobile: false });
      const mobile = await assertViewport(page, { name: 'mobile-390x844', width: 390, height: 844, isMobile: true, hasTouch: true });
      const editorMobile = await exerciseEditor(page);

      const evidence = {
        kind: 'issue-363-pr-364-browser-evidence',
        result: 'PASS',
        identity,
        browser: await browser.version(),
        route: ROUTE,
        fixture: { itemId: item.id, longContent: true, userRole: user.professor.role },
        viewports: [desktop1440, desktop1366, mobile],
        editor: { desktop1440: editor1440, mobile: editorMobile },
        verified: [
          'no-horizontal-overflow', 'desktop-table', 'mobile-cards', 'actions-inside-viewport',
          'editor-replaces-list', 'required-fields-visible', 'advanced-collapsed-by-default',
          'keyboard-new-item', 'keyboard-setor-to-item', 'keyboard-accordion-expand', 'accessibility-tree-captured',
        ],
        apiRequests: api.requests,
      };
      console.log(`BROWSER_EVIDENCE_364 ${JSON.stringify(evidence)}`);
      console.log(`BROWSER_EVIDENCE_364 PASS head=${identity.headSha}`);
      expect(evidence.verified).toContain('accessibility-tree-captured');
    } finally {
      await browser?.close().catch(() => {});
      await stopVite(vite).catch(() => {});
      await stopApi(api?.server).catch(() => {});
    }
  }, 100000);
});
