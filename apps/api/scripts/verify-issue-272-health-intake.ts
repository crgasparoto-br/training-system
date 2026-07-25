import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import puppeteer, { type Page } from 'puppeteer';
import type { HealthIntakeSessionDTO } from '@corrida/types';
import { studentDomainService } from '../src/modules/alunos/student-domain.service.js';
import {
  CompletedHealthIntakeMutationError,
  upsertCanonicalStudentHealthIntake,
} from '../src/modules/alunos/student-health-intake-write.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outputDir = path.join(repoRoot, 'artifacts', 'issue-272-regression');
const webUrl = 'http://127.0.0.1:4175';
const apiUrl = 'http://127.0.0.1:3002';
const jwtSecret = 'issue-272-regression-secret';
const prisma = new PrismaClient();

type ApiResult<T = unknown> = {
  status: number;
  payload: {
    success?: boolean;
    data?: T;
    error?: string;
    message?: string;
    code?: string;
    details?: Record<string, unknown>;
  };
};

async function waitForUrl(url: string, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server did not answer at ${url}`);
}

function stopProcess(child?: ChildProcess) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

function tokenFor(user: { id: string; email: string }) {
  return jwt.sign(
    { userId: user.id, email: user.email, type: 'aluno' },
    jwtSecret,
    { expiresIn: '1h' }
  );
}

async function request<T>(
  pathname: string,
  options: { token?: string; method?: 'GET' | 'PATCH' | 'POST'; body?: unknown } = {}
): Promise<ApiResult<T>> {
  const response = await fetch(`${apiUrl}/api/v1${pathname}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json() as ApiResult<T>['payload'];
  return { status: response.status, payload };
}

function requireSuccess<T>(result: ApiResult<T>, label: string): T {
  if (result.status < 200 || result.status >= 300 || !result.payload.success || result.payload.data === undefined) {
    throw new Error(`${label} failed (${result.status}): ${JSON.stringify(result.payload)}`);
  }
  return result.payload.data;
}

function requireError(
  result: ApiResult,
  expectedStatus: number,
  expectedCode: string,
  label: string
) {
  const observedCode = result.payload.details?.code ?? result.payload.code;
  if (result.status !== expectedStatus || observedCode !== expectedCode) {
    throw new Error(
      `${label} returned ${result.status}/${String(observedCode)}: ${JSON.stringify(result.payload)}`
    );
  }
}

async function waitForHeading(page: Page, text: string, timeout = 20_000) {
  await page.waitForFunction(
    (expected) => Array.from(document.querySelectorAll('h1, h2')).some(
      (heading) => heading.textContent?.trim() === expected
    ),
    { timeout },
    text
  );
}

async function assertVisualState(page: Page, scenario: string) {
  const diagnostics = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const bodyText = document.body.textContent || '';
    return {
      h1: document.querySelector('h1')?.textContent?.trim(),
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      currentStepCount: document.querySelectorAll('[aria-current="step"]').length,
      unnamedButtons: buttons.filter(
        (button) => !button.textContent?.trim() && !button.getAttribute('aria-label')
      ).length,
      forbiddenContent: [
        'Antropometria',
        'composição corporal',
        'macronutrientes',
        'aporte energético',
        'PAR-Q',
      ].filter((value) => bodyText.includes(value)),
      containsInternalFixtureId: bodyText.includes('issue-272-owner-aluno'),
    };
  });

  if (diagnostics.h1 !== 'Anamnese Inicial') {
    throw new Error(`${scenario}: unexpected title ${String(diagnostics.h1)}`);
  }
  if (diagnostics.scrollWidth > diagnostics.viewportWidth + 1) {
    throw new Error(`${scenario}: horizontal overflow ${diagnostics.scrollWidth}/${diagnostics.viewportWidth}`);
  }
  if (diagnostics.currentStepCount !== 1) {
    throw new Error(`${scenario}: current step count ${diagnostics.currentStepCount}`);
  }
  if (diagnostics.unnamedButtons > 0) {
    throw new Error(`${scenario}: ${diagnostics.unnamedButtons} unnamed buttons`);
  }
  if (diagnostics.forbiddenContent.length > 0) {
    throw new Error(`${scenario}: forbidden content ${diagnostics.forbiddenContent.join(', ')}`);
  }
  if (diagnostics.containsInternalFixtureId) {
    throw new Error(`${scenario}: internal identifier exposed`);
  }
}

