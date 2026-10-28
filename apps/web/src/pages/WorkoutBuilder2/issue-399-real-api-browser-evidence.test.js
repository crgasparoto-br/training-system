// @vitest-environment node
import { accessSync, constants, mkdirSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const puppeteer = apiRequire('puppeteer');
const { PrismaClient } = apiRequire('@prisma/client');
const jwt = apiRequire('jsonwebtoken');
const suite = process.env.ISSUE_399_REAL_API_BROWSER_EVIDENCE === '1' ? describe : describe.skip;
const outputDir = path.resolve(process.cwd(), '../../artifacts/issue-399');
const repoRoot = path.resolve(process.cwd(), '../..');

function executablePath() {
  for (const candidate of [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* use Puppeteer cache */ }
  }
  return puppeteer.executablePath();
}

function waitForHealth(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const response = await fetch(`${url}/health`);
        if (response.ok) return resolve();
      } catch { /* API is still starting. */ }
      if (Date.now() - startedAt >= timeoutMs) return reject(new Error(`API did not become ready: ${url}`));
      setTimeout(poll, 250);
    };
    void poll();
  });
}

async function startVite(apiOrigin) {
  process.env.VITE_API_URL = apiOrigin;
  const { createServer } = await import('vite');
  const harness = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><main id="root"></main><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import '/src/index.css';
localStorage.setItem('token', ${JSON.stringify(process.env.ISSUE_399_REAL_BROWSER_TOKEN)});
localStorage.setItem('user', ${JSON.stringify(JSON.stringify({ type: 'professor' }))});
const { default: WorkoutBuilder2 } = await import('/src/pages/WorkoutBuilder2/index.tsx');
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter, null,
  React.createElement(Routes, null,
    React.createElement(Route, { path: '/plans/:planId/workout-builder/:mesocycleNumber/:weekNumber', element: React.createElement(WorkoutBuilder2) })
  )
));
</script></body></html>`;
  const vite = await createServer({
    root: process.cwd(),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'issue-399-real-api-browser-harness',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const requestPath = req.url?.split('?')[0] || '';
          if (!requestPath.startsWith('/plans/')) return next();
          try {
            const html = await server.transformIndexHtml(requestPath, harness);
            res.setHeader('Content-Type', 'text/html');
            res.end(html);
          } catch (error) { next(error); }
        });
      },
    }],
  });
  await vite.listen();
  return { vite, origin: `http://127.0.0.1:${vite.httpServer.address().port}` };
}

