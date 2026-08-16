/// <reference lib="dom" />

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import type { Server } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  StudentLifecycleStatus,
  UserType,
} from '@prisma/client';

const { alunoRoutes } = require('../src/modules/alunos/index');
const authRoutes = require('../src/modules/auth/auth.routes').default;
const studentRoutes = require('../src/routes/student.routes').default;

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const contractA = 'issue-345-fullstack-contract-a';
const contractB = 'issue-345-fullstack-contract-b';
const emailPrefix = 'issue-345-fullstack-';
const allSections = ['personal', 'contact', 'address', 'preferences', 'health', 'anamnesis'];
const providerEnvKeys = [
  'SENDGRID_API_KEY',
  'SENDGRID_FROM_EMAIL',
  'SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY',
  'NOTIFICATION_CALLBACK_BASE_URL',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_NUMBER',
  'TWILIO_WHATSAPP_PROFILE_REVIEW_CONTENT_SID',
] as const;

jest.setTimeout(120_000);

type ObservedRequest = {
  method: string;
  url: string;
  contractId: string | null;
  authorization: string | null;
};

type JsonResponse<T = unknown> = {
  status: number;
  body: T;
};

let apiServer: Server | null = null;
let browser: Browser | null = null;
let viteProcess: ReturnType<typeof spawn> | null = null;
let apiOrigin = '';
let webOrigin = '';
let viteOutput = '';
const observedRequests: ObservedRequest[] = [];
const openPages = new Set<Page>();

function tokenFor(user: { id: string; email: string; type: UserType }) {
  return jwt.sign(
    { userId: user.id, email: user.email, type: user.type },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h' }
  );
}

async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Não foi possível reservar uma porta local'));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForHttp(url: string, label: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (viteProcess?.exitCode !== null && label === 'web') {
      throw new Error(`Vite encerrou antes de responder.\n${viteOutput}`);
    }
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`${label} não respondeu em ${url}`);
}

async function requestJson<T = any>(
  method: string,
  requestPath: string,
  token: string,
  body?: unknown
): Promise<JsonResponse<T>> {
  const response = await fetch(`${apiOrigin}${requestPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

async function createContract(id: string, document: string) {
  return prisma.companyContract.create({
    data: {
      id,
      type: ContractType.academy,
      document,
      name: `Contrato ${id}`,
    },
  });
}

async function createProfessor(contractId: string, suffix: string) {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: `Professor full-stack ${suffix}`,
      code: `issue-345-fullstack-${suffix}`,
      isActive: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `${emailPrefix}professor-${suffix}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: `Professor ${suffix}` } },
    },
  });
  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId,
      role: ProfessorRole.master,
      collaboratorFunctionId: collaboratorFunction.id,
    },
  });
  return { user, professor, token: tokenFor(user) };
}

