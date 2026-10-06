// @vitest-environment node
import { createHash } from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import { accessSync, constants, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const puppeteer = apiRequire('puppeteer');
const suite = process.env.GITHUB_ACTIONS === 'true' || process.env.ISSUE_388_BROWSER_EVIDENCE === '1' ? describe : describe.skip;
const outputDir = path.resolve(process.cwd(), '../../artifacts/issue-388');
const values = { psr: 8, sleepQuality: 7, fatigue: 3, painLevel: 5, motivation: 9, availableMinutes: 45, notes: 'Rascunho preservado' };
const view = (input = values) => ({
  id: 'checkin-browser', sessionId: 'day-browser', editable: true,
  createdAt: '2026-10-05T12:00:00Z', updatedAt: '2026-10-05T12:00:00Z',
  values: input,
  guidance: { painTriage: 'alert', studentMessage: 'Converse com seu professor antes de decidir como seguir.', blocksWorkout: false, changesWorkoutAutomatically: false },
});
function executablePath() {
  for (const candidate of [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* use Puppeteer cache */ }
  }
  return puppeteer.executablePath();
}
const harness = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><main id="root" style="max-width:48rem;margin:auto;padding:1rem"></main><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PreWorkoutCheckInCard } from '/src/components/training/PreWorkoutCheckInCard.tsx';
import { preWorkoutCheckInService } from '/src/services/pre-workout-check-in.service.ts';
import '/src/index.css';
localStorage.setItem('token', 'checkin-browser-test');
const root = createRoot(document.getElementById('root'));
let revision = 0;
window.mountCheckIn = (options = {}) => {
  const key = ++revision;
  root.render(React.createElement('div', { 'data-mount': key }, React.createElement(PreWorkoutCheckInCard, {
    key, audience: options.audience || 'student', sessionStatus: options.status || 'not_started',
    initialCheckIn: options.checkIn || null,
    save: (payload) => preWorkoutCheckInService.saveForStudent('day-browser', payload, { contractId: 'contract-browser' }),
  })));
  return key;
};
window.mountCheckIn();
</script></body></html>`;

suite('Issue #388 - real browser check-in recovery', () => {
  it('proves success, typed conflicts, retry, read-only and keyboard/reflow in desktop/mobile', async () => {
    let api, vite, browser;
    let webOrigin = '', mode = 'success';
    const requests = [], observations = [], browserErrors = [];
    const previousApi = process.env.VITE_API_URL;
    const capture = async (page, scenario, start) => {
      const observed = await page.evaluate(() => ({
        values: [...document.querySelectorAll('input,textarea')].map((field) => field.value),
        disabled: [...document.querySelectorAll('input,textarea')].map((field) => field.disabled),
        labelled: [...document.querySelectorAll('input,textarea')].every((field) => field.labels.length > 0),
        buttonCount: document.querySelectorAll('main button').length,
        alert: document.querySelector('[role="alert"]')?.textContent || null,
        text: document.querySelector('main').innerText,
        width: innerWidth,
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      }));
      expect(observed.scrollWidth).toBeLessThanOrEqual(observed.width + 1);
      expect(observed.labelled).toBe(true);
      const filename = `${page.viewport().width}-${scenario}.png`;
      const png = await page.screenshot({ path: path.join(outputDir, filename), fullPage: true });
      const entry = { scenario, viewport: page.viewport(), passed: true, observed, requests: requests.slice(start), screenshot: { path: filename, sha256: createHash('sha256').update(png).digest('hex') } };
      observations.push(entry);
      console.info('ISSUE_388_BROWSER_EVIDENCE', JSON.stringify(entry));
      return observed;
    };
    const mount = async (page, options = {}) => {
      const revision = await page.evaluate((opts) => window.mountCheckIn(opts), options);
      await page.waitForFunction((n) => document.querySelector('[data-mount]')?.dataset.mount === String(n), { timeout: 10000 }, revision);
    };
    const fill = async (page, partial = false) => {
      const inputs = await page.$$('input[type="number"]');
      const content = partial ? [8] : [8, 7, 3, 5, 9, 45];
      for (let index = 0; index < content.length; index++) await inputs[index].type(String(content[index]));
      await page.type('textarea', values.notes);
    };
    const waitText = (page, text) => page.waitForFunction((wanted) => document.querySelector('main')?.innerText.includes(wanted), { timeout: 10000 }, text);
    const submit = async (page) => {
      await page.focus('textarea');
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BUTTON');
      await page.keyboard.press('Enter');
    };
    try {
      mkdirSync(outputDir, { recursive: true });
      api = http.createServer(async (req, res) => {
        const headers = { 'Access-Control-Allow-Origin': webOrigin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Contract-Id', 'Access-Control-Allow-Methods': 'PUT, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
        if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
        if (req.method !== 'PUT' || !req.url.endsWith('/student/me/training-sessions/day-browser/check-in')) {
          res.writeHead(404, headers); res.end(JSON.stringify({ error: 'Unexpected test request' })); return;
        }
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        requests.push({ method: req.method, path: req.url, contractId: req.headers['x-contract-id'], body });
        let status = 200, result;
        if (mode === 'temporary') { status = 500; mode = 'success'; result = { success: false, error: 'temporary database failure' }; }
        else if (mode === 'locked' || mode === 'idempotency') {
          status = 409;
          result = { success: false, error: 'Domain rejection', details: { code: mode === 'locked' ? 'PRE_WORKOUT_CHECK_IN_LOCKED' : 'PRE_WORKOUT_CHECK_IN_IDEMPOTENCY_CONFLICT' } };
        } else if (mode === 'unknown-conflict') { status = 409; result = { success: false, error: 'Conflito recuperavel' }; }
        else { const { operationKey, ...submitted } = body; result = { success: true, data: view(submitted) }; }
        res.writeHead(status, headers); res.end(JSON.stringify(result));
      });
      await new Promise((resolve, reject) => { api.once('error', reject); api.listen(0, '127.0.0.1', resolve); });
      process.env.VITE_API_URL = `http://127.0.0.1:${api.address().port}`;
      const { createServer } = await import('vite');
      vite = await createServer({
        root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
        plugins: [{ name: 'issue-388-browser-harness', configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.split('?')[0] !== '/__issue-388.html') return next();
            try { const html = await server.transformIndexHtml('/__issue-388.html', harness); res.setHeader('Content-Type', 'text/html'); res.end(html); }
            catch (error) { next(error); }
          });
        } }],
      });
      await vite.listen();
      webOrigin = `http://127.0.0.1:${vite.httpServer.address().port}`;
      browser = await puppeteer.launch({ executablePath: executablePath(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const page = await browser.newPage();
      page.on('pageerror', (error) => browserErrors.push(error.message));
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
        await page.setViewport(viewport);
        await page.goto(`${webOrigin}/__issue-388.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('textarea', { timeout: 15000 });
        let start = requests.length;
        mode = 'success'; await fill(page); await submit(page); await waitText(page, 'Check-in salvo');
        expect(requests.slice(start)).toHaveLength(1);
        expect(requests[start].contractId).toBe('contract-browser');
        expect(requests[start].body).toMatchObject(values);
        await capture(page, 'success-full', start);

        start = requests.length; await mount(page); await fill(page, true); await submit(page); await waitText(page, 'Check-in salvo');
        expect(requests[start].body.sleepQuality).toBeNull();
        await capture(page, 'success-partial', start);

        start = requests.length; mode = 'temporary'; await mount(page); await fill(page); await submit(page); await waitText(page, 'Seus dados continuam nesta tela');
        const failed = await capture(page, 'temporary-retained-values', start);
        expect(failed.values).toEqual(['8', '7', '3', '5', '9', '45', values.notes]);
        expect(failed.disabled.every((disabled) => !disabled)).toBe(true);
        await submit(page); await waitText(page, 'Check-in salvo');
        expect(requests.slice(start)).toHaveLength(2);
        expect(requests[start + 1].body).toEqual(requests[start].body);
        await capture(page, 'retry-same-operation', start);

        start = requests.length; mode = 'locked'; await mount(page); await fill(page); await submit(page); await waitText(page, 'somente leitura');
        const locked = await capture(page, 'stale-page-locked', start);
        expect(locked.disabled).toEqual([true, true, true, true, true, true, true]);
        expect(locked.values).toEqual(['8', '7', '3', '5', '9', '45', values.notes]);
        expect(locked.buttonCount).toBe(0);
        expect(locked.text).toContain('As altera\u00e7\u00f5es desta tela n\u00e3o foram salvas');
        expect(requests.slice(start)).toHaveLength(1);

        start = requests.length; mode = 'idempotency'; await mount(page); await fill(page); await submit(page); await waitText(page, 'Revise os dados');
        const conflict = await capture(page, 'idempotency-remains-editable', start);
        expect(conflict.disabled.every((disabled) => !disabled)).toBe(true);
        expect(conflict.buttonCount).toBe(1); expect(conflict.alert).not.toMatch(/iniciado|somente leitura/);

        start = requests.length; mode = 'unknown-conflict'; await mount(page); await fill(page); await submit(page); await waitText(page, 'Conflito recuperavel');
        const unknown = await capture(page, 'unknown-409-not-a-session-lock', start);
        expect(unknown.disabled.every((disabled) => !disabled)).toBe(true);
        expect(unknown.alert).not.toMatch(/iniciado|somente leitura/);

        for (const status of ['in_progress', 'completed']) {
          start = requests.length; await mount(page, { status, checkIn: view() });
          const readonly = await capture(page, `initial-${status}`, start);
          expect(readonly.disabled.every(Boolean)).toBe(true); expect(readonly.buttonCount).toBe(0);
          expect(requests.slice(start)).toHaveLength(0);
        }
        start = requests.length;
        await mount(page, { audience: 'professor', checkIn: { ...view(), technical: { ruleSetVersion: 'pre-workout-check-in-v1', technicalMessage: 'Contexto autorizado' } } });
        const professor = await capture(page, 'professor-read-only', start);
        expect(professor.buttonCount).toBe(0); expect(professor.values).toHaveLength(0);
        expect(professor.text).toContain('Contexto autorizado'); expect(requests.slice(start)).toHaveLength(0);
      }
      expect(browserErrors).toEqual([]);
    } finally {
      const evidence = { subjectSha: process.env.VERIFICATION_HEAD_SHA || process.env.GITHUB_SHA || process.env.EVIDENCE_HEAD_SHA || 'local', scope: 'real Chromium + production component/CSS/service; controlled HTTP boundary (database covered separately)', observations, browserErrors };
      writeFileSync(path.join(outputDir, 'browser.json'), JSON.stringify(evidence, null, 2));
      console.info('ISSUE_388_BROWSER_SUMMARY', JSON.stringify({ subjectSha: evidence.subjectSha, scenarios: observations.map(({ scenario, viewport }) => ({ scenario, viewport })), browserErrors }));
      await browser?.close();
      await vite?.close();
      api?.closeAllConnections?.();
      if (api?.listening) await new Promise((resolve) => api.close(resolve));
      if (previousApi === undefined) delete process.env.VITE_API_URL; else process.env.VITE_API_URL = previousApi;
    }
  }, 120000);
});
