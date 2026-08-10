/// <reference lib="dom" />

import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import puppeteer, { type Browser } from 'puppeteer';
import { preRegistrationEnrollmentCreateService } from '../src/modules/pre-registration-enrollment/pre-registration-enrollment-create.service.js';

const repoRoot = process.env.GITHUB_WORKSPACE || path.resolve(process.cwd(), '../..');
const webDist = path.join(repoRoot, 'apps/web/dist');
const artifactDir = path.join(repoRoot, 'artifacts/issue-275');
const webPort = 4176;
const apiPort = 3002;
const availabilityDelayMs = 750;
const jwtSecret = 'issue-275-rollout-consumer-browser-secret';
const prisma = new PrismaClient();
const enabledForThisGate =
  process.env.RUN_ISSUE_275_ROLLOUT_CONSUMER_BROWSER === 'true' &&
  existsSync(path.join(webDist, 'index.html'));

const describeBrowser = enabledForThisGate ? describe : describe.skip;

type Audience = 'public' | 'authenticated' | 'administrative';

function contentType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

async function proxyAvailability(response: import('node:http').ServerResponse) {
  await new Promise((resolve) => setTimeout(resolve, availabilityDelayMs));
  try {
    const apiResponse = await fetch(
      `http://127.0.0.1:${apiPort}/api/v1/pre-registration/availability`
    );
    response.statusCode = apiResponse.status;
    apiResponse.headers.forEach((value, key) => response.setHeader(key, value));
    response.end(Buffer.from(await apiResponse.arrayBuffer()));
  } catch {
    if (response.writableEnded) return;
    response.statusCode = 503;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(
      JSON.stringify({
        error: 'PRE_REGISTRATION_DISABLED',
        message:
          'O pré-cadastro está temporariamente indisponível. Entre em contato com a equipe da academia.',
      })
    );
  }
}

async function startWebServer(): Promise<Server> {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url || '/', `http://127.0.0.1:${webPort}`).pathname;

    if (pathname === '/api/v1/pre-registration/availability') {
      await proxyAvailability(response);
      return;
    }

    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    let candidate = path.join(webDist, relative);

    try {
      const metadata = await stat(candidate);
      if (metadata.isDirectory()) candidate = path.join(candidate, 'index.html');
    } catch {
      candidate = path.join(webDist, 'index.html');
    }

    try {
      const body = await readFile(candidate);
      response.statusCode = 200;
      response.setHeader('Content-Type', contentType(candidate));
      response.end(body);
    } catch {
      response.statusCode = 404;
      response.end('Not found');
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(webPort, '127.0.0.1', resolve);
  });
  return server;
}

function startDisabledApi(): ChildProcess {
  return spawn('pnpm', ['--filter', '@corrida/api', 'exec', 'tsx', 'src/main.ts'], {
    cwd: repoRoot,
    detached: true,
    env: {
      ...process.env,
      PORT: String(apiPort),
      API_PORT: String(apiPort),
      NODE_ENV: 'production',
      JWT_SECRET: jwtSecret,
      FRONTEND_URL: `http://127.0.0.1:${webPort}`,
      CORS_ORIGINS: `http://127.0.0.1:${webPort}`,
      PRE_REGISTRATION_ENABLED: 'false',
      PRE_REGISTRATION_TELEMETRY_ENABLED: 'false',
      PRIVACY_NOTICE_URL: 'https://example.test/privacidade',
      PRIVACY_NOTICE_VERSION: '2026-07',
      HEALTH_PRIVACY_NOTICE_VERSION: '2026-07',
    },
    stdio: 'ignore',
  });
}

function stopProcess(child?: ChildProcess) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