async function createStudentUser(suffix: string) {
  return prisma.user.create({
    data: {
      email: `${emailPrefix}student-${suffix}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.aluno,
      profile: {
        create: {
          name: `Aluno ${suffix}`,
          phone: '11999999999',
          birthDate: new Date('1990-01-01T00:00:00.000Z'),
          cpf: null,
        },
      },
    },
  });
}

async function createActiveAluno(
  contractId: string,
  professorId: string,
  suffix: string,
  userId?: string
) {
  const user = userId
    ? await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    : await createStudentUser(suffix);
  const aluno = await prisma.aluno.create({
    data: {
      userId: user.id,
      professorId,
      contractId,
      schedulePlan: 'free',
      status: StudentLifecycleStatus.ACTIVE_STUDENT,
      activatedAt: new Date('2026-08-01T12:00:00.000Z'),
      age: 36,
      weight: 78,
      height: 178,
    },
  });
  return { user, aluno, token: tokenFor(user) };
}

async function createReview(alunoId: string, professorToken: string, expectedStatus = 201) {
  const response = await requestJson<any>(
    'POST',
    `/api/v1/alunos/${alunoId}/profile-reviews`,
    professorToken,
    { sectionsRequested: allSections }
  );
  expect(response.status).toBe(expectedStatus);
  expect(response.body.success).toBe(true);
  expect(response.body.data?.id).toEqual(expect.any(String));
  return response.body.data as { id: string; reviewCreated: boolean };
}

async function loadBrowserUser(studentToken: string) {
  const response = await requestJson<any>('GET', '/api/v1/auth/me', studentToken);
  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
  return response.body.data;
}

async function openStudentReviewPage(input: {
  token: string;
  user: unknown;
  contractId: string;
  expectedText: string;
}) {
  if (!browser) throw new Error('Browser não iniciado');
  const page = await browser.newPage();
  openPages.add(page);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(
    ({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    },
    { token: input.token, user: input.user }
  );
  await page.goto(
    `${webOrigin}/student/profile-review?contractId=${encodeURIComponent(input.contractId)}`,
    { waitUntil: 'domcontentloaded' }
  );
  await waitForText(page, input.expectedText);
  return page;
}

async function waitForText(page: Page, text: string) {
  await page.waitForFunction(
    (expected) => document.body.innerText.includes(expected),
    { timeout: 20_000 },
    text
  );
}

async function setLabeledValue(page: Page, labelText: string, value: string) {
  await page.waitForFunction(
    (label) =>
      Array.from(document.querySelectorAll('label')).some(
        (element) => element.textContent?.trim() === label
      ),
    { timeout: 10_000 },
    labelText
  );
  await page.evaluate(
    ({ labelText: label, value: nextValue }) => {
      const labelElement = Array.from(document.querySelectorAll('label')).find(
        (element) => element.textContent?.trim() === label
      );
      if (!labelElement) throw new Error(`Label não encontrada: ${label}`);
      const target = labelElement.htmlFor
        ? document.getElementById(labelElement.htmlFor)
        : labelElement.querySelector('input, textarea, select');
      if (!target) throw new Error(`Campo não encontrado para: ${label}`);

      const prototype =
        target instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : target instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLSelectElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (!setter) throw new Error(`Setter de valor indisponível para: ${label}`);
      setter.call(target, nextValue);
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { labelText, value }
  );
}

async function clickButton(page: Page, name: string) {
  await page.waitForFunction(
    (buttonName) =>
      Array.from(document.querySelectorAll('button')).some(
        (button) => button.textContent?.trim() === buttonName && !button.disabled
      ),
    { timeout: 10_000 },
    name
  );
  await page.evaluate((buttonName) => {
    const button = Array.from(document.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === buttonName
    );
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Botão não encontrado: ${buttonName}`);
    }
    button.click();
  }, name);
}

async function closePage(page: Page) {
  openPages.delete(page);
  if (!page.isClosed()) await page.close();
}

function expectStudentRequestsScopedTo(contractId: string) {
  const studentRequests = observedRequests.filter((entry) =>
    entry.url.startsWith('/api/v1/student/me/')
  );
  expect(studentRequests.length).toBeGreaterThan(0);
  for (const entry of studentRequests) {
    expect(entry.contractId).toBe(contractId);
    expect(entry.authorization).toMatch(/^Bearer /);
  }
}