suite('Issue #399 - fluxo full-page contra API real', () => {
  it('executa professor ativo: criar, editar, salvar, reabrir, copiar e liberar', async () => {
    const prisma = new PrismaClient();
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const ids = {
      contract: `issue399-real-contract-${suffix}`,
      function: `issue399-real-function-${suffix}`,
      user: `issue399-real-user-${suffix}`,
      profile: `issue399-real-profile-${suffix}`,
      professor: `issue399-real-professor-${suffix}`,
      alunoUser: `issue399-real-aluno-user-${suffix}`,
      alunoProfile: `issue399-real-aluno-profile-${suffix}`,
      aluno: `issue399-real-aluno-${suffix}`,
      plan: `issue399-real-plan-${suffix}`,
      exercise: `issue399-real-exercise-${suffix}`,
      template: `issue399-real-template-${suffix}`,
      day: `issue399-real-day-${suffix}`,
      workoutExercise: `issue399-real-workout-exercise-${suffix}`,
      block: `issue399-real-block-${suffix}`,
      set: `issue399-real-set-${suffix}`,
    };
    let apiProcess;
    let vite;
    let browser;
    const responses = [];
    const browserErrors = [];
    const apiLogs = [];
    const observations = [];
    const apiPort = Number(process.env.ISSUE_399_REAL_API_PORT || 19193);
    const apiOrigin = `http://127.0.0.1:${apiPort}`;
    const token = jwt.sign({ userId: ids.user, email: `${ids.user}@example.test`, type: 'professor' }, process.env.ISSUE_399_REAL_JWT_SECRET || 'issue399-real-secret', { expiresIn: '1h' });
    process.env.ISSUE_399_REAL_BROWSER_TOKEN = token;

    try {
      const contract = await prisma.companyContract.create({ data: { id: ids.contract, type: 'personal', document: `issue399-document-${suffix}` } });
      const collaboratorFunction = await prisma.collaboratorFunctionOption.create({ data: { id: ids.function, contractId: contract.id, name: 'Professor #399', code: `issue399-${suffix}`, isActive: true, isSystem: false } });
      const user = await prisma.user.create({ data: { id: ids.user, email: `${ids.user}@example.test`, passwordHash: 'fixture-only', type: 'professor', profile: { create: { id: ids.profile, name: 'Professor #399' } } } });
      const professor = await prisma.professor.create({ data: { id: ids.professor, userId: user.id, contractId: contract.id, collaboratorFunctionId: collaboratorFunction.id, currentStatus: 'active' } });
      const alunoUser = await prisma.user.create({ data: { id: ids.alunoUser, email: `${ids.alunoUser}@example.test`, passwordHash: 'fixture-only', type: 'aluno', profile: { create: { id: ids.alunoProfile, name: 'Aluno #399' } } } });
      const aluno = await prisma.aluno.create({ data: { id: ids.aluno, userId: alunoUser.id, contractId: contract.id, professorId: professor.id, status: 'ACTIVE_STUDENT', leadName: 'Aluno #399' } });
      const plan = await prisma.trainingPlan.create({ data: { id: ids.plan, professorId: professor.id, alunoId: aluno.id, name: 'Plano #399 real', startDate: new Date('2026-10-05T12:00:00.000Z'), endDate: new Date('2026-11-01T12:00:00.000Z') } });
      const exercise = await prisma.exerciseLibrary.create({ data: { id: ids.exercise, contractId: contract.id, name: 'Agachamento real #399', category: 'pernas' } });
      const template = await prisma.workoutTemplate.create({ data: { id: ids.template, planId: plan.id, mesocycleNumber: 1, weekNumber: 1, weekStartDate: new Date('2026-10-05T12:00:00.000Z') } });
      const day = await prisma.workoutDay.create({ data: { id: ids.day, templateId: template.id, dayOfWeek: 1, workoutDate: new Date('2026-10-05T12:00:00.000Z') } });
      const workoutExercise = await prisma.workoutExercise.create({ data: { id: ids.workoutExercise, workoutDayId: day.id, exerciseId: exercise.id, section: 'sessao', exerciseOrder: 1 } });

      const web = await startVite(apiOrigin);
      vite = web.vite;
      const webOrigin = web.origin;
      apiProcess = spawn('pnpm', ['--filter', '@corrida/api', 'exec', 'tsx', 'src/main.ts'], {
        cwd: repoRoot,
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL,
          JWT_SECRET: process.env.ISSUE_399_REAL_JWT_SECRET || 'issue399-real-secret',
          PORT: String(apiPort),
          NODE_ENV: 'test',
          CORS_ORIGIN: webOrigin,
          FRONTEND_URL: webOrigin,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      apiProcess.stdout?.on('data', (chunk) => apiLogs.push(String(chunk).slice(0, 2000)));
      apiProcess.stderr?.on('data', (chunk) => apiLogs.push(String(chunk).slice(0, 2000)));
      await waitForHealth(apiOrigin);

      browser = await puppeteer.launch({ executablePath: executablePath(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const page = await browser.newPage();
      page.on('pageerror', (error) => browserErrors.push(error.message));
      page.on('response', (response) => {
        const pathname = new URL(response.url()).pathname;
        if (pathname.includes('/api/v1/')) {
          const entry = { method: response.request().method(), path: pathname, status: response.status() };
          if (response.status() >= 400) {
            entry.requestBody = response.request().postData()?.slice(0, 2000);
            void response.text().then((body) => { entry.body = body.slice(0, 500); }).catch(() => undefined);
          }
          responses.push(entry);
        }
      });
      page.on('dialog', async (dialog) => {
        if (dialog.type() === 'prompt') await dialog.accept('2');
        else await dialog.accept();
      });
      const clickText = async (text) => {
        const clicked = await page.evaluate((wanted) => {
          const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim().includes(wanted));
          if (!button) return false;
          button.click();
          return true;
        }, text);
        expect(clicked).toBe(true);
      };
      const clickExactTextAt = async (text, index) => {
        const clicked = await page.evaluate(({ wanted, targetIndex }) => {
          const matches = [...document.querySelectorAll('button')]
            .filter((candidate) => candidate.textContent?.trim() === wanted && !candidate.disabled);
          const button = matches[targetIndex];
          if (!button) return false;
          button.click();
          return true;
        }, { wanted: text, targetIndex: index });
        expect(clicked).toBe(true);
      };
      const replaceInputValue = async (selector, value) => {
        await page.click(selector, { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type(selector, value);
      };
      const viewports = [
        { width: 1440, height: 900 },
        { width: 768, height: 1024 },
        { width: 390, height: 844, isMobile: true, hasTouch: true },
      ];
      mkdirSync(outputDir, { recursive: true });
      for (const viewport of viewports) {
        await page.setViewport(viewport);
        const routeWeek = viewport.width === 1440 ? 1 : 2;
        await page.goto(`${webOrigin}/plans/${ids.plan}/workout-builder/1/${routeWeek}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('main')?.innerText.includes('Parâmetros do Treino'), { timeout: 30000 });
        await page.waitForFunction(() => document.querySelectorAll('button').length > 10, { timeout: 30000 });
        if (viewport.width === 1440) {
          await clickText('Treinamento Resistido');
          await page.waitForSelector('button[aria-label="Detalhar séries de Agachamento real #399"]', { timeout: 20000 });
          await page.click('button[aria-label="Detalhar séries de Agachamento real #399"]');
          await clickText('Adicionar bloco');
          await page.waitForFunction(() => document.querySelector('input[aria-label*="Rep. mín."]') !== null, { timeout: 15000 });
          await replaceInputValue('input[aria-label*="Rep. mín."]', '8');
          await replaceInputValue('input[aria-label*="Rep. máx."]', '12');
          await replaceInputValue('input[aria-label*="Carga (kg)"]', '32.5');
          await new Promise((resolve) => setTimeout(resolve, 2500));
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => document.querySelector('main')?.innerText.includes('Parâmetros do Treino'), { timeout: 30000 });
          const persistedEditorData = await prisma.workoutExercise.findUniqueOrThrow({
            where: { id: ids.workoutExercise },
            include: { resistanceBlocks: { include: { plannedSets: true } } },
          });
          expect(persistedEditorData.resistanceBlocks).toHaveLength(1);
          expect(persistedEditorData.resistanceBlocks[0].plannedSets).toHaveLength(1);
          expect(persistedEditorData.resistanceBlocks[0].plannedSets[0]).toMatchObject({ repsMin: 8, repsMax: 12, loadKg: 32.5 });
          const sourceBlockId = persistedEditorData.resistanceBlocks[0].id;
          const sourceSetId = persistedEditorData.resistanceBlocks[0].plannedSets[0].id;
          await clickText('Treinamento Resistido');
          await page.waitForSelector('button[aria-label="Detalhar séries de Agachamento real #399"]', { timeout: 20000 });
          const copyResponse = page.waitForResponse((response) => response.url().includes('/api/v1/workout/templates/') && response.url().endsWith('/copy') && response.request().method() === 'POST', { timeout: 30000 });
          await clickText('Copiar Semana');
          expect((await copyResponse).status()).toBe(200);
          const releaseResponse = page.waitForResponse((response) => response.url().includes('/api/v1/workout/templates/') && response.url().endsWith('/release') && response.request().method() === 'POST', { timeout: 30000 });
          await clickExactTextAt('Liberar', 1);
          expect((await releaseResponse).status()).toBe(200);
          const copiedTarget = await prisma.workoutTemplate.findFirstOrThrow({
            where: { planId: ids.plan, mesocycleNumber: 1, weekNumber: 2 },
            include: {
              workoutDays: {
                include: { exercises: { include: { resistanceBlocks: { include: { plannedSets: true } } } } },
              },
            },
          });
          expect(copiedTarget.released).toBe(true);
          expect(copiedTarget.workoutDays.length).toBeGreaterThan(0);
          const copiedExercise = copiedTarget.workoutDays.flatMap((copiedDay) => copiedDay.exercises)
            .find((candidate) => candidate.exerciseId === ids.exercise && candidate.resistanceBlocks.length > 0);
          expect(copiedExercise).toBeDefined();
          expect(copiedExercise?.id).not.toBe(ids.workoutExercise);
          expect(copiedExercise?.resistanceBlocks).toHaveLength(1);
          expect(copiedExercise?.resistanceBlocks[0].id).not.toBe(sourceBlockId);
          expect(copiedExercise?.resistanceBlocks[0].plannedSets).toHaveLength(1);
          expect(copiedExercise?.resistanceBlocks[0].plannedSets[0].id).not.toBe(sourceSetId);
          expect(copiedExercise?.resistanceBlocks[0].plannedSets[0]).toMatchObject({ repsMin: 8, repsMax: 12, loadKg: 32.5 });
          await page.goto(`${webOrigin}/plans/${ids.plan}/workout-builder/1/2`, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => document.querySelector('main')?.innerText.includes('Parâmetros do Treino'), { timeout: 30000 });
          await clickText('Treinamento Resistido');
          await page.waitForFunction(() => document.querySelector('main')?.innerText.includes('Agachamento real #399'), { timeout: 20000 });
          const openedTargetDetail = await page.evaluate(() => {
            const buttons = [...document.querySelectorAll('button[aria-label="Detalhar séries de Agachamento real #399"]')];
            const button = buttons[1];
            if (!button) return false;
            button.click();
            return true;
          });
          expect(openedTargetDetail).toBe(true);
          const releasedState = await page.evaluate(() => ({
            releaseButtons: [...document.querySelectorAll('button')]
              .filter((button) => button.textContent?.trim() === 'Liberar')
              .map((button) => button.disabled),
            releasedLabels: [...document.querySelectorAll('main *')]
              .filter((element) => element.textContent?.trim() === 'Liberado').length,
            readOnlyFieldsets: [...document.querySelectorAll('[data-workout-week="2"] fieldset[disabled]')].length,
            editableFields: [...document.querySelectorAll('[data-workout-week="2"] fieldset:not([disabled]) input,[data-workout-week="2"] fieldset:not([disabled]) textarea')]
              .filter((field) => !field.disabled && field.getAttribute('aria-disabled') !== 'true').length,
          }));
          expect(releasedState.releaseButtons[1]).toBe(true);
          expect(releasedState.releasedLabels).toBeGreaterThan(0);
          expect(releasedState.readOnlyFieldsets).toBeGreaterThan(0);
          expect(releasedState.editableFields).toBe(0);
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => document.querySelector('main')?.innerText.includes('Parâmetros do Treino'), { timeout: 30000 });
        }
        await clickText('Treinamento Resistido');
        await page.waitForFunction(() => document.querySelector('main')?.innerText.includes('Agachamento real #399'), { timeout: 20000 });
        const observed = await page.evaluate(() => ({
          text: document.querySelector('main')?.innerText || '',
          width: innerWidth,
          scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          missingLabels: [...document.querySelectorAll('input,textarea,select')].filter((field) => !field.labels.length && !field.getAttribute('aria-label')).length,
          disabledFields: [...document.querySelectorAll('input,textarea,select')].filter((field) => field.disabled).length,
          editableFields: [...document.querySelectorAll('[data-workout-week="2"] fieldset:not([disabled]) input,[data-workout-week="2"] fieldset:not([disabled]) textarea')]
            .filter((field) => !field.disabled && field.getAttribute('aria-disabled') !== 'true').length,
          readOnlyFieldsets: [...document.querySelectorAll('[data-workout-week="2"] fieldset[disabled]')].length,
          readOnlyNotice: [...document.querySelectorAll('[data-workout-week="2"] [role="tabpanel"] p')]
            .map((element) => element.textContent?.trim() ?? '')
            .find((value) => value.includes('somente leitura.')) ?? null,
        }));
          expect(observed.scrollWidth).toBeLessThanOrEqual(observed.width + 1);
          expect(observed.missingLabels).toBe(0);
          expect(observed.text).toContain('Agachamento real #399');
          expect(observed.readOnlyFieldsets).toBeGreaterThan(0);
          expect(observed.editableFields).toBe(0);
          expect(observed.readOnlyNotice).toBe('Treino liberado: somente leitura.');
        const screenshot = await page.screenshot({ path: path.join(outputDir, `real-api-${viewport.width}.png`), fullPage: true });
        observations.push({ viewport, observed, screenshotSha256: createHash('sha256').update(screenshot).digest('hex') });
      }

      expect(responses.some((response) => response.path.endsWith('/save-week') && response.status >= 200 && response.status < 300)).toBe(true);
      expect(responses.some((response) => response.path.endsWith('/copy') && response.status === 200)).toBe(true);
      expect(responses.some((response) => response.path.endsWith('/release') && response.status === 200)).toBe(true);
      const allowedMatrixMiss = (response) => response.status === 404
        && response.path === `/api/v1/periodization/matrix/${ids.plan}`;
      const unexpectedErrors = responses.filter((response) => response.status >= 400 && !allowedMatrixMiss(response));
      expect(unexpectedErrors).toEqual([]);
      expect(browserErrors).toEqual([]);
    } finally {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(path.join(outputDir, 'real-api-browser.json'), JSON.stringify({
        subjectSha: process.env.VERIFICATION_HEAD_SHA || process.env.GITHUB_SHA || 'local',
        scope: 'real Chromium + production WorkoutBuilder2 + real API process + PostgreSQL + signed active-professor JWT + synthetic desidentified fixture',
        responses,
        observations,
        browserErrors,
        apiLogs: apiLogs.slice(-40),
        fixture: ids,
      }, null, 2));
      await browser?.close();
      await vite?.close();
      if (apiProcess && !apiProcess.killed) apiProcess.kill('SIGTERM');
      await prisma.$disconnect();
    }
  }, 240000);
});
