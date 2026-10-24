// @vitest-environment node
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { accessSync, constants, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const puppeteer = apiRequire('puppeteer');
const suite = process.env.GITHUB_ACTIONS === 'true' || process.env.ISSUE_399_BROWSER_EVIDENCE === '1'
  ? describe : describe.skip;
const outputDir = path.resolve(process.cwd(), '../../artifacts/issue-399');

function executablePath() {
  for (const candidate of [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* Use Puppeteer cache. */ }
  }
  return puppeteer.executablePath();
}

const harness = [
  "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'></head>",
  "<body><main id='root' style='max-width:68rem;margin:auto;padding:1rem'></main>",
  "<script type='module'>",
  "import React, { useState } from 'react';",
  "import { createRoot } from 'react-dom/client';",
  "import ResistanceBlocksEditor from '/src/pages/WorkoutBuilder2/ResistanceBlocksEditor.tsx';",
  "import '/src/index.css';",
  "function App() {",
  "  const [blocks, setBlocks] = useState(undefined);",
  "  window.issue399Read = () => blocks;",
  "  return React.createElement(ResistanceBlocksEditor, { exerciseName: 'Agachamento', blocks, onChange: setBlocks });",
  "}",
  "createRoot(document.getElementById('root')).render(React.createElement(App));",
  "</script></body></html>",
].join('\n');

suite('Issue #399 - editor em navegador real', () => {
  it('comprova legado, valores opcionais, edicao, reflow e teclado em tres viewports', async () => {
    let vite, browser;
    const browserErrors = [];
    const observations = [];
    try {
      mkdirSync(outputDir, { recursive: true });
      const { createServer } = await import('vite');
      vite = await createServer({
        root: process.cwd(),
        logLevel: 'error',
        server: { host: '127.0.0.1', port: 0 },
        plugins: [{
          name: 'issue-399-browser-harness',
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url?.split('?')[0] !== '/__issue-399.html') return next();
              try {
                const html = await server.transformIndexHtml('/__issue-399.html', harness);
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
      page.on('pageerror', (error) => browserErrors.push(error.message));
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 768, height: 1024 },
        { width: 390, height: 844, isMobile: true, hasTouch: true },
      ]) {
        await page.setViewport(viewport);
        await page.goto(origin + '/__issue-399.html', { waitUntil: 'domcontentloaded' });
        const toggle = 'button[aria-label="Detalhar séries de Agachamento"]';
        await page.waitForSelector(toggle, { timeout: 15000 });
        expect(await page.$eval('main', (element) => element.textContent)).toContain('estrutura simples (legado)');
        expect(await page.evaluate(() => window.issue399Read())).toBeUndefined();
        await page.click(toggle);
        expect(await page.evaluate(() => window.issue399Read())).toBeUndefined();
        await page.evaluate(() => {
          const button = [...document.querySelectorAll('button')]
            .find((item) => item.textContent.includes('Adicionar bloco'));
          button.click();
        });
        await page.waitForFunction(() => window.issue399Read()?.length === 1);
        const fresh = await page.evaluate(() => window.issue399Read()[0].plannedSets[0]);
        expect(fresh).toMatchObject({
          position: 1, repsMin: null, repsMax: null, loadKg: null, loadPercent: null,
          rir: null, rpe: null, restSec: null,
        });
        const fill = async (label, value) => {
          await page.type('input[aria-label="' + label + '"]', value);
        };
        await fill('Rep. mín., bloco 1, série 1 de Agachamento', '8');
        await fill('Rep. máx., bloco 1, série 1 de Agachamento', '12');
        await fill('Carga (kg), bloco 1, série 1 de Agachamento', '32.5');
        await fill('RIR, bloco 1, série 1 de Agachamento', '2');
        await fill('Tempo da série 1 do bloco 1 de Agachamento', '3-1-1-0');
        await page.waitForFunction(() => window.issue399Read()?.[0]?.plannedSets?.[0]?.tempo === '3-1-1-0');
        const written = await page.evaluate(() => window.issue399Read()[0].plannedSets[0]);
        expect(written).toMatchObject({
          repsMin: 8, repsMax: 12, loadKg: 32.5, rir: 2, tempo: '3-1-1-0',
          loadPercent: null, rpe: null, restSec: null,
        });
        const metrics = await page.evaluate(() => ({
          width: window.innerWidth,
          scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          interactive: [...document.querySelectorAll('button,input,select')].length,
          missingLabels: [...document.querySelectorAll('input')]
            .filter((el) => !el.labels.length && !el.getAttribute('aria-label')).length,
          blockCount: document.querySelectorAll('main section').length,
        }));
        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1);
        expect(metrics.missingLabels).toBe(0);
        expect(metrics.blockCount).toBe(1);
        const file = String(viewport.width) + '-editor-filled.png';
        const png = await page.screenshot({ path: path.join(outputDir, file), fullPage: true });
        const evidence = {
          viewport, metrics, planned: written,
          screenshot: { path: file, sha256: createHash('sha256').update(png).digest('hex') },
          passed: true,
        };
        observations.push(evidence);
        console.info('ISSUE_399_BROWSER_EVIDENCE', JSON.stringify(evidence));
        await page.focus(toggle);
        await page.keyboard.press('Enter');
        expect(await page.$eval(toggle, (el) => el.getAttribute('aria-expanded'))).toBe('false');
        await page.keyboard.press('Enter');
        expect(await page.$eval(toggle, (el) => el.getAttribute('aria-expanded'))).toBe('true');
        expect(await page.evaluate(() => window.issue399Read()[0].plannedSets[0].loadKg)).toBe(32.5);
      }
      expect(browserErrors).toEqual([]);
    } finally {
      const evidence = {
        subjectSha: process.env.VERIFICATION_HEAD_SHA || process.env.GITHUB_SHA || 'local',
        scope: 'Chrome real with production component/CSS; isolated editor, not authenticated API or full page',
        observations, browserErrors,
      };
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(path.join(outputDir, 'browser.json'), JSON.stringify(evidence, null, 2));
      await browser?.close();
      await vite?.close();
    }
  }, 120000);
});