describeDatabase('issue #345 full-stack browser -> HTTP -> PostgreSQL profile-review flow', () => {
  beforeAll(async () => {
    for (const key of providerEnvKeys) delete process.env[key];

    const webPort = await freePort();
    webOrigin = `http://127.0.0.1:${webPort}`;

    const app = express();
    app.use(cors({ origin: webOrigin }));
    app.use(express.json());
    app.use((req, _res, next) => {
      if (req.originalUrl.startsWith('/api/v1/')) {
        observedRequests.push({
          method: req.method,
          url: req.originalUrl,
          contractId: req.header('x-contract-id') ?? null,
          authorization: req.header('authorization') ?? null,
        });
      }
      next();
    });
    app.use('/api/v1/auth', authRoutes);
    app.use('/api/v1/alunos', alunoRoutes);
    app.use('/api/v1/student', studentRoutes);
    app.use((_req, res) => res.status(404).json({ success: false, error: 'Route not found' }));

    apiServer = app.listen(0, '127.0.0.1');
    await once(apiServer, 'listening');
    const address = apiServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('API de teste não expôs uma porta TCP');
    }
    apiOrigin = `http://127.0.0.1:${address.port}`;

    const repoRoot = path.resolve(process.cwd(), '../..');
    const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    viteProcess = spawn(
      pnpmCommand,
      [
        '--filter',
        '@corrida/web',
        'exec',
        'vite',
        '--host',
        '127.0.0.1',
        '--port',
        String(webPort),
        '--strictPort',
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          VITE_API_URL: apiOrigin,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    viteProcess.stdout?.on('data', (chunk) => {
      viteOutput += chunk.toString();
    });
    viteProcess.stderr?.on('data', (chunk) => {
      viteOutput += chunk.toString();
    });

    await waitForHttp(webOrigin, 'web');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });

  beforeEach(async () => {
    observedRequests.length = 0;
    await prisma.companyContract.deleteMany({
      where: { id: { in: [contractA, contractB] } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await createContract(contractA, '57365610000355');
    await createContract(contractB, '57365610000356');
  });

  afterEach(async () => {
    for (const page of [...openPages]) {
      await closePage(page);
    }
    await prisma.companyContract.deleteMany({
      where: { id: { in: [contractA, contractB] } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  afterAll(async () => {
    for (const page of [...openPages]) {
      await closePage(page);
    }
    await browser?.close();
    browser = null;

    if (viteProcess && viteProcess.exitCode === null) {
      viteProcess.kill('SIGTERM');
      await Promise.race([
        once(viteProcess, 'exit').catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
      if (viteProcess.exitCode === null) viteProcess.kill('SIGKILL');
    }
    viteProcess?.stdout?.destroy();
    viteProcess?.stderr?.destroy();
    viteProcess = null;

    if (apiServer) {
      apiServer.close();
      await once(apiServer, 'close').catch(() => undefined);
      apiServer = null;
    }
    await prisma.$disconnect();
  });

  it('crosses the real browser, authenticated HTTP routes and PostgreSQL through completion, approval and rejection', async () => {
    const professorActor = await createProfessor(contractA, 'lifecycle');
    const studentActor = await createActiveAluno(
      contractA,
      professorActor.professor.id,
      'lifecycle'
    );
    const browserUser = await loadBrowserUser(studentActor.token);

    const first = await createReview(studentActor.aluno.id, professorActor.token, 201);
    expect(first.reviewCreated).toBe(true);
    const repeated = await createReview(studentActor.aluno.id, professorActor.token, 200);
    expect(repeated.id).toBe(first.id);
    expect(repeated.reviewCreated).toBe(false);
    await expect(
      prisma.studentProfileReview.count({
        where: { alunoId: studentActor.aluno.id, status: 'pending' },
      })
    ).resolves.toBe(1);

    observedRequests.length = 0;
    const noChangesPage = await openStudentReviewPage({
      token: studentActor.token,
      user: browserUser,
      contractId: contractA,
      expectedText: 'Revisão pendente',
    });
    await clickButton(noChangesPage, 'Concluir sem alterações');
    await waitForText(noChangesPage, 'Revisão concluída');
    await expect(
      prisma.studentProfileReview.findUniqueOrThrow({ where: { id: first.id } })
    ).resolves.toEqual(expect.objectContaining({ status: 'completed_no_changes' }));
    expectStudentRequestsScopedTo(contractA);
    await closePage(noChangesPage);

    const direct = await createReview(studentActor.aluno.id, professorActor.token, 201);
    observedRequests.length = 0;
    const directPage = await openStudentReviewPage({
      token: studentActor.token,
      user: browserUser,
      contractId: contractA,
      expectedText: 'Revisão pendente',
    });
    await setLabeledValue(directPage, 'Telefone', '11988887777');
    await clickButton(directPage, 'Salvar alterações e concluir');
    await waitForText(directPage, 'Sua revisão cadastral foi concluída com sucesso.');
    const directProfile = await prisma.studentProfile.findUniqueOrThrow({
      where: { alunoId: studentActor.aluno.id },
    });
    expect(directProfile.identificationData).toEqual(
      expect.objectContaining({ phone: '11988887777' })
    );
    await expect(
      prisma.studentProfileReview.findUniqueOrThrow({ where: { id: direct.id } })
    ).resolves.toEqual(expect.objectContaining({ status: 'completed_with_changes' }));
    expectStudentRequestsScopedTo(contractA);
    await closePage(directPage);

    const sensitiveApprove = await createReview(studentActor.aluno.id, professorActor.token, 201);
    observedRequests.length = 0;
    const approvePage = await openStudentReviewPage({
      token: studentActor.token,
      user: browserUser,
      contractId: contractA,
      expectedText: 'Revisão pendente',
    });
    await setLabeledValue(approvePage, 'Data de nascimento', '1991-02-03');
    await clickButton(approvePage, 'Salvar alterações e concluir');
    await waitForText(
      approvePage,
      'Recebemos suas alterações. Alguns dados serão analisados pelo profissional antes de serem atualizados.'
    );
    const beforeApproval = await prisma.studentProfile.findUniqueOrThrow({
      where: { alunoId: studentActor.aluno.id },
    });
    expect(beforeApproval.identificationData).toEqual(
      expect.objectContaining({ birthDate: '1990-01-01T00:00:00.000Z' })
    );
    const approval = await requestJson<any>(
      'POST',
      `/api/v1/alunos/${studentActor.aluno.id}/profile-reviews/${sensitiveApprove.id}/approve`,
      professorActor.token
    );
    expect(approval.status).toBe(200);
    const afterApproval = await prisma.studentProfile.findUniqueOrThrow({
      where: { alunoId: studentActor.aluno.id },
    });
    expect(afterApproval.identificationData).toEqual(
      expect.objectContaining({ birthDate: '1991-02-03T00:00:00.000Z' })
    );
    expectStudentRequestsScopedTo(contractA);
    await closePage(approvePage);

    const sensitiveReject = await createReview(studentActor.aluno.id, professorActor.token, 201);
    observedRequests.length = 0;
    const rejectPage = await openStudentReviewPage({
      token: studentActor.token,
      user: browserUser,
      contractId: contractA,
      expectedText: 'Revisão pendente',
    });
    await setLabeledValue(rejectPage, 'Data de nascimento', '1992-04-05');
    await clickButton(rejectPage, 'Salvar alterações e concluir');
    await waitForText(
      rejectPage,
      'Recebemos suas alterações. Alguns dados serão analisados pelo profissional antes de serem atualizados.'
    );
    const rejection = await requestJson<any>(
      'POST',
      `/api/v1/alunos/${studentActor.aluno.id}/profile-reviews/${sensitiveReject.id}/reject`,
      professorActor.token,
      { reason: 'Documento de suporte divergente' }
    );
    expect(rejection.status).toBe(200);
    const afterRejection = await prisma.studentProfile.findUniqueOrThrow({
      where: { alunoId: studentActor.aluno.id },
    });
    expect(afterRejection.identificationData).toEqual(
      expect.objectContaining({ birthDate: '1991-02-03T00:00:00.000Z' })
    );
    await expect(
      prisma.studentProfileReview.findUniqueOrThrow({ where: { id: sensitiveReject.id } })
    ).resolves.toEqual(
      expect.objectContaining({ rejectionReason: 'Documento de suporte divergente' })
    );
    expectStudentRequestsScopedTo(contractA);
    await closePage(rejectPage);
  });

  it('keeps a pending review isolated when the same authenticated account opens another contract in the real browser', async () => {
    const professorA = await createProfessor(contractA, 'tenant-a');
    const professorB = await createProfessor(contractB, 'tenant-b');
    const sharedUser = await createStudentUser('shared');
    const studentA = await createActiveAluno(
      contractA,
      professorA.professor.id,
      'tenant-a',
      sharedUser.id
    );
    await createActiveAluno(
      contractB,
      professorB.professor.id,
      'tenant-b',
      sharedUser.id
    );
    const pending = await createReview(studentA.aluno.id, professorA.token, 201);
    const studentToken = tokenFor(sharedUser);
    const browserUser = await loadBrowserUser(studentToken);

    observedRequests.length = 0;
    const page = await openStudentReviewPage({
      token: studentToken,
      user: browserUser,
      contractId: contractB,
      expectedText: 'Nenhuma revisão cadastral pendente',
    });

    expectStudentRequestsScopedTo(contractB);
    expect(
      observedRequests.some(
        (entry) =>
          entry.method === 'POST' &&
          entry.url.includes('/api/v1/student/me/profile-reviews/') &&
          entry.url.endsWith('/complete')
      )
    ).toBe(false);
    await expect(
      prisma.studentProfileReview.findUniqueOrThrow({ where: { id: pending.id } })
    ).resolves.toEqual(
      expect.objectContaining({ status: 'pending', alunoId: studentA.aluno.id })
    );
    await closePage(page);
  });
});
