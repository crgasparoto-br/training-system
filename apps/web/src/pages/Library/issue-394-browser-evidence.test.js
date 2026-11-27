// @vitest-environment node
// Real Chromium + production Library and ExerciseSelectorModal + controlled HTTPS boundary.
// Run explicitly in the CRITICAL CI step so the full test suite does not launch
// competing browsers. The API/authorization invariants are tested separately.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { accessSync, constants, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { createLoopbackTls } from './youtube-browser-tls.mjs';
import { clickNativePlayer } from './youtube-browser-gesture.mjs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const puppeteer = apiRequire('puppeteer');
const suite = process.env.ISSUE_394_BROWSER_EVIDENCE === '1' ? describe : describe.skip;
const outputDir = path.resolve(process.cwd(), '../../artifacts/issue-394');
const subjectSha = process.env.VERIFICATION_HEAD_SHA || process.env.GITHUB_SHA || 'local';

function executablePath() {
  for (const candidate of [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* Puppeteer cache */ }
  }
  return puppeteer.executablePath();
}

function exercise(id, name, status, overrides = {}) {
  return {
    id, name, contractId: 'contract-394', category: 'RESISTIDO',
    muscleGroup: 'Quadríceps', capacity: 'resisted', instructions: ['Posicionar os pés'],
    aliases: [], equipment: ['Halteres'], primaryMuscleGroups: ['Quadríceps'],
    secondaryMuscleGroups: [], joints: [], commonErrors: [], regressions: [],
    progressions: [], alternatives: [], restrictions: [], alerts: [],
    videoUrl: null, mediaOrigin: null, mediaLicense: null,
    curationStatus: status, legacyGrandfathered: false, version: 1,
    createdAt: '2026-11-11T00:00:00.000Z', updatedAt: '2026-11-11T00:00:00.000Z',
    ...overrides,
  };
}

const seed = () => [
  exercise('approved-394', 'Agachamento Curado', 'approved', { reviewedByUserId: 'master-394', videoUrl: 'https://youtu.be/M7lc1UVf-VE', mediaOrigin: 'Própria' }),
  exercise('draft-394', 'Remada Rascunho', 'draft'),
  exercise('inactive-394', 'Exercício Histórico Desativado', 'inactive'),
];

const productionShell = readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const entrypoint = '<script type="module" src="/src/main.tsx"></script>';
if (!productionShell.includes(entrypoint)) throw new Error('Production HTML entrypoint changed');
const harness = productionShell.replace(entrypoint, `<script type="module">
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
const role = new URL(location.href).searchParams.get('role') === 'master' ? 'master' : 'professor';
localStorage.setItem('token', role + '-token-394');
localStorage.setItem('user', JSON.stringify({ id: role + '-user-394', type: 'professor',
  professor: { id: role + '-394', role } }));
window.confirm = () => true;
const { default: Library } = await import('/src/pages/Library/index.tsx');
const { ExerciseSelectorModal } = await import('/src/components/ExerciseSelectorModal.tsx');
function App() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  return React.createElement(React.Fragment, null,
    React.createElement(Library),
    React.createElement('section', { 'aria-label': 'Seletor de montagem de treino', className: 'p-4' },
      React.createElement('button', { type: 'button', onClick: () => setOpen(true) }, 'Abrir seletor operacional'),
      React.createElement('output', { id: 'selected-exercises' }, selected.join(', '))),
    React.createElement(ExerciseSelectorModal, { isOpen: open, section: 'SESSAO',
      onClose: () => setOpen(false), onSelect: value => setSelected([value.name]),
      onSelectMany: values => setSelected(values.map(value => value.name)) }));
}
createRoot(document.getElementById('root')).render(React.createElement(App));
</script>`);

