// @vitest-environment node
import { createHash } from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import { accessSync, constants, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const puppeteer = apiRequire('puppeteer');
const suite = process.env.ISSUE_553_BROWSER_EVIDENCE === '1' ? describe : describe.skip;
const outputDir = path.resolve(process.cwd(), '../../artifacts/issue-553');
const subjectSha = process.env.VERIFICATION_HEAD_SHA || process.env.GITHUB_SHA || 'local';
const viewports = [
  { width: 390, height: 844, isMobile: true, hasTouch: true },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

const masterUser = {
  id: 'user-visual-553', email: 'master@example.com', type: 'professor',
  professor: {
    id: 'professor-visual-553', role: 'master',
    collaboratorFunction: { id: 'function-master', code: 'master', name: 'Master', isActive: true },
    contract: { id: 'contract-visual-553', type: 'academy', name: 'Academia visual 553', document: '00000000000100' },
  },
  accessControl: { isMaster: true, permissions: [] },
};
const longText = 'Exercício de validação responsiva com descrição suficientemente extensa para verificar truncamento, rolagem interna e ações essenciais em conteúdo real de tabelas.';
const sampleExercise = {
  id: 'exercise-visual-553', name: 'Agachamento - cenário de largura responsiva',
  loadType: 'C', movementType: 'A', countingType: 'R', category: 'RESISTIDO',
  muscleGroup: 'Quadríceps', notes: longText,
  createdAt: '2026-09-12T00:00:00.000Z', updatedAt: '2026-09-12T00:00:00.000Z',
};
const sampleFunction = {
  id: 'function-visual-553', contractId: 'contract-visual-553', name: 'Professor visual',
  code: 'professor', isActive: true, isSystem: true,
  createdAt: '2026-09-12T00:00:00.000Z', updatedAt: '2026-09-12T00:00:00.000Z',
  accessPermissions: [{ screenKey: 'students.details', blockKey: null, canView: true, dataScope: null }],
};
const sampleStudent = {
  id: 'student-visual-553', professorId: masterUser.professor.id,
  age: 35, schedulePlan: 'free',
  user: { id: 'student-user-visual-553', email: 'student@example.com', profile: { name: 'Aluno de prova visual' } },
};
const publicLanding = {
  tenant: { name: 'Academia visual 553', privacyNoticeUrl: '/privacidade', logoUrl: null },
  expiresAt: '2027-12-31T00:00:00.000Z', approximateDuration: '15 minutos',
  stages: [{ key: 'IDENTITY', title: 'Identificação e dados pessoais', optional: false }],
  lead: { name: 'Pessoa convidada', email: 'convite@example.com' },
};
const routeCases = [
  { id: 'library', route: '/library', expect: 'Biblioteca de Exercícios', kind: 'list' },
  { id: 'collaborators', route: '/settings/collaborator-functions', expect: 'Professor visual', kind: 'collaborators' },
  { id: 'services', route: '/settings/services', expect: 'Catálogo comercial de serviços', kind: 'tabs' },
  { id: 'public', route: '/pre-cadastro/visual-invite-553', expect: 'Já tenho conta', kind: 'tabs' },
  { id: 'capacities', route: '/protocolo-avaliacao-fisica/prescricao-capacidades?alunoId=student-visual-553', expect: 'Resistido', kind: 'capacities' },
  // The legacy component is not registered in App.tsx. Mount the real component
  // in a Vite-only fixture; never expose a production-only route to audit it.
  { id: 'legacy-builder', route: '/__issue-553-legacy.html', expect: 'Segunda', kind: 'tabs' },
];

const legacyHtml = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root"></main><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '/src/index.css';
const { WorkoutBuilder } = await import('/src/pages/WorkoutBuilder/index.tsx');
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter, {initialEntries:['/plans/visual/workout-builder/1/1']}, React.createElement(Routes, null, React.createElement(Route, {path:'/plans/:planId/workout-builder/:mesocycleNumber/:weekNumber', element:React.createElement(WorkoutBuilder)}))));
</script></body></html>`;

function chromePath() {
  for (const candidate of [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {
      // use bundled Chrome
    }
  }
  return puppeteer.executablePath();
}
function response(res, status, data, origin) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Contract-Id',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, OPTIONS',
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}
function fixture(pathname, method) {
  if (pathname === '/api/v1/auth/me') return { success: true, data: masterUser };
  if (pathname === '/api/v1/library/exercises') return [sampleExercise];
  if (pathname === '/api/v1/collaborator-functions') return { success: true, data: [sampleFunction] };
  if (pathname === '/api/v1/services/catalog') return { success: true, data: [] };
  if (pathname === '/api/v1/pre-cadastro/visual-invite-553') return { success: true, data: publicLanding };
  if (pathname === '/api/v1/alunos') return { success: true, data: { alunos: [sampleStudent], total: 1, page: 1, limit: 100 } };
  if (pathname.startsWith('/api/v1/capacity-prescriptions/')) return { success: true, data: [] };
  if (pathname.startsWith('/api/v1/prontuario/')) return { success: true, data: { currentRecord: null, records: [], parqSubmissions: [], parqState: 'NOT_STARTED' } };
  if (pathname === '/api/v1/pre-registration/availability') return { status: 204, data: null };
  return { status: 404, error: `Unmocked API route ${method} ${pathname}` };
}
async function openTabs(page, kind) {
  if (kind === 'collaborators') {
    await page.waitForSelector('button[aria-label="Abrir função: Professor visual"]');
    await page.click('button[aria-label="Abrir função: Professor visual"]');
  }
  if (kind === 'capacities') {
    await page.waitForSelector('[role="tablist"] [role="tab"]', { timeout: 20000 });
  }
}
async function testTabKeyboard(page, id) {
  const selector = '[role="tablist"] [role="tab"]';
  const count = await page.$$eval(selector, (tabs) => tabs.filter((tab) => !tab.disabled).length);
  if (count < 2) throw new Error(`${id}: expected at least two enabled tabs, received ${count}`);
  const initial = await page.$eval(selector, (tab) => ({ text: tab.textContent?.trim(), selected: tab.getAttribute('aria-selected') }));
  const first = await page.$(selector);
  await first.focus();
  await page.keyboard.press('ArrowRight');
  const next = await page.evaluate((sel) => {
    const tabs = [...document.querySelectorAll(sel)];
    const focused = document.activeElement;
    return { index: tabs.indexOf(focused), selected: focused?.getAttribute('aria-selected'),
      style: focused ? { focusVisible: focused.matches(':focus-visible'), outline: getComputedStyle(focused).outlineStyle, boxShadow: getComputedStyle(focused).boxShadow, background: getComputedStyle(focused).backgroundColor } : null };
  }, selector);
  if (next.index !== 1 || next.selected !== 'true' || !next.style?.focusVisible || (next.style?.boxShadow === 'none' && next.style?.outline === 'none')) {
    throw new Error(`${id}: ArrowRight did not focus and select second tab: ${JSON.stringify(next)}`);
  }
  await page.keyboard.press('End');
  const end = await page.evaluate((sel) => [...document.querySelectorAll(sel)].indexOf(document.activeElement), selector);
  if (end !== count - 1) throw new Error(`${id}: End did not select last tab (${end}/${count})`);
  await page.keyboard.press('Home');
  const home = await page.evaluate((sel) => [...document.querySelectorAll(sel)].indexOf(document.activeElement), selector);
  if (home !== 0) throw new Error(`${id}: Home did not select first tab (${home})`);
  return { initial, next, end, home, keySequence: ['ArrowRight', 'End', 'Home'] };
}
async function inspectFilter(page) {
  const buttons = await page.$$('div[role="group"][aria-label="Filtro de permissões"] button');
  if (buttons.length !== 3) throw new Error(`Filter missing or incomplete, found ${buttons.length}`);
  const observed = [];
  for (const index of [0, 1, 2]) {
    await buttons[index].click();
    const state = await page.evaluate((i) => {
      const group = document.querySelector('[role="group"][aria-label="Filtro de permissões"]');
      const items = [...group.querySelectorAll('button')];
      const active = items[i];
      const css = getComputedStyle(active);
      return { pressed: active.getAttribute('aria-pressed'), classes: active.className,
        computedBackground: css.backgroundColor, focusClass: active.className.includes('focus-visible:ring-2'),
        activeCount: items.filter((item) => item.getAttribute('aria-pressed') === 'true').length };
    }, index);
    if (state.pressed !== 'true' || state.activeCount !== 1 || !state.classes.includes('bg-primary/10') || !state.focusClass) {
      throw new Error(`Permissions filter mismatch ${index}: ${JSON.stringify(state)}`);
    }
    observed.push(state);
  }
  return observed;
}
async function inspectHoverAndFocus(page, id, viewport) {
  const preferred = '[role="tablist"] [role="tab"]';
  const selector = await page.$(preferred) ? preferred : 'button:not([disabled])';
  const candidates = await page.$(selector);
  const visible = await Promise.all(candidates.map((candidate) => candidate.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0 && getComputedStyle(element).visibility !== 'hidden';
  })));
  const target = candidates[visible.indexOf(true)];
  if (!target) throw new Error(`${id}: no visible control available for hover/focus check`);
  const resting = await target.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    text: getComputedStyle(element).color,
  }));
  await target.hover();
  const hovered = await target.evaluate((element) => ({
    isHovered: element.matches(':hover'),
    background: getComputedStyle(element).backgroundColor,
    text: getComputedStyle(element).color,
  }));
  if (!hovered.isHovered && !viewport.isMobile) throw new Error(`${id}: hover state cannot be reached`);
  await target.focus();
  await page.keyboard.press('Tab');
  const keyboardFocus = await page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return null;
    return {
      tag: element.tagName,
      text: element.textContent?.trim().slice(0, 80),
      visible: element.matches(':focus-visible'),
      boxShadow: getComputedStyle(element).boxShadow,
    };
  });
  if (!keyboardFocus?.visible) throw new Error(`${id}: keyboard focus is not visible`);
  return { resting, hovered, keyboardFocus };
}
async function diagnostics(page, id, viewport) {
  const dimensions = await page.evaluate(() => {
    const root = document.documentElement;
    const tables = [...document.querySelectorAll('table')];
    const actions = [...document.querySelectorAll('button')].filter((b) => !b.disabled);
    return {
      viewportWidth: root.clientWidth, documentScrollWidth: root.scrollWidth,
      viewportHeight: root.clientHeight, documentScrollHeight: root.scrollHeight,
      shellWidth: document.querySelector('header .ts-container')?.getBoundingClientRect().width || null,
      activeActions: actions.length,
      visibleActions: actions.filter((button) => {
        const bounds = button.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.right > 0 && bounds.top < root.clientHeight && bounds.left < root.clientWidth;
      }).length,
      tables: tables.map((table) => ({ width: table.scrollWidth, parentWidth: table.parentElement?.clientWidth,
        parentOverflowX: table.parentElement ? getComputedStyle(table.parentElement).overflowX : null })),
      alerts: [...document.querySelectorAll('[role="alert"]')].map((x) => x.textContent?.trim().slice(0, 200)),
    };
  });
  if (dimensions.documentScrollWidth > dimensions.viewportWidth + 1) {
    throw new Error(`${id}@${viewport.width}: accidental document overflow (${dimensions.documentScrollWidth} > ${dimensions.viewportWidth})`);
  }
  if (id !== 'public' && id !== 'legacy-builder' && viewport.width === 1920 &&
    (!dimensions.shellWidth || dimensions.shellWidth < viewport.width - 64)) {
    throw new Error(`${id}@1920: authenticated shell remains constrained (${dimensions.shellWidth})`);
  }
  if (dimensions.activeActions === 0 || dimensions.visibleActions === 0) throw new Error(`${id}: no visible actionable buttons rendered`);
  return dimensions;
}

suite('Issue #553 - matrix of real Chromium UI layouts', () => {
  it('captures route/state/viewport/SHA evidence and keyboard, hover, focus and overflow', async () => {
    let api;
    let vite;
    let browser;
    const observations = [];
    const errors = [];
    const requests = [];
    const prevApi = process.env.VITE_API_URL;
    try {
      mkdirSync(outputDir, { recursive: true });
      api = http.createServer((req, res) => {
        const pathName = new URL(req.url || '/', 'http://127.0.0.1').pathname;
        if (req.method === 'OPTIONS') return response(res, 204, {}, '*');
        const data = fixture(pathName, req.method);
        requests.push({ method: req.method, path: pathName, status: data.status || 200 });
        return response(res, data.status || 200, data.status ? (data.data || { error: data.error }) : data, '*');
      });
      await new Promise((resolve, reject) => { api.once('error', reject); api.listen(0, '127.0.0.1', resolve); });
      process.env.VITE_API_URL = `http://127.0.0.1:${api.address().port}`;
      process.env.VITE_PRE_REGISTRATION_ENABLED = 'true';
      const { createServer } = await import('vite');
      vite = await createServer({
        root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
        plugins: [{ name: 'issue-553-legacy-only-test-fixture', configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.split('?')[0] !== '/__issue-553-legacy.html') return next();
            try {
              const html = await server.transformIndexHtml('/__issue-553-legacy.html', legacyHtml);
              res.setHeader('Content-Type', 'text/html'); res.end(html);
            } catch (error) { next(error); }
          });
        } }],
      });
      await vite.listen();
      const baseUrl = `http://127.0.0.1:${vite.httpServer.address().port}`;
      browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      for (const scenario of routeCases) {
        for (const viewport of viewports) {
          const page = await browser.newPage();
          const pageErrors = [];
          try {
            await page.setViewport(viewport);
            await page.evaluateOnNewDocument((user) => {
              localStorage.setItem('token', 'issue-553-synthetic-professor');
              localStorage.setItem('user', JSON.stringify(user));
            }, masterUser);
            page.on('pageerror', (error) => { pageErrors.push(error.message); errors.push({ route: scenario.id, viewport, message: error.message }); });
            await page.goto(`${baseUrl}${scenario.route}`, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction((expected) => document.body.innerText?.includes(expected), { timeout: 20000 }, scenario.expect);
            await openTabs(page, scenario.kind);
            let keyboard = null;
            let filter = null;
            if (scenario.kind === 'collaborators') {
              keyboard = await testTabKeyboard(page, scenario.id);
              await page.click('[role="tablist"] [aria-controls="collaborator-function-panel-access"]');
              filter = await inspectFilter(page);
              // Filter state must not modify the active editor tab.
              if (!(await page.$eval('[role="tablist"] [aria-controls="collaborator-function-panel-access"]', (tab) => tab.getAttribute('aria-selected') === 'true'))) {
                throw new Error('Permission filtering unexpectedly changed the active editor tab');
              }
            } else if (scenario.kind === 'tabs' || scenario.kind === 'capacities') {
              keyboard = scenario.kind === 'capacities' ? null : await testTabKeyboard(page, scenario.id);
              if (scenario.kind === 'capacities') {
                const tiles = await page.$$('[role="tablist"] [role="tab"]');
                if (tiles.length < 4) throw new Error('Capacity tiles not mounted');
                await tiles[1].click();
                if (await page.$eval('[role="tablist"] [role="tab"]:nth-child(2)', (tab) => tab.getAttribute('aria-selected') !== 'true')) {
                  throw new Error('Capacity selection did not change active tile');
                }
              }
            }
            const hover = await inspectHoverAndFocus(page, scenario.id, viewport);
            if (scenario.id === 'library') {
              if (!((await page.evaluate(() => document.body.innerText)).includes(sampleExercise.name))) {
                throw new Error('Library data did not render');
              }
              await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Novo Exercício'))?.click());
              await page.waitForFunction(() => !!document.querySelector('.fixed.inset-0'));
            }
            if (scenario.id === 'services') {
              await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Novo serviço'))?.click());
              await page.waitForFunction(() => document.body.innerText?.includes('Voltar ao catálogo'));
            }
            const dimension = await diagnostics(page, scenario.id, viewport);
            const img = await page.screenshot({ path: path.join(outputDir, `${scenario.id}-${viewport.width}x${viewport.height}.png`), fullPage: true });
            observations.push({ route: scenario.route, scenario: scenario.id, viewport, sha: subjectSha,
              fixture: 'controlled HTTP API + test professor/visitor; no real personal data', state: 'rendered and interacted',
              keyboard, filter, hover, dimension, screenshot: `${scenario.id}-${viewport.width}x${viewport.height}.png`,
              screenshotSha256: createHash('sha256').update(img).digest('hex'), pageErrors,
              passed: true });
            if (pageErrors.length) throw new Error(`${scenario.id}: browser errors: ${pageErrors.join(' | ')}`);
          } finally { await page.close(); }
        }
      }
      expect(observations).toHaveLength(routeCases.length * viewports.length);
      expect(errors).toEqual([]);
    } finally {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(path.join(outputDir, 'visual-matrix.json'), JSON.stringify({
        schemaVersion: 1, issue: 553, pr: 554, subjectSha, testMode: 'real Chrome/Vite UI with synthetic API boundary',
        viewports, scenarios: routeCases, observations, requests, errors,
      }, null, 2));
      await browser?.close();
      await vite?.close();
      api?.closeAllConnections?.();
      if (api?.listening) await new Promise((resolve) => api.close(resolve));
      if (prevApi === undefined) delete process.env.VITE_API_URL; else process.env.VITE_API_URL = prevApi;
      delete process.env.VITE_PRE_REGISTRATION_ENABLED;
    }
  }, 180000);
});
