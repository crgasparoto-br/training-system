// @vitest-environment node
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { accessSync, constants, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const puppeteer = apiRequire('puppeteer');
const suite = process.env.GITHUB_ACTIONS === 'true' || process.env.ISSUE_401_BROWSER_EVIDENCE === '1'
  ? describe : describe.skip;
const outputDir = path.resolve(process.cwd(), '../../artifacts/issue-401');

function chromeExecutable() {
  for (const candidate of [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* Puppeteer cache fallback */ }
  }
  return puppeteer.executablePath();
}

// The production comparison component and CSS are rendered in Chromium with a
// synthetic, explicitly permission-projected API fixture; no authenticated API is claimed.
const harness = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><main id="root" style="max-width:68rem;margin:0 auto;padding:1rem"></main>
<script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkoutExecutionComparisonCard } from '/src/components/training/WorkoutExecutionComparisonCard.tsx';
import '/src/index.css';
const metric = (key, label, planned, executed, unit, difference = null, extra = {}) => ({
  key, label, planned, plannedMax: null, executed, plannedUnit: unit, executedUnit: unit,
  difference, ...extra,
});
const comparison = {
  sessionId: 'day-401', originReleaseId: 'release-401', snapshotSource: 'captured',
  executionVersion: 7, units: [
    { plannedUnitId: 'day-401', parentUnitId: null, iteration: null, kind: 'session',
      label: 'Sessão', outcome: 'incomplete_record', containsSubstitution: true, metrics: [
        { ...metric('duration', 'Duração', 30, 1800, 'min'), executedUnit: 's' },
        metric('distance', 'Distância', null, 5, 'km'),
      ] },
    { plannedUnitId: 'stage-401', parentUnitId: null, iteration: null, kind: 'cyclic_stage',
      label: 'Etapa 1 · trabalho', outcome: 'partial', metrics: [
        metric('duration', 'Duração', 300, 310, 's', 10),
        metric('distance', 'Distância', null, 900, 'm'),
        metric('pse', 'Esforço percebido', null, 0, 'PSE'),
        metric('speed', 'Velocidade', 8, 9, 'km/h', null,
          { plannedConstraint: 'minimum' }),
      ] },
    { plannedUnitId: 'exercise-401', parentUnitId: null, iteration: null, kind: 'exercise',
      label: 'Agachamento e controle da técnica com descrição longa para validar quebra de linha',
      outcome: 'incomplete_record', containsSubstitution: true,
      substitutionNote: 'Alternativa orientada pelo professor durante o treino por limitação do equipamento.',
      metrics: [
        metric('sets', 'Séries com registro', 2, 1, 'séries', -1),
        metric('rir', 'RIR', null, 2, null),
      ] },
    { plannedUnitId: 'block-401', parentUnitId: 'exercise-401', iteration: null,
      kind: 'block', label: 'Bloco 1 · principal', outcome: 'incomplete_record',
      containsSubstitution: true, metrics: [] },
    { plannedUnitId: 'set-401-a', parentUnitId: 'block-401', iteration: null,
      kind: 'set', label: 'Série 1', outcome: 'substituted', executedSetNumber: 1,
      substitutionNote: 'Substituída por alternativa técnica', metrics: [
        metric('repetitions', 'Repetições', 8, 8, 'rep', 0),
        metric('load_kg', 'Carga (kg)', 20, 20.0004, 'kg', 20.0004 - 20),
        metric('rir', 'RIR', 2, 1, null, -1),
        metric('tempo', 'Cadência', '2-0-2', '2-0-2', null),
      ] },
    { plannedUnitId: 'set-401-b', parentUnitId: 'block-401', iteration: null,
      kind: 'set', label: 'Série 2', outcome: 'not_recorded', metrics: [
        metric('load_kg', 'Carga (kg)', 22, null, 'kg'),
      ] },
    { plannedUnitId: 'group-401', parentUnitId: null, iteration: null,
      kind: 'group', label: 'Agrupamento 1 · bi-set', outcome: 'partial', metrics: [
        metric('rounds', 'Rodadas', 3, 2, 'rodadas', -1),
      ] },
  ],
};
const params = new URLSearchParams(location.search);
const audience = params.get('audience') === 'professor' ? 'professor' : 'student';
const studentProjection = (value) => ({ ...value, units: value.units
  .filter((unit) => unit.kind !== 'block' && unit.kind !== 'set')
  .map((unit) => ({ ...unit, metrics: unit.metrics
    .filter((entry) => !['rir', 'rpe', 'tempo'].includes(entry.key))
    .map((entry) => ({ ...entry, difference: null })) })) });
const scoped = audience === 'student' ? studentProjection(comparison) : comparison;
const projected = params.get('legacy') === '1' ? { ...scoped, snapshotSource: 'released_plan',
  units: scoped.units.map((unit) => ({ ...unit, metrics: unit.metrics.map((entry) => ({
    ...entry, planned: null, plannedMax: null, plannedConstraint: null, difference: null,
  })) })) } : scoped;
createRoot(document.getElementById('root')).render(
  React.createElement(WorkoutExecutionComparisonCard, { comparison: projected, audience }));