async function focusButtonByText(page: Page, text: string) {
  const focused = await page.$$eval(
    'button',
    (buttons, expected) => {
      const button = buttons.find((candidate) => candidate.textContent?.trim().includes(expected));
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.focus();
      return document.activeElement === button;
    },
    text
  );
  if (!focused) throw new Error(`Could not focus button containing ${text}`);
}

async function capture(page: Page, name: string) {
  await assertVisualState(page, name);
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
}

await mkdir(outputDir, { recursive: true });
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const createdUserIds: string[] = [];
const createdContractIds: string[] = [];
let apiProcess: ChildProcess | undefined;
let previewProcess: ChildProcess | undefined;
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

try {
  const [contractA, contractB] = await Promise.all([
    prisma.companyContract.create({
      data: {
        id: `issue-272-contract-a-${suffix}`,
        type: 'academy',
        document: `272A${Date.now()}`,
        name: 'Acesso Saúde & Performance - Unidade de validação extensa',
      },
    }),
    prisma.companyContract.create({
      data: {
        id: `issue-272-contract-b-${suffix}`,
        type: 'academy',
        document: `272B${Date.now()}`,
        name: 'Outra academia isolada',
      },
    }),
  ]);
  createdContractIds.push(contractA.id, contractB.id);

  const [ownerUser, otherUser, crossTenantUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: `issue-272-owner-${suffix}@example.com`,
        passwordHash: 'not-used',
        type: 'aluno',
        profile: { create: { name: 'Aluno responsável pelo próprio cadastro' } },
      },
    }),
    prisma.user.create({
      data: {
        email: `issue-272-other-${suffix}@example.com`,
        passwordHash: 'not-used',
        type: 'aluno',
        profile: { create: { name: 'Outro aluno do mesmo tenant' } },
      },
    }),
    prisma.user.create({
      data: {
        email: `issue-272-cross-${suffix}@example.com`,
        passwordHash: 'not-used',
        type: 'aluno',
        profile: { create: { name: 'Aluno de outro tenant' } },
      },
    }),
  ]);
  createdUserIds.push(ownerUser.id, otherUser.id, crossTenantUser.id);

  const [ownerAluno, otherAluno, crossTenantAluno] = await Promise.all([
    prisma.aluno.create({
      data: {
        id: 'issue-272-owner-aluno',
        userId: ownerUser.id,
        contractId: contractA.id,
        status: 'PRE_REGISTRATION_COMPLETED',
        birthDate: new Date('1990-05-10T00:00:00.000Z'),
        leadName: 'Aluno responsável pelo próprio cadastro',
        onboarding: {
          create: {
            contractId: contractA.id,
            claimedByUserId: ownerUser.id,
            claimRole: 'STUDENT',
            currentStep: 'PRIVACY',
            completedAt: new Date(),
          },
        },
      },
    }),
    prisma.aluno.create({
      data: {
        userId: otherUser.id,
        contractId: contractA.id,
        status: 'PRE_REGISTRATION_COMPLETED',
        birthDate: new Date('1991-06-11T00:00:00.000Z'),
        leadName: 'Outro aluno do mesmo tenant',
        onboarding: {
          create: {
            contractId: contractA.id,
            claimedByUserId: otherUser.id,
            claimRole: 'STUDENT',
            currentStep: 'PRIVACY',
            completedAt: new Date(),
          },
        },
      },
    }),
    prisma.aluno.create({
      data: {
        userId: crossTenantUser.id,
        contractId: contractB.id,
        status: 'PRE_REGISTRATION_COMPLETED',
        birthDate: new Date('1992-07-12T00:00:00.000Z'),
        leadName: 'Aluno de outro tenant',
        onboarding: {
          create: {
            contractId: contractB.id,
            claimedByUserId: crossTenantUser.id,
            claimRole: 'STUDENT',
            currentStep: 'PRIVACY',
            completedAt: new Date(),
          },
        },
      },
    }),
  ]);

  apiProcess = spawn('pnpm', ['--filter', '@corrida/api', 'exec', 'tsx', 'src/main.ts'], {
    cwd: repoRoot,
    detached: true,
    env: {
      ...process.env,
      PORT: '3002',
      API_PORT: '3002',
      NODE_ENV: 'test',
      JWT_SECRET: jwtSecret,
      FRONTEND_URL: webUrl,
      CORS_ORIGINS: webUrl,
      PRIVACY_NOTICE_URL: `${webUrl}/privacidade`,
      PRIVACY_NOTICE_VERSION: '2026-07',
      HEALTH_PRIVACY_NOTICE_URL: `${webUrl}/privacidade-saude`,
      HEALTH_PRIVACY_NOTICE_VERSION: '2026-07',
    },
    stdio: 'inherit',
  });

  previewProcess = spawn(
    'pnpm',
    ['--filter', '@corrida/web', 'preview', '--host', '127.0.0.1', '--port', '4175'],
    { cwd: repoRoot, detached: true, env: process.env, stdio: 'inherit' }
  );

  await Promise.all([waitForUrl(`${apiUrl}/health`), waitForUrl(webUrl)]);

  const ownerToken = tokenFor(ownerUser);
  const healthPath = `/pre-registration/processes/${encodeURIComponent(ownerAluno.id)}/health-intake`;

  const missingToken = await request(healthPath);
  if (missingToken.status !== 401) throw new Error(`missing token returned ${missingToken.status}`);

  const inviteTokenOnly = await request(healthPath, { token: `invite-${suffix}` });
  if (inviteTokenOnly.status !== 401) throw new Error(`invite token returned ${inviteTokenOnly.status}`);

  const hiddenCases = await Promise.all([
    request(`/pre-registration/processes/not-found-${suffix}/health-intake`, { token: ownerToken }),
    request(`/pre-registration/processes/${encodeURIComponent(otherAluno.id)}/health-intake`, { token: ownerToken }),
    request(`/pre-registration/processes/${encodeURIComponent(crossTenantAluno.id)}/health-intake`, { token: ownerToken }),
  ]);
  const hiddenShapes = hiddenCases.map((result, index) => {
    requireError(result, 404, 'NOT_FOUND', `hidden case ${index + 1}`);
    return JSON.stringify({
      status: result.status,
      error: result.payload.error,
      details: result.payload.details,
    });
  });
  if (new Set(hiddenShapes).size !== 1) {
    throw new Error(`public boundary enumerates protected records: ${hiddenShapes.join(' | ')}`);
  }

  const initial = requireSuccess(
    await request<HealthIntakeSessionDTO>(healthPath, { token: ownerToken }),
    'initial health intake'
  );
  if (initial.status !== 'NOT_STARTED' || initial.version !== 1 || initial.currentStep !== 'CONSENT') {
    throw new Error(`unexpected initial session: ${JSON.stringify(initial)}`);
  }

  const withoutConsent = await request(healthPath, {
    token: ownerToken,
    method: 'PATCH',
    body: {
      expectedVersion: 1,
      step: 'HEALTH_HISTORY',
      data: { mainGoal: 'Must not be persisted', hasMedicalConditions: false },
    },
  });
  requireError(withoutConsent, 400, 'CONSENT_REQUIRED', 'save without consent');
  if (await prisma.studentHealthIntake.findUnique({ where: { alunoId: ownerAluno.id } })) {
    throw new Error('health data was persisted before consent');
  }

  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.evaluateOnNewDocument(
    ({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    },
    {
      token: ownerToken,
      user: {
        id: ownerUser.id,
        email: ownerUser.email,
        name: 'Aluno responsável pelo próprio cadastro',
        type: 'aluno',
      },
    }
  );
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await page.goto(`${webUrl}/pre-cadastro/anamnese?alunoId=${encodeURIComponent(ownerAluno.id)}`, {
    waitUntil: 'networkidle0',
    timeout: 30_000,
  });
  await waitForHeading(page, 'Privacidade e consentimento');
  await capture(page, 'consent-mobile-real');

  const checkbox = await page.$('input[type="checkbox"]');
  if (!checkbox) throw new Error('consent checkbox not found');
  await checkbox.focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => {
    const input = document.querySelector('input[type="checkbox"]');
    return input instanceof HTMLInputElement && input.checked;
  });
  await page.waitForFunction(() => {
    const button = Array.from(document.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.includes('Salvar e avançar')
    );
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  await focusButtonByText(page, 'Salvar e avançar');
  await page.keyboard.press('Enter');
  await waitForHeading(page, 'Histórico de saúde');

  let session = requireSuccess(
    await request<HealthIntakeSessionDTO>(healthPath, { token: ownerToken }),
    'session after keyboard consent'
  );
  if (
    session.status !== 'IN_PROGRESS' ||
    session.version !== 2 ||
    session.consent.acceptedVersion !== '2026-07'
  ) {
    throw new Error(`keyboard consent did not persist correctly: ${JSON.stringify(session)}`);
  }

  session = requireSuccess(
    await request<HealthIntakeSessionDTO>(healthPath, {
      token: ownerToken,
      method: 'PATCH',
      body: {
        expectedVersion: session.version,
        step: 'HEALTH_HISTORY',
        data: {
          mainGoal: 'Retomar a corrida com segurança',
          hasMedicalConditions: false,
        },
      },
    }),
    'save health history'
  );
  const versionAfterHistory = session.version;

  const staleSave = await request(healthPath, {
    token: ownerToken,
    method: 'PATCH',
    body: {
      expectedVersion: versionAfterHistory - 1,
      step: 'HEALTH_HISTORY',
      data: { mainGoal: 'Stale overwrite', hasMedicalConditions: false },
    },
  });
  requireError(staleSave, 409, 'CONCURRENT_MODIFICATION', 'stale save');
  const afterStale = await prisma.studentHealthIntake.findUniqueOrThrow({
    where: { alunoId: ownerAluno.id },
  });
  const afterStaleClinical = afterStale.clinicalHistoryData as Record<string, unknown>;
  if (afterStale.version !== versionAfterHistory || afterStaleClinical.mainGoal !== 'Retomar a corrida com segurança') {
    throw new Error('stale edit changed the canonical record');
  }

  const resumed = requireSuccess(
    await request<HealthIntakeSessionDTO>(healthPath, { token: ownerToken }),
    'resume on another device'
  );
  if (
    resumed.version !== versionAfterHistory ||
    resumed.currentStep !== 'MEDICATIONS' ||
    resumed.answers.mainGoal !== 'Retomar a corrida com segurança'
  ) {
    throw new Error(`resume did not use persisted server state: ${JSON.stringify(resumed)}`);
  }

  await page.setViewport({ width: 1366, height: 768 });
  await page.reload({ waitUntil: 'networkidle0', timeout: 30_000 });
  await waitForHeading(page, 'Medicações e alergias');
  await capture(page, 'draft-desktop-low-height-real');

  session = requireSuccess(
    await request<HealthIntakeSessionDTO>(healthPath, {
      token: ownerToken,
      method: 'PATCH',
      body: {
        expectedVersion: resumed.version,
        step: 'MEDICATIONS',
        data: { usesMedication: false, hasAllergies: false },
      },
    }),
    'save medications'
  );
  session = requireSuccess(
    await request<HealthIntakeSessionDTO>(healthPath, {
      token: ownerToken,
      method: 'PATCH',
      body: {
        expectedVersion: session.version,
        step: 'INJURIES',
        data: { hasInjuries: false, hasExerciseRestrictions: false },
      },
    }),
    'save injuries'
  );
  session = requireSuccess(
    await request<HealthIntakeSessionDTO>(healthPath, {
      token: ownerToken,
      method: 'PATCH',
      body: {
        expectedVersion: session.version,
        step: 'ACTIVITY',
        data: {
          trainingBackground: 'Corrida e musculação três vezes por semana',
          observations: 'Sem observações adicionais',
        },
      },
    }),
    'save activity'
  );

  const staleCompletion = await request(`${healthPath}/complete`, {
    token: ownerToken,
    method: 'POST',
    body: { expectedVersion: session.version - 1, declarationAccepted: true },
  });
  requireError(staleCompletion, 409, 'CONCURRENT_MODIFICATION', 'stale completion');

  session = requireSuccess(
    await request<HealthIntakeSessionDTO>(`${healthPath}/complete`, {
      token: ownerToken,
      method: 'POST',
      body: { expectedVersion: session.version, declarationAccepted: true },
    }),
    'complete health intake'
  );
  if (session.status !== 'COMPLETED' || !session.completedAt || !session.declarationAcceptedAt) {
    throw new Error(`completion was not persisted: ${JSON.stringify(session)}`);
  }

  const beforeBlockedMutation = await prisma.studentHealthIntake.findUniqueOrThrow({
    where: { alunoId: ownerAluno.id },
  });
  let completedMutationBlocked = false;
  try {
    await prisma.$transaction((tx) =>
      upsertCanonicalStudentHealthIntake(tx, {
        alunoId: ownerAluno.id,
        contractId: contractA.id,
        sourceType: 'professional',
        sourceReference: 'legacy_admin_update',
        health: { mainGoal: 'Mutation after completion must fail' },
      })
    );
  } catch (error) {
    completedMutationBlocked = error instanceof CompletedHealthIntakeMutationError;
  }
  if (!completedMutationBlocked) {
    throw new Error('generic writer did not reject mutation after completion');
  }
  const afterBlockedMutation = await prisma.studentHealthIntake.findUniqueOrThrow({
    where: { alunoId: ownerAluno.id },
  });
  if (
    afterBlockedMutation.version !== beforeBlockedMutation.version ||
    JSON.stringify(afterBlockedMutation.clinicalHistoryData) !== JSON.stringify(beforeBlockedMutation.clinicalHistoryData) ||
    afterBlockedMutation.completedAt?.toISOString() !== beforeBlockedMutation.completedAt?.toISOString()
  ) {
    throw new Error('completed intake changed despite the immutable writer boundary');
  }

  const administrativeRead = await studentDomainService.getHealthIntake(ownerAluno.id, {
    companyContractId: contractA.id,
  });
  const administrativeClinical = administrativeRead?.clinicalHistory as Record<string, unknown> | null;
  if (
    administrativeRead?.status !== 'COMPLETED' ||
    administrativeClinical?.mainGoal !== 'Retomar a corrida com segurança'
  ) {
    throw new Error(`administrative canonical read regressed: ${JSON.stringify(administrativeRead)}`);
  }

  await page.setViewport({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle0', timeout: 30_000 });
  await waitForHeading(page, 'Revise suas respostas');
  await capture(page, 'completed-mobile-real');

  if (browserErrors.length > 0) {
    throw new Error(`browser errors: ${browserErrors.join(' | ')}`);
  }

  console.log(JSON.stringify({
    result: 'success',
    route: `/pre-cadastro/anamnese?alunoId=${ownerAluno.id}`,
    viewports: ['390x844', '1366x768'],
    keyboard: ['checkbox:Space', 'primary-button:Enter'],
    scenarios: [
      'public invite token cannot read health data',
      'existing, missing, same-tenant foreign and cross-tenant records have an indistinguishable 404 boundary',
      'health answers are not persisted before explicit versioned consent',
      'consent is persisted through the real browser route and API',
      'draft resumes from server state on reload/another device',
      'stale writes and stale completion are rejected without changing canonical data',
      'completion validates and persists the full draft transactionally',
      'generic writers cannot mutate a completed intake',
      'administrative domain read returns the canonical completed intake',
      'mobile and low-height desktop layouts have no horizontal overflow or forbidden assessment content',
    ],
  }, null, 2));
} finally {
  if (browser) await browser.close();
  stopProcess(previewProcess);
  stopProcess(apiProcess);
  await new Promise((resolve) => setTimeout(resolve, 500));
  for (const contractId of createdContractIds.reverse()) {
    await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
  }
  await prisma.$disconnect();
}