async function waitForApi() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/health`);
      if (response.ok) return;
    } catch {
      // API ainda iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('API desabilitada não iniciou para o gate de consumidor');
}

type StoredUser = Record<string, unknown>;
type AdminFixture = {
  token: string;
  user: StoredUser;
  userId: string;
  professorId: string;
  functionId: string;
  contractId: string;
};

async function createAdministrator(): Promise<AdminFixture> {
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const contract = await prisma.companyContract.create({
    data: {
      type: 'academy',
      document: `275-rollout-${suffix}`,
      name: 'Academia Rollout Consumer',
    },
  });
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: contract.id,
      name: 'Administrador Rollout',
      code: `issue-275-rollout-admin-${suffix}`,
      isActive: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `issue-275-rollout-${suffix}@example.test`,
      passwordHash: 'not-used',
      type: 'professor',
      profile: { create: { name: 'Administrador Rollout' } },
    },
  });
  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId: contract.id,
      collaboratorFunctionId: collaboratorFunction.id,
      role: 'master',
    },
  });
  return {
    token: jwt.sign(
      { userId: user.id, email: user.email, type: user.type },
      jwtSecret,
      { expiresIn: '1h' }
    ),
    user: {
      id: user.id,
      email: user.email,
      type: user.type,
      profile: { name: 'Administrador Rollout' },
      professor: {
        id: professor.id,
        role: 'master',
        contractId: contract.id,
        collaboratorFunction: {
          id: collaboratorFunction.id,
          code: collaboratorFunction.code,
          name: collaboratorFunction.name,
          accessPermissions: [],
        },
      },
      accessControl: { isMaster: true, permissions: [] },
    },
    userId: user.id,
    professorId: professor.id,
    functionId: collaboratorFunction.id,
    contractId: contract.id,
  };
}

async function cleanupAdministrator(fixture?: AdminFixture) {
  if (!fixture) return;
  await prisma.professor.delete({ where: { id: fixture.professorId } }).catch(() => undefined);
  await prisma.collaboratorFunctionOption
    .delete({ where: { id: fixture.functionId } })
    .catch(() => undefined);
  await prisma.companyContract.delete({ where: { id: fixture.contractId } }).catch(() => undefined);
  await prisma.user.delete({ where: { id: fixture.userId } }).catch(() => undefined);
}

async function openSurface(
  browser: Browser,
  input: {
    name: string;
    path: string;
    audience: Audience;
    user?: StoredUser;
    token?: string;
    viewport: { width: number; height: number };
  }
) {
  const page = await browser.newPage();
  await page.setViewport(input.viewport);
  if (input.user) {
    await page.evaluateOnNewDocument(
      ({ user, token }) => {
        localStorage.setItem('token', token || 'issue-275-browser-token');
        localStorage.setItem('user', JSON.stringify(user));
      },
      { user: input.user, token: input.token }
    );
  }

  await page.goto(`http://127.0.0.1:${webPort}${input.path}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForSelector('[data-pre-registration-availability="checking"]', {
    timeout: 10_000,
  });

  const checkingState = await page.evaluate(() => ({
    boundaryCount: document.querySelectorAll(
      '[data-pre-registration-availability="checking"]'
    ).length,
    formCount: document.querySelectorAll('form').length,
    bodyText: document.body.textContent || '',
  }));
  expect(checkingState.boundaryCount).toBe(1);
  expect(checkingState.formCount).toBe(0);
  expect(checkingState.bodyText).toContain('Verificando disponibilidade da pré-matrícula');
  expect(checkingState.bodyText).not.toContain('Pré-matrícula temporariamente indisponível');
  expect(checkingState.bodyText).not.toContain('Localizar e filtrar');
  expect(checkingState.bodyText).not.toContain('Cadastre o contato inicial');

  await page.waitForFunction(
    () => document.body.innerText.includes('Pré-matrícula temporariamente indisponível'),
    { timeout: 30_000 }
  );

  const text = await page.$eval('body', (element) => element.textContent || '');
  expect(text).toContain('Pré-matrícula temporariamente indisponível');
  expect(text).not.toContain('PRE_REGISTRATION_DISABLED');
  expect(text).not.toContain('Solicite um novo convite');

  if (input.audience === 'public') {
    expect(text).toContain('O link não pode ser utilizado neste momento');
    expect(text).not.toContain('Seu progresso permanece salvo');
    expect(text).not.toContain('Nenhum cadastro ou convite existente foi apagado');
  } else if (input.audience === 'authenticated') {
    expect(text).toContain('Seu progresso permanece salvo');
    expect(text).not.toContain('O link não pode ser utilizado neste momento');
    expect(text).not.toContain('Nenhum cadastro ou convite existente foi apagado');
  } else {
    expect(text).toContain('Nenhum cadastro ou convite existente foi apagado');
    expect(text).not.toContain('O link não pode ser utilizado neste momento');
    expect(text).not.toContain('Seu progresso permanece salvo');
  }

  const screenshot = path.join(artifactDir, `rollout-consumer-${input.name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await page.close();

  return {
    name: input.name,
    path: input.path,
    audience: input.audience,
    viewport: input.viewport,
    sameOriginProbeObserved: true,
    checkingBoundaryObservedBeforeDisabledResponse: true,
    protectedContentAbsentDuringProbe: true,
    rawCodeAbsent: true,
    contradictoryInviteGuidanceAbsent: true,
    audienceCopyMatched: true,
    wrongAudienceCopyAbsent: true,
    screenshot: path.relative(repoRoot, screenshot),
  };
}

describeBrowser('issue 275 rollout compatibility at the real browser consumer', () => {
  it('blocks every same-origin consumer until the delayed disabled probe resolves', async () => {
    await mkdir(artifactDir, { recursive: true });
    let administrator: AdminFixture | undefined;
    let apiProcess: ChildProcess | undefined;
    let webServer: Server | undefined;
    let browser: Browser | undefined;

    try {
      administrator = await createAdministrator();
      const administrativeLeadId = await preRegistrationEnrollmentCreateService.create(
        {
          userId: administrator.userId,
          professorId: administrator.professorId,
          contractId: administrator.contractId,
        },
        {
          name: 'Lead Rollout Same Origin',
          phone: '15978000001',
          origin: 'issue-275-rollout-consumer',
          responsibleProfessorId: administrator.professorId,
        }
      );
      apiProcess = startDisabledApi();
      await waitForApi();
      webServer = await startWebServer();
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const linkedStudent = {
        id: 'issue-275-linked-student',
        email: 'linked-student@example.test',
        type: 'aluno',
        profile: { name: 'Aluno Vinculado' },
      };

      const surfaces = [];
      surfaces.push(
        await openSurface(browser, {
          name: 'public-token-route',
          path: '/pre-cadastro/legacy-route-exposure',
          audience: 'public',
          viewport: { width: 390, height: 844 },
        })
      );
      surfaces.push(
        await openSurface(browser, {
          name: 'authenticated-resume',
          path: '/pre-cadastro',
          audience: 'authenticated',
          user: linkedStudent,
          viewport: { width: 390, height: 844 },
        })
      );
      surfaces.push(
        await openSurface(browser, {
          name: 'administrative-list',
          path: '/pre-matriculas',
          audience: 'administrative',
          user: administrator.user,
          token: administrator.token,
          viewport: { width: 1366, height: 768 },
        })
      );
      surfaces.push(
        await openSurface(browser, {
          name: 'administrative-create',
          path: '/pre-matriculas/nova',
          audience: 'administrative',
          user: administrator.user,
          token: administrator.token,
          viewport: { width: 1366, height: 768 },
        })
      );
      surfaces.push(
        await openSurface(browser, {
          name: 'administrative-detail',
          path: `/pre-matriculas/${administrativeLeadId}`,
          audience: 'administrative',
          user: administrator.user,
          token: administrator.token,
          viewport: { width: 1366, height: 768 },
        })
      );
      surfaces.push(
        await openSurface(browser, {
          name: 'administrative-edit',
          path: `/pre-matriculas/${administrativeLeadId}/editar`,
          audience: 'administrative',
          user: administrator.user,
          token: administrator.token,
          viewport: { width: 1366, height: 768 },
        })
      );

      const report = {
        schemaVersion: 3,
        kind: 'issue-275-rollout-consumer-browser',
        buildMode: 'pre-registration-route-enabled-same-origin',
        apiMode: 'PRE_REGISTRATION_ENABLED=false',
        availabilityDelayMs,
        implementationConclusionsIncluded: false,
        surfaces,
      };
      await writeFile(
        path.join(artifactDir, 'rollout-consumer-browser.json'),
        `${JSON.stringify(report, null, 2)}\n`,
        'utf8'
      );
    } finally {
      if (browser) await browser.close().catch(() => undefined);
      if (webServer) await new Promise<void>((resolve) => webServer!.close(() => resolve()));
      stopProcess(apiProcess);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await cleanupAdministrator(administrator);
      await prisma.$disconnect();
    }
  }, 180_000);
});
