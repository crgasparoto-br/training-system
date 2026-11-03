// @vitest-environment node
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { accessSync, constants, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const puppeteer = apiRequire('puppeteer');
const suite = process.env.GITHUB_ACTIONS === 'true' || process.env.ISSUE_400_BROWSER_EVIDENCE === '1'
  ? describe : describe.skip;
const outputDir = path.resolve(process.cwd(), '../../artifacts/issue-400');

function executablePath() {
  for (const candidate of [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* Puppeteer cache */ }
  }
  return puppeteer.executablePath();
}

const harness = [
  '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
  '<body><main id="root" style="max-width:68rem;margin:auto;padding:1rem"></main><script type="module">',
  "import React, { useState } from 'react';",
  "import { createRoot } from 'react-dom/client';",
  "import ResistanceGroupsEditor from '/src/pages/WorkoutBuilder2/ResistanceGroupsEditor.tsx';",
  "import '/src/index.css';",
  "const exercises = [",
  "  { id:'ex-a',name:'Agachamento',section:'sessao',category:'Resistido' },",
  "  { id:'ex-b',name:'Remada',section:'sessao',category:'Resistido' },",
  "  { id:'ex-c',name:'Supino',section:'sessao',category:'Resistido' },",
  "  { id:'ex-d',name:'Trote ciclico',section:'sessao',category:'Ci\\u0301clico' },",
  "];",
  "function App() {",
  "  const [groups, setGroups] = useState([]);",
  "  const [readOnly, setReadOnly] = useState(false);",
  "  window.issue400Groups = () => groups;",
  "  window.issue400SetReadOnly = setReadOnly;",
  "  window.issue400Exercises = () => exercises;",
  "  return React.createElement('fieldset', { disabled: readOnly },",
  "    React.createElement(ResistanceGroupsEditor, { groups, exercises, onChange: setGroups, readOnly }));",
  "}",
  "createRoot(document.getElementById('root')).render(React.createElement(App));",
  '</script></body></html>',
].join('\n');

suite('Issue #400 - editor de agrupamentos em Chromium real', () => {
  it('cria, revisa e desfaz tri-set em desktop, tablet e mobile sem duplicar exercícios', async () => {
    let vite, browser;
    const errors = [], observations = [];
    try {
      mkdirSync(outputDir, { recursive: true });
      const { createServer } = await import('vite');
      vite = await createServer({
        root: process.cwd(), logLevel: 'error',
        server: { host: '127.0.0.1', port: 0 },
        plugins: [{
          name: 'issue-400-browser-evidence',
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url?.split('?')[0] !== '/__issue-400.html') return next();
              try {
                const html = await server.transformIndexHtml('/__issue-400.html', harness);
                res.setHeader('Content-Type', 'text/html');
                res.end(html);
              } catch (error) { next(error); }
            });
          },
        }],
      });
      await vite.listen();
      const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
      browser = await puppeteer.launch({
        executablePath: executablePath(), headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      const page = await browser.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 768, height: 1024 },
        { width: 390, height: 844, isMobile: true, hasTouch: true },
      ]) {
        await page.setViewport(viewport);
        await page.goto(origin + '/__issue-400.html', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof window.issue400Groups === 'function');
        expect(await page.$eval('main', (el) => el.textContent)).toContain('Nenhum agrupamento estruturado');
        await page.evaluate(() => {
          const button = [...document.querySelectorAll('button')]
            .find((item) => item.textContent.includes('Criar grupo'));
          button.click();
        });
        await page.waitForFunction(() => window.issue400Groups()?.length === 1);
        expect(await page.evaluate(() => window.issue400Groups()[0].members.map((m) => m.exerciseRowId)))
          .toEqual(['ex-a', 'ex-b']);
        const selectors = await page.$$('select');
        expect(selectors.length).toBeGreaterThanOrEqual(4);
        await selectors[1].select('tri_set');
        await page.waitForFunction(() => window.issue400Groups()[0]?.members?.length === 3);
        expect(await page.evaluate(() => window.issue400Groups()[0].members.map((m) => m.exerciseRowId)))
          .toEqual(['ex-a', 'ex-b', 'ex-c']);
        for (const [index, value] of [[0, '4'], [1, '35'], [2, '90']]) {
          const inputs = await page.$$('input[type="number"]');
          await inputs[index].type(value);
        }
        await page.waitForFunction(() => window.issue400Groups()[0]?.restBetweenRoundsSec === 90);
        const groups = await page.evaluate(() => window.issue400Groups());
        expect(groups[0]).toMatchObject({
          kind: 'tri_set', rounds: 4, restBetweenExercisesSec: 35, restBetweenRoundsSec: 90,
        });
        const metrics = await page.evaluate(() => ({
          width: window.innerWidth,
          scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          missingLabels: [...document.querySelectorAll('input,select,textarea')]
            .filter((el) => !el.labels?.length && !el.getAttribute('aria-label')).length,
          cyclicOptionExposed: [...document.querySelectorAll('select option')]
            .some((el) => el.value === 'ex-d'),
        }));
        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1);
        expect(metrics.missingLabels).toBe(0);
        expect(metrics.cyclicOptionExposed).toBe(false);
        const filename = String(viewport.width) + '-group-filled.png';
        const png = await page.screenshot({ path: path.join(outputDir, filename), fullPage: true });
        observations.push({ viewport, groups, metrics, screenshot: {
          path: filename, sha256: createHash('sha256').update(png).digest('hex'),
        }, passed: true });
        await page.evaluate(() => {
          const button = [...document.querySelectorAll('button')]
            .find((el) => el.getAttribute('aria-label') === 'Excluir grupo 1');
          button.click();
        });
        await page.waitForFunction(() => window.issue400Groups()?.length === 0);
        expect(await page.evaluate(() => window.issue400Exercises().length)).toBe(4);
        await page.evaluate(() => window.issue400SetReadOnly(true));
        await page.waitForFunction(() => document.querySelector('fieldset')?.disabled === true);
        expect(await page.$$eval('fieldset button,fieldset select', (controls) =>
          controls.every((el) => el.matches(':disabled')))).toBe(true);
      }
      expect(errors).toEqual([]);
    } finally {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(path.join(outputDir, 'browser.json'), JSON.stringify({
        subjectSha: process.env.VERIFICATION_HEAD_SHA || process.env.GITHUB_SHA || 'local',
        scope: 'real Chromium, production ResistanceGroupsEditor and CSS; synthetic component scenario, not authenticated API',
        observations, errors,
      }, null, 2));
      await browser?.close();
      await vite?.close();
    }
  }, 120000);
});
