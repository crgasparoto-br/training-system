// @vitest-environment node
// #404: real Chrome -> HTTP API -> PostgreSQL, including a failed post-write refresh.
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
const suite = process.env.ISSUE_404_REAL_API_BROWSER_EVIDENCE === '1' ? describe : describe.skip;
const repoRoot = path.resolve(process.cwd(), '../..');
const outputDir = path.join(repoRoot, 'artifacts/issue-404');

function localToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return fields.year + '-' + fields.month + '-' + fields.day;
}

function chromePath() {
  for (const candidate of [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* Puppeteer cache */ }
  }
  return puppeteer.executablePath();
}
async function waitForHealth(origin) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try { if ((await fetch(origin + '/health')).ok) return; } catch { /* booting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Issue #404 real API did not become healthy: ' + origin);
}

async function seed(prisma) {
  const suffix = randomUUID();
  const contractId = 'issue404-browser-' + suffix;
  const date = new Date(localToday() + 'T00:00:00.000Z');
  const dayOfWeek = ((date.getUTCDay() + 6) % 7) + 1;
  const weekStart = new Date(date.getTime() - (dayOfWeek - 1) * 86400000);
  const contract = await prisma.companyContract.create({ data: {
    id: contractId, type: 'academy', name: 'Browser #404',
    document: randomUUID().replace(/-/g, '').slice(0, 14),
  } });
  const fn = await prisma.collaboratorFunctionOption.create({ data: {
    contractId, name: 'Professor', code: 'issue404-browser-' + suffix, isActive: true,
  } });
  const user = await prisma.user.create({ data: {
    email: 'issue404-browser-prof-' + suffix + '@example.test', passwordHash: 'fixture-only',
    type: 'professor', profile: { create: { name: 'Professor #404' } },
  } });
  const professor = await prisma.professor.create({ data: {
    userId: user.id, contractId, collaboratorFunctionId: fn.id,
    role: 'master', currentStatus: 'active',
  } });
  const studentUser = await prisma.user.create({ data: {
    email: 'issue404-browser-student-' + suffix + '@example.test', passwordHash: 'fixture-only',
    type: 'aluno', profile: { create: { name: 'Aluno #404' } },
  } });
  const aluno = await prisma.aluno.create({ data: {
    userId: studentUser.id, professorId: professor.id, contractId,
    status: 'ACTIVE_STUDENT', age: 30, schedulePlan: 'free',
  } });
  const plan = await prisma.trainingPlan.create({ data: {
    professorId: professor.id, alunoId: aluno.id, name: 'Plano #404',
    startDate: new Date(date.getTime() - 7 * 86400000),
    endDate: new Date(date.getTime() + 14 * 86400000),
  } });
  const assembly = await prisma.consolidatedPrescription.create({ data: {
    contractId, alunoId: aluno.id, currentVersion: 2, currentStatus: 'released',
    createdByProfessorId: professor.id, updatedByProfessorId: professor.id,
  } });
  const approved = await prisma.consolidatedPrescriptionVersion.create({ data: {
    assemblyId: assembly.id, contractId, alunoId: aluno.id, version: 1,
    status: 'approved', responsibleProfessorId: professor.id,
    professorJustification: 'Teste navegador #404',
    approvedByProfessorId: professor.id, approvedAt: new Date(),
    createdByProfessorId: professor.id, conflicts: [],
  } });
  const released = await prisma.consolidatedPrescriptionVersion.create({ data: {
    assemblyId: assembly.id, contractId, alunoId: aluno.id, version: 2,
    previousVersionId: approved.id, status: 'released', responsibleProfessorId: professor.id,
    professorJustification: 'Teste navegador #404', approvedByProfessorId: professor.id,
    approvedAt: approved.approvedAt, createdByProfessorId: professor.id, conflicts: [],
  } });
  const template = await prisma.workoutTemplate.create({ data: {
    planId: plan.id, mesocycleNumber: 1, weekNumber: 1,
    weekStartDate: weekStart, trainingMethod: 'combined', released: false,
  } });
  const day = await prisma.workoutDay.create({ data: {
    templateId: template.id, dayOfWeek, workoutDate: date, method: 'continuous',
  } });
  const original = await prisma.exerciseLibrary.create({ data: {
    contractId, name: 'Agachamento planejado #404', category: 'RESISTIDO',
    curationStatus: 'approved', legacyGrandfathered: false,
    reviewedByUserId: user.id, reviewedAt: new Date(), lastCurationAction: 'approve',
  } });
  const alternative = await prisma.exerciseLibrary.create({ data: {
    contractId, name: 'Agachamento alternativo #404', category: 'RESISTIDO',
    curationStatus: 'approved', legacyGrandfathered: false,
    reviewedByUserId: user.id, reviewedAt: new Date(), lastCurationAction: 'approve',
  } });
  const planned = await prisma.workoutExercise.create({ data: {
    workoutDayId: day.id, exerciseId: original.id,
    section: 'principal', exerciseOrder: 1, sets: 3, reps: 10,
  } });
  const releasedAt = new Date();
  await prisma.$executeRawUnsafe(
    'INSERT INTO "ConsolidatedPrescriptionOperationalRelease" (' +
    '"id","assemblyId","sourceAssemblyVersionId","sourceAssemblyVersion",' +
    '"releasedAssemblyVersionId","releasedAssemblyVersion","contractId","alunoId",' +
    '"trainingPlanId","workoutTemplateId","requestFingerprint",' +
    '"releasedByProfessorId","releasedAt","createdAt") ' +
    'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
    randomUUID(), assembly.id, approved.id, 1, released.id, 2, contractId,
    aluno.id, plan.id, template.id, randomUUID(), professor.id, releasedAt, releasedAt,
  );
  await prisma.workoutTemplate.update({ where: { id: template.id }, data: {
    released: true, releasedAt,
  } });
  return { suffix, contractId, professorUserId: user.id, alunoId: aluno.id,
    dayId: day.id, plannedId: planned.id, replacementId: alternative.id };
}

async function createWeb(apiOrigin, token, fixture) {
  process.env.VITE_API_URL = apiOrigin;
  const { createServer } = await import('vite');
  const html = '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body><main id="root" style="max-width:68rem;margin:0 auto;padding:1rem"></main>' +
    '<script type="module">' +
    'import React from "react"; import { createRoot } from "react-dom/client";' +
    'import { BrowserRouter } from "react-router-dom";' +
    'import "/src/index.css";' +
    'import { TrainingRoutinePanel } from "/src/components/training/TrainingRoutinePanel.tsx";' +
    'import { trainingRoutineService } from "/src/services/training-routine.service.ts";' +
    'import { useAuthStore } from "/src/stores/useAuthStore.ts";' +
    'localStorage.setItem("token",' + JSON.stringify(token) + ');' +
    'useAuthStore.setState({user:{id:' + JSON.stringify(fixture.professorUserId) +
      ',type:"professor",professor:{role:"master"}},' +
      'token:' + JSON.stringify(token) + ',isAuthenticated:true,isLoading:false});' +
    'const loadRoutine=(date)=>trainingRoutineService.getForAluno(' +
      JSON.stringify(fixture.alunoId) + ',{date});' +
    'createRoot(document.getElementById("root")).render(' +
    'React.createElement(BrowserRouter,null,React.createElement(TrainingRoutinePanel,' +
    '{audience:"professor",canView:true,title:"Treino de hoje",load:loadRoutine})));' +
    '</script></body></html>';
  const vite = await createServer({
    root: process.cwd(), logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'issue-404-real-http-browser-harness',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if ((req.url || '').split('?')[0] !== '/__issue-404') return next();
          try {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(await server.transformIndexHtml('/__issue-404', html));
          } catch (error) { next(error); }
        });
      },
    }],
  });
  await vite.listen();
  return { vite, origin: 'http://127.0.0.1:' + vite.httpServer.address().port };
}

async function clickButton(page, label) {
  await page.waitForFunction(wanted => [...document.querySelectorAll('button')].some(
    button => button.textContent?.includes(wanted) && !button.disabled,
  ), { timeout: 20000 }, label);
  await page.evaluate(wanted => {
    const button = [...document.querySelectorAll('button')].find(
      item => item.textContent?.includes(wanted) && !item.disabled,
    );
    if (!button) throw new Error('No actionable button: ' + wanted);
    button.click();
  }, label);
}
async function waitText(page, wanted) {
  await page.waitForFunction(text => document.body?.innerText.includes(text),
    { timeout: 20000 }, wanted);
}
async function screenshot(page, name) {
  mkdirSync(outputDir, { recursive: true });
  const file = 'issue-404-' + name + '.png';
  const buffer = await page.screenshot({ fullPage: true });
  writeFileSync(path.join(outputDir, file), buffer);
  return { file, sha256: createHash('sha256').update(buffer).digest('hex'), bytes: buffer.length };
}

suite('Issue #404: real browser, authenticated API and PostgreSQL', () => {
  it('preserves a confirmed POST when refresh fails and recovers via GET only', async () => {
    const prisma = new PrismaClient();
    const jwtSecret = process.env.ISSUE_404_REAL_JWT_SECRET || 'issue404-ci-secret';
    const port = Number(process.env.ISSUE_404_REAL_API_PORT || 19204);
    const apiOrigin = 'http://127.0.0.1:' + port;
    let browser, vite, apiProcess;
    const apiLogs = [], browserErrors = [], captures = [];
    let writes = 0, readsAfterWrite = 0, injectedFailures = 0;
    try {
      const fixture = await seed(prisma);
      const token = jwt.sign({
        userId: fixture.professorUserId,
        email: 'issue404-browser-prof-' + fixture.suffix + '@example.test',
        type: 'professor',
      }, jwtSecret, { expiresIn: '1h' });
      const web = await createWeb(apiOrigin, token, fixture);
      vite = web.vite;
      apiProcess = spawn('pnpm', ['--filter', '@corrida/api', 'exec', 'tsx', 'src/main.ts'], {
        cwd: repoRoot,
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL, JWT_SECRET: jwtSecret,
          PORT: String(port), NODE_ENV: 'test', CORS_ORIGIN: web.origin, FRONTEND_URL: web.origin },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      apiProcess.stdout?.on('data', chunk => apiLogs.push(String(chunk).slice(0, 1200)));
      apiProcess.stderr?.on('data', chunk => apiLogs.push(String(chunk).slice(0, 1200)));
      await waitForHealth(apiOrigin);
      const uri = apiOrigin + '/api/v1/training-substitutions/sessions/' + fixture.dayId;
      const operation = {
        kind: 'exercise', context: 'planning', originalUnitId: fixture.plannedId,
        replacementUnitId: fixture.replacementId, expectedReplacementVersion: 'exercicio:0',
        reason: 'Substituição de teste no navegador', operationKey: '404-stale-' + fixture.suffix,
      };
      const oldVersion = await fetch(uri, {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(operation),
      });
      expect(oldVersion.status).toBe(409);
      expect(await prisma.workoutSubstitution.count({ where: { workoutDayId: fixture.dayId } })).toBe(0);
      const initialEvents = await prisma.studentLifecycleEvent.count({
        where: { alunoId: fixture.alunoId, contractId: fixture.contractId },
      });

      browser = await puppeteer.launch({ executablePath: chromePath(), headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const page = await browser.newPage();
      page.on('pageerror', error => browserErrors.push(error.message));
      await page.setRequestInterception(true);
      const submissionPath = '/api/v1/training-substitutions/sessions/' + fixture.dayId;
      const refreshPath = '/api/v1/alunos/' + fixture.alunoId + '/training-routine';
      page.on('request', request => {
        const pathname = new URL(request.url()).pathname;
        if (pathname === submissionPath && request.method() === 'POST') writes += 1;
        if (pathname === refreshPath && request.method() === 'GET' && writes > 0) {
          readsAfterWrite += 1;
          if (injectedFailures === 0) {
            injectedFailures += 1;
            void request.abort('failed');
            return;
          }
        }
        void request.continue();
      });
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(web.origin + '/__issue-404', { waitUntil: 'domcontentloaded' });
      await waitText(page, 'Substituições da sessão');
      await clickButton(page, 'Buscar alternativas elegíveis');
      await page.waitForFunction(id => [...document.querySelectorAll('option')].some(
        option => option.value === id,
      ), { timeout: 20000 }, fixture.replacementId);
      const selectHandle = await page.evaluateHandle(id => [...document.querySelectorAll('select')].find(
        select => [...select.options].some(option => option.value === id),
      ), fixture.replacementId);
      await selectHandle.asElement().select(fixture.replacementId);
      await page.type('textarea', 'Equipamento alternativo confirmado pelo professor');
      await clickButton(page, 'Aprovar alternativa');
      await waitText(page, 'Os dados da tela não foram atualizados.');
      expect(injectedFailures).toBe(1);
      expect(readsAfterWrite).toBe(1);
      expect(writes).toBe(1);
      expect(await prisma.workoutSubstitution.count({
        where: { workoutDayId: fixture.dayId },
      })).toBe(1);
      expect(await prisma.studentLifecycleEvent.count({
        where: { alunoId: fixture.alunoId, contractId: fixture.contractId },
      })).toBe(initialEvents + 1);
      expect(await page.evaluate(() => [...document.querySelectorAll('button')].some(
        button => button.textContent?.includes('Aprovar alternativa') && !button.disabled,
      ))).toBe(false);
      captures.push(await screenshot(page, 'desktop-refresh-failed'));

      await clickButton(page, 'Atualizar histórico');
      await waitText(page, 'Histórico atualizado.');
      await waitText(page, 'Agachamento alternativo #404');
      expect(writes).toBe(1);
      expect(readsAfterWrite).toBe(2);
      expect(await prisma.workoutSubstitution.count({
        where: { workoutDayId: fixture.dayId },
      })).toBe(1);
      expect(await prisma.studentLifecycleEvent.count({
        where: { alunoId: fixture.alunoId, contractId: fixture.contractId },
      })).toBe(initialEvents + 1);
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      const overflow = await page.evaluate(() =>
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      captures.push(await screenshot(page, 'mobile-recovered'));
      expect(browserErrors).toEqual([]);
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(path.join(outputDir, 'real-api-evidence.json'), JSON.stringify({
        schemaVersion: 1, issue: 404, headSha: process.env.VERIFICATION_HEAD_SHA || null,
        mode: 'production-routine-panel-real-chrome-http-postgresql', writes, readsAfterWrite,
        injectedFailures, ledgerRows: 1, lifecycleEventDelta: 1, screenshots: captures,
      }, null, 2) + '\n');
    } catch (error) {
      throw new Error(String(error) + '\nAPI logs: ' + apiLogs.slice(-8).join('\n'));
    } finally {
      if (browser) await browser.close();
      if (vite) await vite.close();
      if (apiProcess) apiProcess.kill('SIGTERM');
      await prisma.$disconnect();
    }
  }, 120_000);
});
