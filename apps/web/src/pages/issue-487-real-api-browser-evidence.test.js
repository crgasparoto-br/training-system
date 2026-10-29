// @vitest-environment node
// Real student browser -> authenticated HTTP -> canonical PostgreSQL journey.
// The mocked Chrome journey remains in issue-487-browser-evidence.test.js.
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { accessSync, constants, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client');
const puppeteer = apiRequire('puppeteer');
const jwt = apiRequire('jsonwebtoken');
const suite = process.env.ISSUE_487_REAL_API_BROWSER_EVIDENCE === '1' ? describe : describe.skip;
const repoRoot = path.resolve(process.cwd(), '../..');
const outputDir = path.join(repoRoot, 'artifacts/issue-487');

function localToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return fields.year + '-' + fields.month + '-' + fields.day;
}
function addDays(dateOnly, number) {
  return new Date(Date.parse(dateOnly + 'T12:00:00.000Z') + number * 86400000);
}
function executablePath() {
  for (const candidate of [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* Puppeteer cache */ }
  }
  return puppeteer.executablePath();
}
async function waitForHealth(origin) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try { if ((await fetch(origin + '/health')).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Real API did not become healthy: ' + origin);
}
async function seedReleasedSession(prisma, today, suffix) {
  const contract = await prisma.companyContract.create({
    data: { id: 'issue487-real-contract-' + suffix, type: 'academy',
      document: randomUUID().replace(/-/g, '').slice(0, 14), name: 'Contrato teste #487' },
  });
  const functionOption = await prisma.collaboratorFunctionOption.create({
    data: { contractId: contract.id, name: 'Professor', code: 'issue487-' + suffix, isActive: true },
  });
  const professorUser = await prisma.user.create({
    data: { email: 'issue487-prof-' + suffix + '@example.test', passwordHash: 'fixture-only',
      type: 'professor', profile: { create: { name: 'Professor #487' } } },
  });
  const professor = await prisma.professor.create({
    data: { userId: professorUser.id, contractId: contract.id,
      collaboratorFunctionId: functionOption.id, role: 'master', currentStatus: 'active' },
  });
  const studentUser = await prisma.user.create({
    data: { email: 'issue487-student-' + suffix + '@example.test', passwordHash: 'fixture-only',
      type: 'aluno', profile: { create: { name: 'Aluno #487' } } },
  });
  const student = await prisma.aluno.create({
    data: { userId: studentUser.id, professorId: professor.id, contractId: contract.id,
      status: 'ACTIVE_STUDENT', activatedAt: addDays(today, -2),
      schedulePlan: 'free', age: 30 },
  });
  const plan = await prisma.trainingPlan.create({
    data: { professorId: professor.id, alunoId: student.id, name: 'Treino guiado real #487',
      startDate: addDays(today, -7), endDate: addDays(today, 14) },
  });
  const assembly = await prisma.consolidatedPrescription.create({
    data: { contractId: contract.id, alunoId: student.id, currentVersion: 2,
      currentStatus: 'released', createdByProfessorId: professor.id, updatedByProfessorId: professor.id },
  });
  const approved = await prisma.consolidatedPrescriptionVersion.create({
    data: { assemblyId: assembly.id, contractId: contract.id, alunoId: student.id,
      version: 1, status: 'approved', responsibleProfessorId: professor.id,
      professorJustification: 'Teste real de execução guiada', approvedByProfessorId: professor.id,
      approvedAt: addDays(today, -1), createdByProfessorId: professor.id, conflicts: [] },
  });
  const released = await prisma.consolidatedPrescriptionVersion.create({
    data: { assemblyId: assembly.id, contractId: contract.id, alunoId: student.id,
      version: 2, previousVersionId: approved.id, status: 'released',
      responsibleProfessorId: professor.id, professorJustification: approved.professorJustification,
      approvedByProfessorId: professor.id, approvedAt: approved.approvedAt,
      createdByProfessorId: professor.id, conflicts: [] },
  });
  const dayOfWeek = ((addDays(today, 0).getUTCDay() + 6) % 7) + 1;
  const template = await prisma.workoutTemplate.create({
    data: { planId: plan.id, mesocycleNumber: 1, weekNumber: 1,
      weekStartDate: addDays(today, 1 - dayOfWeek),
      trainingMethod: 'combined', released: false },
  });
  const day = await prisma.workoutDay.create({
    data: { templateId: template.id, dayOfWeek, workoutDate: addDays(today, 0), method: 'continuous' },
  });
  const exerciseA = await prisma.exerciseLibrary.create({
    data: { contractId: contract.id, name: 'Agachamento real #487', category: 'Resistido',
      notes: 'Movimento controlado' },
  });
  const exerciseB = await prisma.exerciseLibrary.create({
    data: { contractId: contract.id, name: 'Remada real #487', category: 'Resistido' },
  });
  const workoutA = await prisma.workoutExercise.create({
    data: { workoutDayId: day.id, exerciseId: exerciseA.id,
      section: 'principal', exerciseOrder: 1, sets: 2, reps: 8 },
  });
  const workoutB = await prisma.workoutExercise.create({
    data: { workoutDayId: day.id, exerciseId: exerciseB.id,
      section: 'principal', exerciseOrder: 2, sets: 2, reps: 10 },
  });
  await prisma.workoutExerciseBlock.create({
    data: { workoutExerciseId: workoutA.id, position: 1, kind: 'principal',
      plannedSets: { create: [
        { position: 1, repsMin: 8, repsMax: 12, loadKg: 32.5, restSec: 60 },
        { position: 2, repsMin: 6, repsMax: 10, loadKg: 35, restSec: 90 },
      ] } },
  });
  await prisma.workoutExerciseBlock.create({
    data: { workoutExerciseId: workoutB.id, position: 1, kind: 'principal',
      plannedSets: { create: [
        { position: 1, repsMin: 10, repsMax: 12, loadKg: null, restSec: 45 },
        { position: 2, repsMin: 8, repsMax: 10, loadKg: null, restSec: 75 },
      ] } },
  });
  await prisma.workoutResistanceGroup.create({
    data: { workoutDayId: day.id, position: 1, kind: 'bi_set', rounds: 2,
      restBetweenExercisesSec: null, restBetweenRoundsSec: 75,
      members: { create: [
        { position: 1, workoutExerciseId: workoutA.id },
        { position: 2, workoutExerciseId: workoutB.id },
      ] } },
  });
  const releasedAt = new Date();
  await prisma.$executeRawUnsafe(
    'INSERT INTO "ConsolidatedPrescriptionOperationalRelease" (' +
    '"id", "assemblyId", "sourceAssemblyVersionId", "sourceAssemblyVersion", ' +
    '"releasedAssemblyVersionId", "releasedAssemblyVersion", "contractId", "alunoId", ' +
    '"trainingPlanId", "workoutTemplateId", "requestFingerprint", ' +
    '"releasedByProfessorId", "releasedAt", "createdAt") ' +
    'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
    randomUUID(), assembly.id, approved.id, 1, released.id, 2, contract.id, student.id,
    plan.id, template.id, randomUUID(), professor.id, releasedAt, releasedAt,
  );
  await prisma.workoutTemplate.update({
    where: { id: template.id }, data: { released: true, releasedAt },
  });
  const firstPlannedSet = await prisma.workoutExercisePlannedSet.findFirstOrThrow({
    where: { block: { workoutExerciseId: workoutA.id }, position: 1 },
  });
  return { contractId: contract.id, studentUserId: studentUser.id,
    dayId: day.id, firstPlannedSetId: firstPlannedSet.id };
}
async function startVite(apiOrigin, token) {
  process.env.VITE_API_URL = apiOrigin;
  const { createServer } = await import('vite');
  const html = '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body><main id="root"></main><script type="module">' +
    'import React from "react";' +
    'import { createRoot } from "react-dom/client";' +
    'import { BrowserRouter } from "react-router-dom";' +
    'import "/src/index.css";' +
    'localStorage.setItem("token", ' + JSON.stringify(token) + ');' +
    'const { StudentTraining } = await import("/src/pages/StudentTraining.tsx");' +
    'createRoot(document.getElementById("root")).render(' +
    'React.createElement(BrowserRouter, null, React.createElement(StudentTraining)));' +
    '</script></body></html>';
  const vite = await createServer({
    root: process.cwd(), logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'issue-487-real-api-student-harness',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const requestPath = (req.url || '').split('?')[0];
          if (requestPath !== '/student/training') return next();
          try {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(await server.transformIndexHtml(requestPath, html));
          } catch (error) { next(error); }
        });
      },
    }],
  });
  await vite.listen();
  return { vite, origin: 'http://127.0.0.1:' + vite.httpServer.address().port };
}
async function clickButton(page, label) {
  await page.waitForFunction((wanted) => [...document.querySelectorAll('button')].some((button) =>
    button.textContent?.includes(wanted) && !button.disabled), { timeout: 20000 }, label);
  await page.evaluate((wanted) => {
    const button = [...document.querySelectorAll('button')].find((item) =>
      item.textContent?.includes(wanted) && !item.disabled);
    if (!button) throw new Error('Button not actionable: ' + wanted);
    button.click();
  }, label);
}
async function waitText(page, value) {
  await page.waitForFunction((wanted) =>
    document.body?.innerText.toLocaleLowerCase('pt-BR').includes(wanted.toLocaleLowerCase('pt-BR')),
    { timeout: 20000 }, value);
}
async function noHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1);
}
async function shot(page, name) {
  mkdirSync(outputDir, { recursive: true });
  const bytes = await page.screenshot({ fullPage: true });
  const file = 'real-api-' + name + '.png';
  writeFileSync(path.join(outputDir, file), bytes);
  return { file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
async function apiRequest(origin, token, contractId, method, route, body) {
  const response = await fetch(origin + '/api/v1' + route, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'x-contract-id': contractId,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}

suite('Issue #487: authenticated student Chrome against real API and PostgreSQL', () => {
  it('starts, records, pauses, resumes on mobile, retries once and finishes without mutating the plan', async () => {
    const prisma = new PrismaClient();
    const suffix = randomUUID();
    const today = localToday();
    const jwtSecret = process.env.ISSUE_487_REAL_JWT_SECRET || 'issue487-local-browser-secret';
    const apiPort = Number(process.env.ISSUE_487_REAL_API_PORT || 19194);
    const apiOrigin = 'http://127.0.0.1:' + apiPort;
    let browser, vite, apiProcess;
    const apiLogs = [], browserErrors = [], guidedWrites = [], screenshots = [];
    try {
      const fixture = await seedReleasedSession(prisma, today, suffix);
      const token = jwt.sign({ userId: fixture.studentUserId,
        email: 'issue487-student-' + suffix + '@example.test', type: 'aluno' },
      jwtSecret, { expiresIn: '1h' });
      const web = await startVite(apiOrigin, token);
      vite = web.vite;
      const webOrigin = web.origin;
      apiProcess = spawn('pnpm', ['--filter', '@corrida/api', 'exec', 'tsx', 'src/main.ts'], {
        cwd: repoRoot,
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL,
          JWT_SECRET: jwtSecret, PORT: String(apiPort), NODE_ENV: 'test',
          CORS_ORIGIN: webOrigin, FRONTEND_URL: webOrigin },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      apiProcess.stdout?.on('data', (chunk) => apiLogs.push(String(chunk).slice(0, 1200)));
      apiProcess.stderr?.on('data', (chunk) => apiLogs.push(String(chunk).slice(0, 1200)));
      await waitForHealth(apiOrigin);

      browser = await puppeteer.launch({
        executablePath: executablePath(), headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      const page = await browser.newPage();
      page.on('pageerror', (error) => browserErrors.push(error.message));
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().endsWith('/execution/guided/complete')) {
          guidedWrites.push({ body: JSON.parse(request.postData() || '{}'),
            contractId: request.headers()['x-contract-id'] });
        }
      });
      const route = webOrigin + '/student/training?contractId=' + encodeURIComponent(fixture.contractId);
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await waitText(page, 'Iniciar treino');
      await clickButton(page, 'Iniciar treino');
      await waitText(page, 'Passo a passo');
      await waitText(page, 'Agachamento real #487');
      await waitText(page, 'Bi-set · rodada 1 de 2 · item 1 de 2');
      await noHorizontalOverflow(page);
      screenshots.push(await shot(page, 'desktop-first-series'));

      await page.click('input[placeholder="Informe as repetições"]');
      await page.$eval('input[placeholder="Informe as repetições"]', (input) => input.select());
      await page.keyboard.type('7');
      await page.click('input[placeholder="Informe a carga"]');
      await page.$eval('input[placeholder="Informe a carga"]', (input) => input.select());
      await page.keyboard.type('30,5');
      await clickButton(page, 'Concluir série');
      await waitText(page, '1 de 4 séries confirmadas');
      await waitText(page, 'Remada real #487');
      expect(guidedWrites).toHaveLength(1);
      expect(guidedWrites[0]).toMatchObject({
        contractId: fixture.contractId,
        body: { repetitions: 7, loadKg: 30.5, plannedSetId: fixture.firstPlannedSetId },
      });

      const persisted = await prisma.workoutSessionExecution.findUniqueOrThrow({
        where: { workoutDayId: fixture.dayId }, include: { items: true },
      });
      expect(persisted.version).toBe(2);
      expect(persisted.items).toHaveLength(1);
      expect(persisted.items[0]).toMatchObject({
        plannedSetId: fixture.firstPlannedSetId, repetitions: 7, loadKg: 30.5,
      });
      expect(persisted.items[0].completedAt).not.toBeNull();
      const planned = await prisma.workoutExercisePlannedSet.findUniqueOrThrow({
        where: { id: fixture.firstPlannedSetId },
      });
      expect(planned).toMatchObject({ repsMin: 8, loadKg: 32.5 });

      // Replaying the exact browser command cannot advance the real session.
      const replay = await apiRequest(apiOrigin, token, fixture.contractId, 'POST',
        '/student/me/training-sessions/' + fixture.dayId + '/execution/guided/complete',
        guidedWrites[0].body);
      expect(replay.status).toBe(200);
      expect(replay.body.data).toMatchObject({ version: 2, completed: 1 });
      expect(await prisma.workoutSessionExecutionItem.count({
        where: { executionId: persisted.id, completedAt: { not: null } },
      })).toBe(1);

      const denied = await apiRequest(apiOrigin, token, 'another-contract-' + suffix, 'GET',
        '/student/me/training-sessions/' + fixture.dayId + '/execution/guided');
      expect(denied.status).toBe(404);

      await clickButton(page, 'Ver ficha completa');
      await waitText(page, 'Continuar execução guiada');
      await clickButton(page, 'Continuar execução guiada');
      await waitText(page, 'Remada real #487');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitText(page, '1 de 4 séries confirmadas');
      await waitText(page, 'Remada real #487');

      await clickButton(page, 'Pausar treino');
      await waitText(page, 'Treino pausado');
      expect((await prisma.workoutSessionExecution.findUniqueOrThrow({
        where: { workoutDayId: fixture.dayId },
      })).status).toBe('paused');
      expect(await page.evaluate(() => {
        const button = [...document.querySelectorAll('button')]
          .find((candidate) => candidate.textContent?.includes('Concluir série'));
        return button instanceof HTMLButtonElement && button.disabled;
      })).toBe(true);
      const pausedView = await apiRequest(apiOrigin, token, fixture.contractId, 'GET',
        '/student/me/training-sessions/' + fixture.dayId + '/execution/guided');
      expect(pausedView.body.data).toMatchObject({ status: 'paused', completed: 1 });
      const pausedAttempt = await apiRequest(apiOrigin, token, fixture.contractId, 'POST',
        '/student/me/training-sessions/' + fixture.dayId + '/execution/guided/complete', {
          operationKey: 'issue487-paused-' + suffix,
          expectedVersion: pausedView.body.data.version,
          plannedUnitId: pausedView.body.data.current.plannedUnitId,
          plannedSetId: pausedView.body.data.current.plannedSetId,
          setNumber: pausedView.body.data.current.setNumber,
          repetitions: 10, loadKg: null,
        });
      expect(pausedAttempt.status).toBe(409);

      await clickButton(page, 'Retomar treino');
      await waitText(page, 'Remada real #487');
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitText(page, '1 de 4 séries confirmadas');
      await waitText(page, 'Bi-set · rodada 1 de 2 · item 2 de 2');
      await noHorizontalOverflow(page);
      screenshots.push(await shot(page, 'mobile-resumed-second-series'));

      for (const next of [
        'Bi-set · rodada 2 de 2 · item 1 de 2',
        'Bi-set · rodada 2 de 2 · item 2 de 2',
        'Todas as séries foram registradas',
      ]) {
        await clickButton(page, 'Concluir série');
        await waitText(page, next);
      }
      await noHorizontalOverflow(page);
      await clickButton(page, 'Concluir treino');
      await waitText(page, 'Concluído');
      screenshots.push(await shot(page, 'mobile-completed-session'));

      const final = await prisma.workoutSessionExecution.findUniqueOrThrow({
        where: { workoutDayId: fixture.dayId },
        include: { items: true, operations: true },
      });
      expect(final.status).toBe('completed');
      expect(final.finishedAt).not.toBeNull();
      expect(final.items.filter((item) => item.completedAt !== null)).toHaveLength(4);
      expect(final.operations.filter((operation) => operation.action === 'complete_resistance_set')).toHaveLength(4);
      expect(await prisma.workoutExercisePlannedSet.findUniqueOrThrow({
        where: { id: fixture.firstPlannedSetId },
      })).toMatchObject({ repsMin: 8, loadKg: 32.5 });
      expect(browserErrors).toEqual([]);
      expect(guidedWrites.every((write) => write.contractId === fixture.contractId)).toBe(true);

      const headSha = process.env.VERIFICATION_HEAD_SHA || process.env.GITHUB_SHA || 'local';
      if (process.env.GITHUB_ACTIONS === 'true') expect(headSha).toMatch(/^[0-9a-f]{40}$/);
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(path.join(outputDir, 'real-api-browser.json'), JSON.stringify({
        schemaVersion: 1, kind: 'issue-487-real-api-browser',
        result: 'PASS', headSha, browser: await browser.version(),
        scope: 'real student Chrome, signed JWT, actual HTTP routes and PostgreSQL, synthetic fixture',
        scenarios: ['desktop-start-and-complete', 'durable-refresh-and-overview',
          'replay-idempotent', 'cross-tenant-rejected', 'paused-write-rejected',
          'mobile-resume-and-complete', 'planned-remains-immutable'],
        sessionId: fixture.dayId, completed: 4, status: final.status,
        screenshotEvidence: screenshots,
      }, null, 2));
    } catch (error) {
      if (apiLogs.length) console.error('ISSUE_487_REAL_API_DIAGNOSTICS', apiLogs.slice(-12).join('\n'));
      throw error;
    } finally {
      await browser?.close().catch(() => {});
      await vite?.close().catch(() => {});
      if (apiProcess && apiProcess.exitCode === null) apiProcess.kill('SIGTERM');
      await prisma.$disconnect();
    }
  }, 240000);
});
