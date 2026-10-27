// @vitest-environment node
import { createHash } from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import { accessSync, constants, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const puppeteer = apiRequire('puppeteer');
// This journey owns a real Chromium + Vite + HTTP harness. Keep it out of the
// repository-wide browser batch so it cannot contend for browser/process
// resources with unrelated evidence suites; CI invokes it in a dedicated step.
const suite = process.env.ISSUE_399_BROWSER_EVIDENCE === '1'
  ? describe : describe.skip;
const outputDir = path.resolve(process.cwd(), '../../artifacts/issue-399');

function executablePath() {
  for (const candidate of [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* use Puppeteer cache */ }
  }
  return puppeteer.executablePath();
}

const plan = {
  id: 'plan-browser-399',
  name: 'Plano sintético issue #399',
  alunoId: 'aluno-browser-399',
  startDate: '2026-10-05T12:00:00.000Z',
  endDate: '2026-12-31T12:00:00.000Z',
  updatedAt: '2026-10-05T12:00:00.000Z',
  aluno: { id: 'aluno-browser-399', user: { id: 'user-browser-399', profile: { name: 'Atleta sintético #399' } } },
};

function dayDate(weekNumber, dayOfWeek) {
  const date = new Date('2026-10-05T12:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + ((weekNumber - 1) * 7) + (dayOfWeek - 1));
  return date.toISOString();
}

function makeTemplate(weekNumber) {
  const template = {
    id: `template-browser-399-${weekNumber}`,
    planId: plan.id,
    mesocycleNumber: 1,
    weekNumber,
    weekStartDate: dayDate(weekNumber, 1),
    updatedAt: plan.updatedAt,
    released: false,
    resistanceFrequency: 2,
    workoutDays: [],
  };
  for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek += 1) {
    template.workoutDays.push({
      id: `day-browser-399-${weekNumber}-${dayOfWeek}`,
      templateId: template.id,
      dayOfWeek,
      workoutDate: dayDate(weekNumber, dayOfWeek),
      resistanceTimeMin: null,
      exercises: dayOfWeek === 1 ? [{
        id: `exercise-browser-399-${weekNumber}`,
        workoutDayId: `day-browser-399-${weekNumber}-${dayOfWeek}`,
        exerciseId: 'library-squat-browser-399',
        section: 'sessao',
        exerciseOrder: 1,
        groupBreakBefore: false,
        exercise: { name: 'Agachamento browser #399', category: 'pernas' },
        resistanceBlocks: [],
      }] : [],
    });
  }
  return template;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const harness = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><main id="root"></main><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import '/src/index.css';
localStorage.setItem('token', 'synthetic-professor-token-399');
localStorage.setItem('user', JSON.stringify({ id: 'user-browser-399', type: 'professor', professor: { id: 'professor-browser-399' } }));
const { default: WorkoutBuilder2 } = await import('/src/pages/WorkoutBuilder2/index.tsx');
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter, null,
  React.createElement(Routes, null,
    React.createElement(Route, { path: '/plans/:planId/workout-builder/:mesocycleNumber/:weekNumber', element: React.createElement(WorkoutBuilder2) })
  )
));
</script></body></html>`;

suite('Issue #399 - fluxo full-page em navegador real', () => {
  it('executa professor sintético: carregar, editar, salvar, reabrir, copiar e liberar', async () => {
    let api;
    let vite;
    let browser;
    let webOrigin = '';
    const templates = new Map(Array.from({ length: 4 }, (_, index) => [index + 1, makeTemplate(index + 1)]));
    const requests = [];
    const observations = [];
    const browserErrors = [];
    let copyFailuresRemaining = 1;
    let saveConflictTriggered = false;
    const previousApi = process.env.VITE_API_URL;
    const json = (res, status, body, origin) => {
      res.writeHead(status, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Contract-Id',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(body));
    };
    const findTemplate = (id) => [...templates.values()].find((template) => template.id === id);
    const findDay = (id) => [...templates.values()].flatMap((template) => template.workoutDays).find((day) => day.id === id);
    const readBody = async (req) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      return raw ? JSON.parse(raw) : {};
    };
    const route = (url) => new URL(url, 'http://127.0.0.1').pathname;
    try {
      mkdirSync(outputDir, { recursive: true });
      api = http.createServer(async (req, res) => {
        const origin = webOrigin || '*';
        if (req.method === 'OPTIONS') return json(res, 204, {}, origin);
        const pathname = route(req.url);
        const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
        requests.push({ method: req.method, path: pathname, body });

        if (req.method === 'GET' && pathname === '/api/v1/plans/plan-browser-399') return json(res, 200, { success: true, data: plan }, origin);
        if (req.method === 'GET' && pathname === '/api/v1/alunos/aluno-browser-399') return json(res, 200, { success: true, data: plan.aluno }, origin);
        if (req.method === 'GET' && pathname === '/api/v1/alunos/aluno-browser-399/assessments') return json(res, 200, { success: true, data: [] }, origin);
        if (req.method === 'GET' && pathname === '/api/v1/periodization/matrix/plan-browser-399') return json(res, 404, { error: 'matrix not found' }, origin);
        if (req.method === 'GET' && pathname.startsWith('/api/v1/periodization/parameters')) return json(res, 200, { success: true, data: [] }, origin);
        if (req.method === 'POST' && pathname === '/api/v1/workout/templates/get-or-create') {
          const week = Number(body.weekNumber);
          const template = templates.get(week) || makeTemplate(week);
          template.weekStartDate = body.weekStartDate || template.weekStartDate;
          templates.set(week, template);
          return json(res, 200, clone(template), origin);
        }
        if (req.method === 'GET' && pathname.startsWith('/api/v1/workout/templates/')) {
          const template = findTemplate(pathname.split('/').pop());
          return template ? json(res, 200, clone(template), origin) : json(res, 404, { error: 'template not found' }, origin);
        }
        if (req.method === 'PUT' && /^\/api\/v1\/workout\/templates\/[^/]+$/.test(pathname)) {
          const template = findTemplate(pathname.split('/').pop());
          if (!template) return json(res, 404, { error: 'template not found' }, origin);
          Object.assign(template, body);
          return json(res, 200, clone(template), origin);
        }
        if (req.method === 'PUT' && /^\/api\/v1\/workout\/templates\/[^/]+\/save-week$/.test(pathname)) {
          const template = findTemplate(pathname.split('/')[5]);
          if (!template) return json(res, 404, { error: 'template not found' }, origin);
          const hasStructuredEdit = Object.values(body.resistedExercises || {})
            .some((sections) => Object.values(sections || {}).some((exercises) =>
              Array.isArray(exercises) && exercises.some((exercise) => (exercise.resistanceBlocks || []).length > 0)));
          if (!saveConflictTriggered && hasStructuredEdit && body.baseUpdatedAt) {
            saveConflictTriggered = true;
            template.workoutDays[0].detailNotes = 'alteração remota preservada #399';
            template.updatedAt = new Date(Date.parse(template.updatedAt || plan.updatedAt) + 5000).toISOString();
            return json(res, 409, {
              code: 'WORKOUT_PLANNING_VERSION_CONFLICT',
              error: 'O treino foi alterado em outra sessão.',
            }, origin);
          }
          Object.assign(template, body.template || {});
          for (const rawDay of body.workoutDays || []) {
            const day = template.workoutDays.find((candidate) => candidate.dayOfWeek === Number(rawDay.dayOfWeek));
            if (day) Object.assign(day, rawDay);
          }
          for (const [dayKey, sections] of Object.entries(body.resistedExercises || {})) {
            const day = template.workoutDays.find((candidate) => candidate.dayOfWeek === Number(dayKey));
            if (!day) continue;
            const exercises = ['mobilidade', 'sessao', 'resfriamento'].flatMap((section) =>
              Array.isArray(sections?.[section]) ? sections[section] : []);
            day.exercises = exercises.map((exercise, index) => ({
              ...exercise,
              id: exercise.workoutExerciseId || `exercise-browser-399-${template.weekNumber}-${index}`,
              workoutDayId: day.id,
              exercise: { name: 'Agachamento browser #399', category: 'pernas' },
              resistanceBlocks: exercise.resistanceBlocks || [],
            }));
          }
          template.updatedAt = new Date(Date.parse(template.updatedAt || plan.updatedAt) + 1000).toISOString();
          return json(res, 200, clone(template), origin);
        }
        if (req.method === 'POST' && /^\/api\/v1\/workout\/templates\/[^/]+\/copy$/.test(pathname)) {
          if (copyFailuresRemaining > 0) {
            copyFailuresRemaining -= 1;
            return json(res, 503, { error: 'Falha transitória controlada no replay #399' }, origin);
          }
          const source = findTemplate(pathname.split('/')[5]);
          const targetWeek = Number(body.targetWeekNumber);
          const target = clone(source);
          target.id = `template-browser-399-${targetWeek}`;
          target.weekNumber = targetWeek;
          target.weekStartDate = body.targetWeekStartDate;
          target.released = false;
          target.workoutDays = target.workoutDays.map((day) => ({
            ...day,
            id: `day-browser-399-${targetWeek}-${day.dayOfWeek}`,
            templateId: target.id,
            workoutDate: dayDate(targetWeek, day.dayOfWeek),
            exercises: day.exercises.map((exercise) => ({
              ...exercise,
              id: `exercise-browser-399-${targetWeek}`,
              workoutDayId: `day-browser-399-${targetWeek}-${day.dayOfWeek}`,
            })),
          }));
          templates.set(targetWeek, target);
          return json(res, 200, clone(target), origin);
        }
        if (req.method === 'POST' && /^\/api\/v1\/workout\/templates\/[^/]+\/release$/.test(pathname)) {
          const template = findTemplate(pathname.split('/')[5]);
          if (!template) return json(res, 404, { error: 'template not found' }, origin);
          template.released = true;
          return json(res, 200, clone(template), origin);
        }
        if (req.method === 'POST' && pathname === '/api/v1/workout/days/get-or-create') {
          const day = findTemplate(body.templateId)?.workoutDays.find((item) => item.dayOfWeek === Number(body.dayOfWeek));
          return day ? json(res, 200, clone(day), origin) : json(res, 404, { error: 'day not found' }, origin);
        }
        if (req.method === 'PUT' && /^\/api\/v1\/workout\/days\/[^/]+$/.test(pathname)) {
          const day = findDay(pathname.split('/').pop());
          if (!day) return json(res, 404, { error: 'day not found' }, origin);
          Object.assign(day, body);
          return json(res, 200, clone(day), origin);
        }
        if (req.method === 'PUT' && /^\/api\/v1\/workout\/days\/[^/]+\/resistance-exercises$/.test(pathname)) {
          const day = findDay(pathname.split('/')[5]);
          if (!day) return json(res, 404, { error: 'day not found' }, origin);
          day.exercises = (body.exercises || []).map((exercise, index) => ({
            ...exercise,
            id: exercise.workoutExerciseId || `exercise-browser-399-${day.templateId}-${index}`,
            workoutDayId: day.id,
            exercise: { name: 'Agachamento browser #399', category: 'pernas' },
          }));
          return json(res, 200, clone(day.exercises), origin);
        }
        return json(res, 404, { error: `Unexpected test request ${req.method} ${pathname}` }, origin);
      });
      await new Promise((resolve, reject) => { api.once('error', reject); api.listen(0, '127.0.0.1', resolve); });
      process.env.VITE_API_URL = `http://127.0.0.1:${api.address().port}`;
      const { createServer } = await import('vite');
      vite = await createServer({
        root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
        plugins: [{ name: 'issue-399-full-page-browser-harness', configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const requestPath = req.url?.split('?')[0] || '';
            if (requestPath !== '/__issue-399-full.html' && !requestPath.startsWith('/plans/')) return next();
            try {
              const html = await server.transformIndexHtml(requestPath, harness);
              res.setHeader('Content-Type', 'text/html');
              res.end(html);
            } catch (error) { next(error); }
          });
        } }],
      });
      await vite.listen();
      webOrigin = `http://127.0.0.1:${vite.httpServer.address().port}`;
      browser = await puppeteer.launch({ executablePath: executablePath(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const page = await browser.newPage();
      page.on('pageerror', (error) => browserErrors.push(error.message));
      page.on('dialog', async (dialog) => {
        if (dialog.type() === 'prompt') await dialog.accept('2');
        else await dialog.accept();
      });
      const clickText = async (text) => {
        const clicked = await page.evaluate((wanted) => {
          const button = [...document.querySelectorAll('button')]
            .find((candidate) => candidate.textContent?.trim().includes(wanted));
          if (!button) return false;
          button.click();
          return true;
        }, text);
        expect(clicked).toBe(true);
      };
      const clickTextAt = async (text, targetIndex) => {
        const clicked = await page.evaluate(({ wanted, index }) => {
          const matches = [...document.querySelectorAll('button')]
            .filter((candidate) => candidate.textContent?.trim().includes(wanted));
          if (!matches[index]) return false;
          matches[index].click();
          return true;
        }, { wanted: text, index: targetIndex });
        expect(clicked).toBe(true);
      };
      const viewports = [
        { width: 1440, height: 900 },
        { width: 768, height: 1024 },
        { width: 390, height: 844, isMobile: true, hasTouch: true },
      ];
      for (const viewport of viewports) {
        await page.setViewport(viewport);
        const routeWeek = viewport.width === 1440 ? 1 : 2;
        await page.goto(`${webOrigin}/plans/plan-browser-399/workout-builder/1/${routeWeek}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('main')?.innerText.includes('Parâmetros do Treino'), { timeout: 20000 });
        await page.waitForFunction(() => document.querySelectorAll('button').length > 10, { timeout: 20000 });
        if (viewport.width === 1440) {
          await clickText('Próximo Mesociclo');
          try {
            await page.waitForFunction(() => location.pathname.includes('/workout-builder/2/1'), { timeout: 20000 });
          } catch (error) {
            const navigationState = await page.evaluate(() => ({
              pathname: location.pathname,
              nextDisabled: [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Próximo Mesociclo'))?.disabled,
              alert: document.querySelector('[role="alert"]')?.textContent || null,
              saving: document.body.innerText.includes('Salvando'),
            }));
            throw new Error(`${error.message}; navigationState=${JSON.stringify(navigationState)}`);
          }
          await page.waitForFunction(() => document.querySelector('main')?.innerText.includes('Parâmetros do Treino'), { timeout: 20000 });
          await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('Mesociclo Anterior')), { timeout: 20000 });
          await clickText('Mesociclo Anterior');
          await page.waitForFunction(() => location.pathname.includes('/workout-builder/1/1'), { timeout: 20000 });
          await page.waitForFunction(() => document.querySelector('main')?.innerText.includes('Parâmetros do Treino'), { timeout: 20000 });
          await clickText('Treinamento Resistido');
          await page.waitForSelector('button[aria-label="Detalhar séries de Agachamento browser #399"]', { timeout: 15000 });
          await page.click('button[aria-label="Detalhar séries de Agachamento browser #399"]');
          await clickText('Adicionar bloco');
          await page.waitForFunction(() => document.querySelector('input[aria-label*="Rep. mín."]') !== null, { timeout: 10000 });
          await page.type('input[aria-label*="Rep. mín."]', '8');
          await page.type('input[aria-label*="Rep. máx."]', '12');
          await page.type('input[aria-label*="Carga (kg)"]', '32.5');
          await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
          await new Promise((resolve, reject) => {
            const deadline = Date.now() + 20000;
            const check = () => {
              if (requests.some((request) => request.path.endsWith('/save-week'))) return resolve();
              if (Date.now() >= deadline) return reject(new Error('pagehide save-week request was not observed'));
              setTimeout(check, 50);
            };
            check();
          });
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => document.querySelector('main')?.innerText.includes('Parâmetros do Treino'), { timeout: 20000 });
          const remoteAfterConflict = await page.evaluate(async () => {
            const response = await fetch('/api/v1/workout/templates/template-browser-399-1');
            const payload = await response.json();
            return payload.workoutDays?.[0]?.detailNotes;
          });
          expect(remoteAfterConflict).toBe('alteração remota preservada #399');
          await clickText('Copiar Semana');
          await page.waitForFunction(() => document.querySelector('[role="alert"]')?.innerText.includes('Erro ao copiar semana'), { timeout: 20000 });
          await clickText('Tentar novamente');
          // Success is announced with a browser dialog, not rendered into the
          // page. The negative alert disappearing is the deterministic DOM
          // observation that the retry completed without another copy error.
          await page.waitForFunction(() => !document.querySelector('[role="alert"]')?.innerText.includes('Erro ao copiar semana'), { timeout: 20000 });
          await clickTextAt('Liberar', 1);
          await page.waitForFunction(() => document.querySelector('main')?.innerText.includes('Treino liberado com sucesso') || document.querySelector('main')?.innerText.includes('Erro ao liberar treino'), { timeout: 20000 }).catch(() => {});
          await page.goto(`${webOrigin}/plans/plan-browser-399/workout-builder/1/2`, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => document.querySelector('main')?.innerText.includes('Parâmetros do Treino'), { timeout: 20000 });
        }
        const cyclicMissingLabels = await page.evaluate(() =>
          [...document.querySelectorAll('input,textarea,select')]
            .filter((field) => !field.labels.length && !field.getAttribute('aria-label')).length);
        expect(cyclicMissingLabels).toBe(0);
        await clickText('Treinamento Resistido');
        await page.waitForFunction(() => document.querySelector('main')?.innerText.includes('Agachamento browser #399'), { timeout: 15000 });
        const observed = await page.evaluate(() => ({
          text: document.querySelector('main')?.innerText || '',
          width: innerWidth,
          scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          missingLabels: [...document.querySelectorAll('input,textarea,select')].filter((field) => !field.labels.length && !field.getAttribute('aria-label')).length,
          releasedDisabled: [...document.querySelectorAll('[data-workout-week="2"] input,[data-workout-week="2"] textarea,[data-workout-week="2"] select')].some((field) => field.disabled),
          releasedReadOnlyFieldset: [...document.querySelectorAll('[data-workout-week="2"] fieldset[disabled]')].length > 0,
          releasedEditableFields: [...document.querySelectorAll('[data-workout-week="2"] fieldset:not([disabled]) input,[data-workout-week="2"] fieldset:not([disabled]) textarea')]
            .filter((field) => !field.disabled && field.getAttribute('aria-disabled') !== 'true').length,
          weekHeaders: [...document.querySelectorAll('h2')].filter((heading) => heading.textContent?.includes('Semana')).length,
        }));
        expect(observed.scrollWidth).toBeLessThanOrEqual(observed.width + 1);
        expect(observed.missingLabels).toBe(0);
        expect(observed.text).toContain('Agachamento browser #399');
        expect(observed.releasedReadOnlyFieldset).toBe(true);
        expect(observed.releasedEditableFields).toBe(0);
        const screenshot = await page.screenshot({ path: path.join(outputDir, `${viewport.width}-full-page.png`), fullPage: true });
        observations.push({ viewport, observed, screenshot: { sha256: createHash('sha256').update(screenshot).digest('hex') }, passed: true });
      }
      expect(requests.some((request) => request.path.endsWith('/save-week'))).toBe(true);
      expect(requests.filter((request) => request.path.endsWith('/save-week')).length).toBeGreaterThanOrEqual(2);
      expect(requests.filter((request) => request.path.endsWith('/save-week'))
        .some((request) => typeof request.body?.baseUpdatedAt === 'string')).toBe(true);
      expect(requests.filter((request) => request.path.endsWith('/copy')).length).toBeGreaterThanOrEqual(2);
      expect(requests.some((request) => request.path.endsWith('/release'))).toBe(true);
      expect(browserErrors).toEqual([]);
    } finally {
      const evidence = {
        subjectSha: process.env.VERIFICATION_HEAD_SHA || process.env.GITHUB_SHA || 'local',
        scope: 'real Chromium + production WorkoutBuilder2 page/components/CSS + synthetic professor session + controlled HTTP API boundary; PostgreSQL invariants covered by integration tests',
        observations,
        requests,
        browserErrors,
      };
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(path.join(outputDir, 'full-page-browser.json'), JSON.stringify(evidence, null, 2));
      await browser?.close();
      await vite?.close();
      api?.closeAllConnections?.();
      if (api?.listening) await new Promise((resolve) => api.close(resolve));
      if (previousApi === undefined) delete process.env.VITE_API_URL; else process.env.VITE_API_URL = previousApi;
    }
  }, 180000);
});