suite('Issue #394 - Biblioteca e seletor em Chrome real', () => {
  it('evidencia criacao, edicao, revisao, filtros e selecao por perfil em tres viewports', async () => {
    let api;
    let vite;
    let browser;
    let webOrigin = '*';
    let exercises = seed();
    let completed = false;
    const observations = [];
    const requests = [];
    const browserErrors = [];
    const previousApiUrl = process.env.VITE_API_URL;
    const json = (res, status, value) => {
      res.writeHead(status, {
        'Access-Control-Allow-Origin': webOrigin,
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Contract-Id',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      });
      res.end(status === 204 ? undefined : JSON.stringify(value));
    };
    const readBody = async (req) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      return body ? JSON.parse(body) : {};
    };
    try {
      mkdirSync(outputDir, { recursive: true });
      const tls = createLoopbackTls();
      api = https.createServer(tls.options, async (req, res) => {
        if (req.method === 'OPTIONS') return json(res, 204, {});
        const url = new URL(req.url, 'https://127.0.0.1');
        const role = String(req.headers.authorization || '').startsWith('Bearer master-token-394')
          ? 'master' : 'professor';
        const body = req.method === 'POST' || req.method === 'PUT' ? await readBody(req) : {};
        requests.push({ method: req.method, path: url.pathname, query: url.searchParams.toString(),
          role, authorizedHeader: Boolean(req.headers.authorization), body });
        if (url.pathname === '/api/v1/library/exercises' && req.method === 'GET') {
          if (url.searchParams.get('scope') === 'all' && role !== 'master') return json(res, 403, { message: 'Acesso negado' });
          let result = exercises.filter(item => url.searchParams.get('scope') === 'all'
            || (item.curationStatus === 'approved' && !item.legacyGrandfathered));
          const search = url.searchParams.get('search')?.toLocaleLowerCase('pt-BR');
          if (search) result = result.filter(item => [item.name, ...item.aliases, item.muscleGroup]
            .some(value => value.toLocaleLowerCase('pt-BR').includes(search)));
          if (url.searchParams.get('category')) result = result.filter(item => item.category === url.searchParams.get('category'));
          if (url.searchParams.get('muscleGroup')) result = result.filter(item => item.muscleGroup === url.searchParams.get('muscleGroup'));
          return json(res, 200, result);
        }
        if (url.pathname === '/api/v1/library/exercises' && req.method === 'POST') {
          if (role !== 'master') return json(res, 403, { message: 'Acesso negado' });
          const created = exercise(`created-${exercises.length}`, body.name, 'draft', body);
          exercises.push(created);
          return json(res, 201, created);
        }
        const edit = url.pathname.match(/^\/api\/v1\/library\/exercises\/([^/]+)$/);
        if (edit && req.method === 'PUT') {
          if (role !== 'master') return json(res, 403, { message: 'Acesso negado' });
          const old = exercises.find(item => item.id === edit[1]);
          if (!old || old.version !== body.expectedVersion) return json(res, 409, { message: 'Conflito de versao' });
          Object.assign(old, body, { version: old.version + 1 });
          return json(res, 200, old);
        }
        const curation = url.pathname.match(/^\/api\/v1\/library\/exercises\/([^/]+)\/curation$/);
        if (curation && req.method === 'POST') {
          if (role !== 'master') return json(res, 403, { message: 'Acesso negado' });
          const old = exercises.find(item => item.id === curation[1]);
          if (!old || old.version !== body.expectedVersion) return json(res, 409, { message: 'Conflito de versao' });
          if (body.action === 'submit' && old.curationStatus === 'draft') old.curationStatus = 'in_review';
          else if (body.action === 'approve' && old.curationStatus === 'in_review'
            && old.capacity && old.instructions?.length) old.curationStatus = 'approved';
          else return json(res, 422, { message: 'Transicao de curadoria invalida' });
          old.version += 1;
          return json(res, 200, old);
        }
        if (/\/revisions$/.test(url.pathname) && req.method === 'GET') return json(res, 200, []);
        return json(res, 404, { message: `Request inesperada: ${req.method} ${url.pathname}` });
      });
      await new Promise((resolve, reject) => { api.once('error', reject); api.listen(0, '127.0.0.1', resolve); });
      process.env.VITE_API_URL = `https://127.0.0.1:${api.address().port}`;
      const { createServer } = await import('vite');
      vite = await createServer({
        root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0, https: tls.options },
        plugins: [{ name: 'issue-394-real-library-browser-harness', configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.split('?')[0] !== '/library') return next();
            try {
              const html = await server.transformIndexHtml('/library', harness);
              res.setHeader('Content-Type', 'text/html');
              res.end(html);
            } catch (error) { next(error); }
          });
        } }],
      });
      await vite.listen();
      webOrigin = `https://127.0.0.1:${vite.httpServer.address().port}`;
      browser = await puppeteer.launch({ executablePath: executablePath(), headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', tls.chromeArg] });
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 768, height: 1024 },
        { width: 390, height: 844, isMobile: true, hasTouch: true },
      ]) {
        exercises = seed();
        const page = await browser.newPage();
        page.on('pageerror', error => browserErrors.push(`${viewport.width}: ${error.message}`));
        page.on('dialog', dialog => dialog.accept());
        // Control external responses, not Chromium's request construction.
        const embedRequests = [];
        await page.setRequestInterception(true);
        page.on('request', request => {
          if (request.url().startsWith('https://www.youtube.com/embed/M7lc1UVf-VE')) {
            embedRequests.push({ url: request.url(), referer: request.headers().referer ?? null,
              authorization: Boolean(request.headers().authorization), cookie: Boolean(request.headers().cookie) });
            const body = request.url().endsWith('?gesture-control=1')
              ? '<button aria-label="Play" style="position:fixed;inset:0" onclick="this.dataset.clicked=String(event.isTrusted)">Play</button>'
              : '<p>Player indisponível (controle)</p>';
            void request.respond({ status: 200, contentType: 'text/html', body });
          } else {
            void request.continue();
          }
        });
        await page.setViewport(viewport);
        const shot = async (phase) => {
          const prefix = `${viewport.width}-${phase}`;
          const png = await page.screenshot({ path: path.join(outputDir, `${prefix}.png`), fullPage: true });
          const accessibility = await page.accessibility.snapshot({ interestingOnly: false });
          writeFileSync(path.join(outputDir, `${prefix}.accessibility.json`), JSON.stringify(accessibility, null, 2));
          const metrics = await page.evaluate(() => ({
            width: window.innerWidth,
            scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
            visibleButtons: [...document.querySelectorAll('button')].filter(button => button.getClientRects().length).length,
          }));
          expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1);
          expect(accessibility).toBeTruthy();
          return { phase, metrics, screenshot: `${prefix}.png`,
            sha256: createHash('sha256').update(png).digest('hex'), accessibility: `${prefix}.accessibility.json` };
        };
        const rows = () => page.$$eval('tbody tr', values => values.map(row => row.textContent));
        const pressInRow = async (name, selector) => {
          const clicked = await page.evaluate(({ name, selector }) => {
            const row = [...document.querySelectorAll('tbody tr')].find(item => item.textContent?.includes(name));
            const button = row?.querySelector(selector);
            if (!button) return false;
            button.click();
            return true;
          }, { name, selector });
          expect(clicked).toBe(true);
        };
        const rename = async (name) => {
          await page.click('#library-exercise-name');
          await page.keyboard.down('Control');
          await page.keyboard.press('A');
          await page.keyboard.up('Control');
          await page.keyboard.type(name);
          await page.click('form button[type="submit"]');
          await page.waitForFunction(expected => [...document.querySelectorAll('tbody tr')]
            .some(row => row.textContent?.includes(expected)), {}, name);
        };
        await page.goto(`${webOrigin}/library?role=master&privacyProbe=synthetic-only`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 3);
        expect(await rows()).toEqual(expect.arrayContaining([expect.stringContaining('Remada Rascunho')]));
        const captures = [await shot('master-list')];
        expect(await page.$eval('meta[name="referrer"]', node => node.content)).toBe('no-referrer');
        expect(await page.evaluate(() => ({ protocol: location.protocol, secure: isSecureContext })))
          .toEqual({ protocol: 'https:', secure: true });
        const actualRequest = page.waitForRequest(request =>
          request.url() === 'https://www.youtube.com/embed/M7lc1UVf-VE' && request.isNavigationRequest());
        await pressInRow('Agachamento Curado', 'button[title="Editar"]');
        await page.waitForSelector('iframe[title="YouTube video player"]');
        const actual = await actualRequest;
        expect(actual.headers().referer).toBe(webOrigin + '/');
        expect(actual.headers().authorization).toBeUndefined();
        expect(actual.headers().cookie).toBeUndefined();
        expect(await page.$eval('a[href="https://www.youtube.com/watch?v=M7lc1UVf-VE"]', link => link.textContent)).toContain('abra no YouTube');
        // A sibling iframe without the exception must still suppress Referer.
        const negativeRequest = page.waitForRequest(request => request.url().endsWith('?referrer-control=1'));
        await page.evaluate(() => {
          const frame = document.createElement('iframe');
          frame.hidden = true;
          frame.src = 'https://www.youtube.com/embed/M7lc1UVf-VE?referrer-control=1';
          document.body.appendChild(frame);
        });
        const negative = await negativeRequest;
        expect(negative.headers().referer ?? null).toBeNull();
        expect(negative.headers().authorization).toBeUndefined();
        await page.evaluate(() => document.querySelector('iframe[src$="?referrer-control=1"]')?.remove());
        captures.push(await shot('master-youtube-fallback'));
        await page.waitForSelector('#library-exercise-name');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('#library-exercise-name'));
        let gestureControl = null;
        if (viewport.width === 1440) {
          // Separate synthetic control: proves actual cross-origin pointer delivery
          // with a different play-button class and rejection of an obstructed target.
          await page.evaluate(() => {
            const frame = document.createElement('iframe');
            frame.id = 'gesture-control';
            frame.style.cssText = 'position:fixed;left:10px;top:10px;width:320px;height:200px;z-index:2147483647';
            frame.src = 'https://www.youtube.com/embed/M7lc1UVf-VE?gesture-control=1';
            document.body.appendChild(frame);
          });
          const gestureFrame = await page.waitForSelector('#gesture-control');
          const child = await gestureFrame.contentFrame();
          await child.waitForSelector('button[aria-label="Play"]');
          expect(await child.$('.ytp-large-play-button')).toBeNull();
          await page.evaluate(() => {
            const cover = document.createElement('div');
            cover.id = 'gesture-cover';
            cover.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
            document.body.appendChild(cover);
          });
          await expect(clickNativePlayer(page, gestureFrame)).rejects.toThrow('obstructed');
          expect(await child.$eval('button', node => node.dataset.clicked ?? null)).toBeNull();
          await page.evaluate(() => document.querySelector('#gesture-cover').remove());
          const gesture = await clickNativePlayer(page, gestureFrame);
          await child.waitForFunction(() => document.querySelector('button').dataset.clicked === 'true');
          gestureControl = { ...gesture, trustedClick: true, obstructedTargetRejected: true, simulated: true };
          await page.evaluate(() => document.querySelector('#gesture-control').remove());
        }
        await pressInRow('Remada Rascunho', 'button[title="Editar"]');
        await page.waitForSelector('#library-exercise-name');
        await rename('Remada Revisada');
        expect(exercises.find(item => item.id === 'draft-394')).toMatchObject({ name: 'Remada Revisada', version: 2 });
        await pressInRow('Remada Revisada', 'button[aria-label="Revisar Remada Revisada"]');
        await page.waitForFunction(() => [...document.querySelectorAll('tbody tr')].some(row =>
          row.textContent?.includes('Remada Revisada') && row.textContent?.includes('Em revisão')));
        await pressInRow('Remada Revisada', 'button[aria-label="Aprovar Remada Revisada"]');
        await page.waitForFunction(() => [...document.querySelectorAll('tbody tr')].some(row =>
          row.textContent?.includes('Remada Revisada') && row.textContent?.includes('Aprovado')));
        expect(exercises.find(item => item.id === 'draft-394')).toMatchObject({ curationStatus: 'approved', version: 4 });
        captures.push(await shot('master-approved'));
        await page.evaluate(() => [...document.querySelectorAll('button')]
          .find(button => button.textContent?.includes('Novo Exercício'))?.click());
        await page.waitForSelector('#library-exercise-name');
        captures.push(await shot('master-create-dialog'));
        await rename('Ponte Rascunho');
        expect(exercises.find(item => item.name === 'Ponte Rascunho')?.curationStatus).toBe('draft');
        await page.focus('input[placeholder="Buscar por nome ou grupo muscular..."]');
        await page.keyboard.type('Agachamento');
        await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
        expect((await rows()).join(' ')).not.toContain('Ponte Rascunho');
        captures.push(await shot('master-filtered'));

        await page.goto(`${webOrigin}/library?role=professor`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2);
        expect((await rows()).join(' ')).not.toContain('Ponte Rascunho');
        expect((await rows()).join(' ')).not.toContain('Exercício Histórico Desativado');
        expect(await page.$$eval('button', buttons => buttons.some(button => button.textContent?.includes('Novo Exercício')))).toBe(false);
        expect(await page.$$eval('tbody tr button[aria-label]', buttons => buttons.length)).toBe(0);
        captures.push(await shot('professor-official-list'));
        await page.evaluate(() => [...document.querySelectorAll('button')]
          .find(button => button.textContent?.includes('Abrir seletor operacional'))?.click());
        await page.waitForFunction(() => [...document.querySelectorAll('h2')]
          .some(heading => heading.textContent === 'Selecionar Exercício'));
        await page.waitForFunction(() => [...document.querySelectorAll('h3')]
          .some(heading => heading.textContent === 'Agachamento Curado'));
        expect(await page.$$eval('h3', headings => headings.map(heading => heading.textContent))).not.toContain('Ponte Rascunho');
        captures.push(await shot('professor-operational-selector'));
        const selected = await page.evaluate(() => {
          const heading = [...document.querySelectorAll('h3')]
            .find(candidate => candidate.textContent === 'Agachamento Curado');
          const button = heading?.closest('button');
          button?.click();
          return Boolean(button);
        });
        expect(selected).toBe(true);
        await page.evaluate(() => [...document.querySelectorAll('button')]
          .find(button => button.textContent?.includes('Adicionar selecionados'))?.click());
        await page.waitForFunction(() => document.querySelector('#selected-exercises')?.textContent === 'Agachamento Curado');
        captures.push(await shot('professor-selected'));
        observations.push({ viewport, captures, embedRequests, webOrigin, gestureControl, passed: true });
        await page.close();
      }
      expect(requests.filter(entry => entry.role === 'professor'
        && entry.method !== 'GET')).toEqual([]);
      expect(requests.filter(entry => entry.role === 'professor'
        && entry.path.endsWith('/exercises') && !entry.query.includes('scope=official'))).toEqual([]);
      expect(requests.some(entry => entry.role === 'master' && entry.method === 'POST'
        && entry.path.endsWith('/curation') && entry.body.action === 'approve')).toBe(true);
      expect(requests.some(entry => entry.role === 'master' && entry.method === 'PUT'
        && entry.body.expectedVersion === 1)).toBe(true);
      expect(requests.every(entry => entry.authorizedHeader)).toBe(true);
      expect(browserErrors).toEqual([]);
      completed = true;
    } finally {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(path.join(outputDir, 'browser.json'), JSON.stringify({
        schemaVersion: 1, kind: 'issue-394-library-browser-evidence',
        repository: 'crgasparoto-br/training-system', subjectSha,
        result: completed ? 'PASS' : 'FAIL',
        scope: 'production Library + ExerciseSelectorModal in Chromium, synthetic authenticated profiles, controlled HTTPS API; backend authorization proved separately',
        observations, requests, browserErrors,
      }, null, 2));
      await browser?.close();
      await vite?.close();
      api?.closeAllConnections?.();
      if (api?.listening) await new Promise(resolve => api.close(resolve));
      if (previousApiUrl === undefined) delete process.env.VITE_API_URL;
      else process.env.VITE_API_URL = previousApiUrl;
    }
  }, 240000);
});