</script></body></html>`;

suite('Issue #401 - comparação em Chromium real (aluno/professor)', () => {
  it('registra evidências desktop/tablet/mobile, permissões visuais, teclado e histórico legado', async () => {
    let vite, browser;
    const observations = [], errors = [];
    const headSha = process.env.VERIFICATION_HEAD_SHA || process.env.GITHUB_SHA || 'local';
    mkdirSync(outputDir, { recursive: true });
    try {
      const { createServer } = await import('vite');
      vite = await createServer({
        root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
        plugins: [{ name: 'issue-401-browser-evidence', configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.split('?')[0] !== '/__issue-401.html') return next();
            try {
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.end(await server.transformIndexHtml('/__issue-401.html', harness));
            } catch (error) { next(error); }
          });
        } }],
      });
      await vite.listen();
      const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
      browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const page = await browser.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      for (const viewport of [
        { name: 'desktop', width: 1440, height: 900 },
        { name: 'tablet', width: 768, height: 1024 },
        { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
      ]) {
        await page.setViewport(viewport);
        for (const audience of ['student', 'professor']) {
          await page.goto(`${origin}/__issue-401.html?audience=${audience}`, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('section[aria-label="Planejado e executado"] details > summary');
          for (const summary of await page.$$('details > summary')) {
            if (!await summary.evaluate((node) => node.parentElement.open)) await summary.click();
          }
          const first = await page.$('details > summary');
          await first.focus();
          await page.keyboard.press('Enter');
          expect(await first.evaluate((node) => node.parentElement.open)).toBe(false);
          await page.keyboard.press('Space');
          expect(await first.evaluate((node) => node.parentElement.open)).toBe(true);
          const measured = await page.evaluate(() => {
            const region = document.querySelector('section[aria-label="Planejado e executado"]');
            const rect = region.getBoundingClientRect();
            const width = document.documentElement.clientWidth;
            return {
              width, scrollWidth: document.documentElement.scrollWidth,
              regionLeft: rect.left, regionRight: rect.right,
              summaryCount: region.querySelectorAll('summary').length,
              visibleText: region.innerText,
            };
          });
          expect(measured.scrollWidth).toBeLessThanOrEqual(measured.width + 1);
          expect(measured.regionLeft).toBeGreaterThanOrEqual(-1);
          expect(measured.regionRight).toBeLessThanOrEqual(measured.width + 1);
          expect(measured.visibleText).toContain('Planejado × executado');
          expect(measured.visibleText).toContain('Registro incompleto · com substituição');
          expect(measured.visibleText).toContain('Indisponível');
          expect(measured.visibleText).toContain('0 PSE');
          expect(measured.visibleText).toContain('A partir de 8 km/h');
          expect(measured.visibleText).not.toMatch(/Resultado:\s*(melhor|pior)/i);
          if (audience === 'student') {
            expect(measured.visibleText).not.toContain('Série 1');
            expect(measured.visibleText).not.toContain('Bloco 1');
            expect(measured.visibleText).not.toContain('RIR');
            expect(measured.visibleText).not.toContain('diferença:');
            expect(measured.summaryCount).toBe(4);
          } else {
            expect(measured.visibleText).toContain('Série 1 · registro 1');
            expect(measured.visibleText).toContain('Série 2');
            expect(measured.visibleText).toContain('RIR');
            expect(measured.visibleText).toContain('diferença: ≈ 0,0004 kg');
            expect(measured.visibleText).toContain('Diferenças numéricas não significam');
            expect(measured.summaryCount).toBe(7);
          }
          const client = await page.createCDPSession();
          const ax = await client.send('Accessibility.getFullAXTree');
          await client.detach();
          const axFile = `${viewport.name}-${audience}-accessibility.json`;
          writeFileSync(path.join(outputDir, axFile), JSON.stringify(ax, null, 2));
          expect(ax.nodes.some((node) => node.role?.value === 'region'
            && node.name?.value === 'Planejado e executado')).toBe(true);
          const shotFile = `${viewport.name}-${audience}-comparison.png`;
          const png = await page.screenshot({ path: path.join(outputDir, shotFile), fullPage: true });
          observations.push({ viewport: viewport.name, width: viewport.width,
            height: viewport.height, audience, summaryCount: measured.summaryCount,
            scrollWidth: measured.scrollWidth, keyboard: ['Enter', 'Space'],
            screenshot: { path: shotFile, sha256: createHash('sha256').update(png).digest('hex') },
            accessibility: { path: axFile, sha256: createHash('sha256').update(JSON.stringify(ax, null, 2)).digest('hex') },
            passed: true });
        }
      }
      await page.goto(`${origin}/__issue-401.html?audience=student&legacy=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('section[aria-label="Planejado e executado"]');
      const historicalText = await page.$eval('section[aria-label="Planejado e executado"]', (el) => el.innerText);
      expect(historicalText).toContain('execução antiga não possui uma captura congelada');
      expect(historicalText).toContain('metas históricas e');
      expect(historicalText).not.toContain('diferença:');
      const legacyFile = 'mobile-student-historical-fallback.png';
      const legacyPng = await page.screenshot({ path: path.join(outputDir, legacyFile), fullPage: true });
      observations.push({ viewport: 'mobile', audience: 'student', snapshotSource: 'released_plan',
        screenshot: { path: legacyFile, sha256: createHash('sha256').update(legacyPng).digest('hex') },
        passed: true });
      expect(errors).toEqual([]);
      expect(observations).toHaveLength(7);
      console.log(`BROWSER_EVIDENCE_401 PASS head=${headSha} views=${observations.length}`);
    } finally {
      writeFileSync(path.join(outputDir, 'browser.json'), JSON.stringify({
        kind: 'issue-401-real-chromium-visual', subjectSha: headSha,
        scope: 'Production comparison component and CSS in real Chromium; synthetic audience-scoped fixture, not an authenticated API test',
        observations, errors,
      }, null, 2));
      await browser?.close();
      await vite?.close();
    }
  }, 150000);
});
