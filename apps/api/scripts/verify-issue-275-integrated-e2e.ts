import crypto from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { PARQ_CATALOG_VERSION, type ParqResponses } from '@corrida/types';
import puppeteer, { type Browser, type Page } from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const artifactDir = path.join(repoRoot, 'artifacts', 'issue-275');
const apiUrl = 'http://127.0.0.1:3010';
const webUrl = 'http://127.0.0.1:4182';
const jwtSecret = 'issue-275-real-boundary-e2e-secret';
const prisma = new PrismaClient();
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const createdContractIds: string[] = [];
const createdUserIds: string[] = [];
const apiOutput: string[] = [];
let apiProcess: ChildProcess | undefined;
let previewProcess: ChildProcess | undefined;
let browser: Browser | undefined;
let sequence = 0;

const negativeParq = {
  q1: false,
  q2: false,
  q3: false,
  q4: false,
  q5: false,
  q6: false,
  q7: false,
} satisfies ParqResponses;
const positiveParq = { ...negativeParq, q2: true, q5: true } satisfies ParqResponses;

type JsonRecord = Record<string, unknown>;
type HttpResult<T = unknown> = {
  status: number;
  body: { success?: boolean; data?: T; error?: string; message?: string; details?: unknown };
};
type RegistrationData = {
  token: string;
  user: JsonRecord;
  alunoId: string;
  redirectTo: string;
};
type SessionData = {
  alunoId: string;
  status: string;
  version: number;
  currentStep: string;
  identity: JsonRecord;
};
type ReviewData = {
  recordVersion: number;
  fingerprint: string;
  canMarkReady: boolean;
  canConfirmEnrollment: boolean;
  health: {
    healthModuleStatus: string;
    parqModuleStatus: string;
    parqRequiresProfessionalReview: boolean;
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function stopProcess(child?: ChildProcess) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

function cpfFor(value: number): string {
  const base = String(100000000 + value).slice(-9);
  const digit = (source: string, factor: number) => {
    let total = 0;
    for (const character of source) total += Number(character) * factor--;
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  const first = digit(base, 10);
  const second = digit(`${base}${first}`, 11);
  return `${base}${first}${second}`;
}

function nextIdentity(label: string) {
  sequence += 1;
  return {
    name: `Pessoa ${label} ${sequence}`,
    phone: `1597${String(1000000 + sequence).slice(-7)}`,
    email: `issue-275-${label}-${sequence}-${suffix}@example.test`,
    cpf: cpfFor(sequence),
  };
}

async function waitForUrl(url: string, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Process still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Servidor não respondeu em ${url}`);
}

async function request<T = unknown>(
  pathname: string,
  options: {
    token?: string;
    method?: 'GET' | 'POST' | 'PATCH';
    body?: unknown;
  } = {}
): Promise<HttpResult<T>> {
  const response = await fetch(`${apiUrl}/api/v1${pathname}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body: HttpResult<T>['body'] = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: 'NON_JSON_RESPONSE', message: text };
  }
  return { status: response.status, body };
}

function dataOf<T>(result: HttpResult<T>, expected: number | number[], label: string): T {
  const expectedStatuses = Array.isArray(expected) ? expected : [expected];
  assert(
    expectedStatuses.includes(result.status),
    `${label}: esperado HTTP ${expectedStatuses.join('|')}, recebido ${result.status}: ${JSON.stringify(result.body)}`
  );
  assert(result.body.data !== undefined, `${label}: resposta sem data`);
  return result.body.data;
}

async function createTenantAndAdmin() {
  const contract = await prisma.companyContract.create({
    data: {
      type: 'academy',
      document: `275-real-e2e-${suffix}`,
      name: 'Academia Issue 275 E2E Real',
      tradeName: 'Acesso E2E Issue 275',
    },
  });
  createdContractIds.push(contract.id);
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: contract.id,
      name: 'Administrador E2E',
      code: `issue-275-e2e-master-${suffix}`,
      isActive: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `issue-275-e2e-admin-${suffix}@example.test`,
      passwordHash: 'not-used',
      type: 'professor',
      profile: { create: { name: 'Administrador E2E Issue 275' } },
    },
    include: { profile: true },
  });
  createdUserIds.push(user.id);
  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId: contract.id,
      collaboratorFunctionId: collaboratorFunction.id,
      role: 'master',
    },
  });
  const token = jwt.sign(
    { userId: user.id, email: user.email, type: user.type },
    jwtSecret,
    { expiresIn: '1h' }
  );
  const browserUser = {
    id: user.id,
    email: user.email,
    name: user.profile?.name || user.email,
    type: 'professor',
    profile: { name: user.profile?.name || user.email, avatar: null },
    professor: {
      id: professor.id,
      role: 'master',
      collaboratorFunction: {
        id: collaboratorFunction.id,
        name: collaboratorFunction.name,
        code: collaboratorFunction.code,
        isActive: true,
        accessPermissions: [],
      },
      contract: {
        id: contract.id,
        type: contract.type,
        document: contract.document,
        name: contract.name,
        tradeName: contract.tradeName,
      },
    },
    accessControl: { isMaster: true, permissions: [] },
  };
  return {
    contract,
    user,
    professor,
    token,
    browserUser,
  };
}

async function createLead(
  adminToken: string,
  label: string,
  overrides: Partial<{ name: string; phone: string; email: string; cpf: string }> = {}
) {
  const identity = { ...nextIdentity(label), ...overrides };
  const result = await request<JsonRecord>('/pre-registration-admin/leads', {
    token: adminToken,
    method: 'POST',
    body: {
      name: identity.name,
      phone: identity.phone,
      email: identity.email,
      cpf: identity.cpf,
      origin: `issue-275-${label}`,
    },
  });
  const lead = dataOf(result, 201, `${label}: criar lead`);
  assert(typeof lead.id === 'string', `${label}: lead sem id`);
  return { id: lead.id as string, identity };
}

async function createPhoneOnlyLead(adminToken: string, label: string) {
  const identity = nextIdentity(label);
  const result = await request<JsonRecord>('/pre-registration-admin/leads', {
    token: adminToken,
    method: 'POST',
    body: {
      name: identity.name,
      phone: identity.phone,
      origin: `issue-275-${label}`,
    },
  });
  const lead = dataOf(result, 201, `${label}: criar lead somente telefone`);
  return { id: String(lead.id), identity };
}

async function generateInvite(adminToken: string, alunoId: string, label: string) {
  const result = await request<JsonRecord>(
    `/pre-registration-admin/leads/${encodeURIComponent(alunoId)}/invites`,
    { token: adminToken, method: 'POST', body: {} }
  );
  const data = dataOf(result, 201, `${label}: gerar convite`);
  assert(typeof data.url === 'string', `${label}: convite sem URL`);
  const url = new URL(data.url as string);
  return { url: data.url as string, token: url.pathname.split('/').filter(Boolean).at(-1)! };
}

async function registerInvite(
  inviteToken: string,
  label: string,
  account?: Partial<{ name: string; email: string; password: string }>
) {
  const defaults = nextIdentity(`${label}-account`);
  const credentials = {
    name: account?.name || defaults.name,
    email: account?.email || defaults.email,
    password: account?.password || 'Senha-segura-275',
  };
  const result = await request<RegistrationData>(
    `/pre-cadastro/${encodeURIComponent(inviteToken)}/register`,
    {
      method: 'POST',
      body: { ...credentials, role: 'STUDENT' },
    }
  );
  return {
    registration: dataOf(result, 201, `${label}: registrar e reivindicar`),
    credentials,
  };
}

async function saveBasicSteps(
  studentToken: string,
  alunoId: string,
  identity: { name: string; phone: string; email: string; cpf: string }
) {
  let session = dataOf(
    await request<SessionData>(`/pre-registration/processes/${alunoId}/session`, {
      token: studentToken,
    }),
    200,
    'carregar sessão básica'
  );
  session = dataOf(
    await request<SessionData>(`/pre-registration/processes/${alunoId}/steps`, {
      token: studentToken,
      method: 'PATCH',
      body: {
        expectedVersion: session.version,
        step: 'IDENTIFICATION',
        data: { name: identity.name, birthDate: '1990-05-10', cpf: identity.cpf },
      },
    }),
    200,
    'salvar identificação'
  );
  session = dataOf(
    await request<SessionData>(`/pre-registration/processes/${alunoId}/steps`, {
      token: studentToken,
      method: 'PATCH',
      body: {
        expectedVersion: session.version,
        step: 'CONTACT',
        data: { phone: identity.phone, email: identity.email },
      },
    }),
    200,
    'salvar contato'
  );
  session = dataOf(
    await request<SessionData>(`/pre-registration/processes/${alunoId}/steps`, {
      token: studentToken,
      method: 'PATCH',
      body: { expectedVersion: session.version, step: 'ADDRESS', data: {} },
    }),
    200,
    'salvar endereço'
  );
  return session;
}

async function completeBasic(
  studentToken: string,
  alunoId: string,
  identity: { name: string; phone: string; email: string; cpf: string }
) {
  const session = await saveBasicSteps(studentToken, alunoId, identity);
  return dataOf(
    await request<SessionData>(`/pre-registration/processes/${alunoId}/complete`, {
      token: studentToken,
      method: 'POST',
      body: { expectedVersion: session.version, privacyAccepted: true },
    }),
    200,
    'concluir dados básicos'
  );
}

async function completeHealthIntake(studentToken: string, alunoId: string) {
  let session = dataOf<JsonRecord>(
    await request<JsonRecord>(`/pre-registration/processes/${alunoId}/health-intake`, {
      token: studentToken,
    }),
    200,
    'carregar Anamnese'
  );
  const steps = [
    {
      step: 'HEALTH_HISTORY',
      data: { mainGoal: 'Condicionamento', hasMedicalConditions: false },
      consent: { accepted: true, privacyNoticeVersion: '2026-07' },
    },
    { step: 'MEDICATIONS', data: { usesMedication: false, hasAllergies: false } },
    { step: 'INJURIES', data: { hasInjuries: false, hasExerciseRestrictions: false } },
    { step: 'ACTIVITY', data: { trainingBackground: 'Treino recreativo' } },
  ];
  for (const step of steps) {
    session = dataOf<JsonRecord>(
      await request<JsonRecord>(`/pre-registration/processes/${alunoId}/health-intake`, {
        token: studentToken,
        method: 'PATCH',
        body: { expectedVersion: session.version, ...step },
      }),
      200,
      `salvar Anamnese ${step.step}`
    );
  }
  return dataOf<JsonRecord>(
    await request<JsonRecord>(`/pre-registration/processes/${alunoId}/health-intake/complete`, {
      token: studentToken,
      method: 'POST',
      body: { expectedVersion: session.version, declarationAccepted: true },
    }),
    200,
    'concluir Anamnese'
  );
}

async function completeParq(
  studentToken: string,
  alunoId: string,
  responses: ParqResponses,
  idempotencyKey: string
) {
  const session = dataOf<JsonRecord>(
    await request<JsonRecord>(`/pre-registration/processes/${alunoId}/parq`, {
      token: studentToken,
    }),
    200,
    'carregar PAR-Q'
  );
  const consent = session.consent as JsonRecord;
  return dataOf<JsonRecord>(
    await request<JsonRecord>(`/pre-registration/processes/${alunoId}/parq/complete`, {
      token: studentToken,
      method: 'POST',
      body: {
        catalogVersion: PARQ_CATALOG_VERSION,
        expectedVersion: session.version,
        responses,
        consent: {
          accepted: true,
          privacyNoticeVersion: '2026-07',
          expectedVersion: consent.version,
        },
        declarationAccepted: true,
        idempotencyKey,
      },
    }),
    200,
    'concluir PAR-Q'
  );
}

async function reviewAndConvert(adminToken: string, alunoId: string, label: string) {
  const review = dataOf(
    await request<ReviewData>(
      `/pre-registration-admin/leads/${alunoId}/enrollment-review`,
      { token: adminToken }
    ),
    200,
    `${label}: carregar revisão`
  );
  const ready = dataOf(
    await request<ReviewData>(`/pre-registration-admin/leads/${alunoId}/review`, {
      token: adminToken,
      method: 'POST',
      body: {
        expectedVersion: review.recordVersion,
        fingerprint: review.fingerprint,
        reason: `Revisão E2E ${label}`,
      },
    }),
    200,
    `${label}: marcar pronto`
  );
  const converted = dataOf<JsonRecord>(
    await request<JsonRecord>(`/pre-registration-admin/leads/${alunoId}/convert`, {
      token: adminToken,
      method: 'POST',
      body: {
        expectedVersion: ready.recordVersion,
        fingerprint: ready.fingerprint,
        confirmationAccepted: true,
      },
    }),
    200,
    `${label}: confirmar matrícula`
  );
  assert(converted.alunoId === alunoId, `${label}: conversão alterou o identificador`);
  return converted;
}

async function downstreamCounts(alunoId: string) {
  const tables = await prisma.$queryRaw<Array<{ tableName: string }>>`
    SELECT DISTINCT table_name AS "tableName"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'alunoId'
      AND table_name ~* '(contract|payment|billing|charge|agenda|booking|schedule|plan)'
      AND table_name !~* '(event|audit|template|catalog|option|lifecycle|invite|onboarding|review)'
    ORDER BY table_name
  `;
  const counts: Record<string, number> = {};
  for (const { tableName } of tables) {
    const escaped = tableName.replace(/"/g, '""');
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "${escaped}" WHERE "alunoId" = $1`,
      alunoId
    );
    counts[tableName] = Number(rows[0]?.count ?? 0n);
  }
  return counts;
}

async function fillByLabel(page: Page, labelText: string, value: string) {
  const selector = await page.evaluate((expected) => {
    const label = Array.from(document.querySelectorAll('label')).find((candidate) =>
      candidate.textContent?.includes(expected)
    );
    if (!label) return null;
    const htmlFor = label.getAttribute('for');
    const field = htmlFor ? document.getElementById(htmlFor) : label.querySelector('input, textarea');
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return null;
    if (!field.id) field.id = `e2e-${Math.random().toString(36).slice(2)}`;
    return `#${CSS.escape(field.id)}`;
  }, labelText);
  assert(selector, `Campo não encontrado: ${labelText}`);
  await page.focus(selector);
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type(selector, value);
}

async function clickByText(page: Page, selector: string, text: string) {
  await page.waitForFunction(
    (query, expected) => Array.from(document.querySelectorAll(query)).some(
      (element) => element.textContent?.trim().includes(expected)
    ),
    { timeout: 20_000 },
    selector,
    text
  );
  const clicked = await page.$$eval(
    selector,
    (elements, expected) => {
      const target = elements.find((element) => element.textContent?.trim().includes(expected));
      if (!(target instanceof HTMLElement)) return false;
      target.click();
      return true;
    },
    text
  );
  assert(clicked, `Controle não encontrado: ${text}`);
}

async function waitForHeading(page: Page, text: string) {
  await page.waitForFunction(
    (expected) => Array.from(document.querySelectorAll('h1, h2')).some(
      (heading) => heading.textContent?.trim().includes(expected)
    ),
    { timeout: 30_000 },
    text
  );
}

async function waitForText(page: Page, text: string) {
  await page.waitForFunction(
    (expected) => document.body.innerText.includes(expected),
    { timeout: 30_000 },
    text
  );
}

async function installSession(page: Page, token: string, user: JsonRecord, captureClipboard = false) {
  await page.evaluateOnNewDocument(
    (storedToken, storedUser, shouldCaptureClipboard) => {
      localStorage.setItem('token', storedToken);
      localStorage.setItem('user', JSON.stringify(storedUser));
      if (shouldCaptureClipboard) {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async (value: string) => {
              (window as unknown as { __issue275Invite?: string }).__issue275Invite = value;
            },
          },
        });
      }
    },
    token,
    user,
    captureClipboard
  );
}

async function newIsolatedPage(currentBrowser: Browser) {
  const contextFactory = currentBrowser as unknown as {
    createBrowserContext?: () => Promise<{ newPage(): Promise<Page>; close(): Promise<void> }>;
    createIncognitoBrowserContext?: () => Promise<{ newPage(): Promise<Page>; close(): Promise<void> }>;
  };
  const context = contextFactory.createBrowserContext
    ? await contextFactory.createBrowserContext.call(currentBrowser)
    : await contextFactory.createIncognitoBrowserContext!.call(currentBrowser);
  return { context, page: await context.newPage() };
}

async function scenarioBasic(
  currentBrowser: Browser,
  adminToken: string,
  adminUser: JsonRecord
) {
  const identity = nextIdentity('basic-ui');
  const adminPage = await currentBrowser.newPage();
  await adminPage.setViewport({ width: 1440, height: 900 });
  await installSession(adminPage, adminToken, adminUser, true);
  await adminPage.goto(`${webUrl}/pre-matriculas/nova`, { waitUntil: 'networkidle0' });
  await waitForHeading(adminPage, 'Novo lead');
  await fillByLabel(adminPage, 'Nome completo', identity.name);
  await fillByLabel(adminPage, 'Telefone', identity.phone);
  await fillByLabel(adminPage, 'Origem', 'Recepção E2E Issue 275');
  await clickByText(adminPage, 'button', 'Criar lead');
  await adminPage.waitForFunction(
    () => /^\/pre-matriculas\/[^/]+$/.test(window.location.pathname),
    { timeout: 30_000 }
  );
  const alunoId = new URL(adminPage.url()).pathname.split('/').filter(Boolean).at(-1)!;
  const inviteUrl = await adminPage.evaluate(
    () => (window as unknown as { __issue275Invite?: string }).__issue275Invite
  );
  assert(inviteUrl, 'Fluxo administrativo não copiou o convite recém-gerado');

  const { context: studentContext, page: studentPage } = await newIsolatedPage(currentBrowser);
  await studentPage.setViewport({ width: 390, height: 844 });
  await studentPage.goto(inviteUrl, { waitUntil: 'networkidle0', timeout: 30_000 });
  await waitForText(studentPage, 'Convite de pré-matrícula');
  await clickByText(studentPage, 'button', 'Criar acesso');
  const studentRadio = await studentPage.$('input[type="radio"][value="STUDENT"]');
  if (studentRadio) await studentRadio.click();
  await fillByLabel(studentPage, 'Nome completo', identity.name);
  await fillByLabel(studentPage, 'E-mail', identity.email);
  await fillByLabel(studentPage, 'Senha', 'Senha-segura-275');
  await clickByText(studentPage, 'button', 'Criar acesso e continuar');
  await studentPage.waitForFunction(() => window.location.pathname === '/pre-cadastro', {
    timeout: 30_000,
  });
  const studentSession = await studentPage.evaluate(() => ({
    token: localStorage.getItem('token'),
    user: JSON.parse(localStorage.getItem('user') || 'null'),
  }));
  assert(studentSession.token && studentSession.user, 'Sessão autenticada não foi criada no navegador');
  const completed = await completeBasic(studentSession.token, alunoId, identity);
  assert(completed.status === 'PRE_REGISTRATION_COMPLETED', 'Fluxo básico não concluiu o pré-cadastro');
  await studentPage.reload({ waitUntil: 'networkidle0', timeout: 30_000 });
  await waitForHeading(studentPage, 'Pré-cadastro concluído');

  await adminPage.goto(`${webUrl}/pre-matriculas/${alunoId}`, {
    waitUntil: 'networkidle0',
    timeout: 30_000,
  });
  await clickByText(adminPage, 'button', 'Marcar como pronto para matrícula');
  await waitForText(adminPage, 'Confirmar matrícula');
  const confirmed = await adminPage.$$eval('label', (labels) => {
    const label = labels.find((item) => item.textContent?.includes('Confirmo a ativação'));
    const input = label?.querySelector('input[type="checkbox"]');
    if (!(input instanceof HTMLInputElement)) return false;
    if (!input.checked) input.click();
    return input.checked;
  });
  assert(confirmed, 'Confirmação de matrícula não foi marcada');
  await clickByText(adminPage, 'button', 'Confirmar matrícula');
  await adminPage.waitForFunction(
    (expectedId) => window.location.pathname === `/central-do-aluno/${expectedId}`,
    { timeout: 30_000 },
    alunoId
  );
  await waitForText(adminPage, identity.name);

  const active = await prisma.aluno.findUniqueOrThrow({ where: { id: alunoId } });
  const counts = await downstreamCounts(alunoId);
  assert(active.id === alunoId && active.status === 'ACTIVE_STUDENT', 'UI alterou ID ou estado final');
  assert(Object.values(counts).every((count) => count === 0), 'UI criou contrato/cobrança/agenda automaticamente');
  await adminPage.screenshot({
    path: path.join(artifactDir, 'full-e2e-basic-central.png'),
    fullPage: true,
  });
  await studentContext.close();
  await adminPage.close();
  return {
    sameCanonicalId: true,
    adminUiCreatedLead: true,
    publicUiClaimedInvite: true,
    centralOpenedWithSameId: true,
    downstreamCounts: counts,
  };
}

async function scenarioCompleteNoAlert(adminToken: string) {
  const lead = await createPhoneOnlyLead(adminToken, 'complete-no-alert');
  const invite = await generateInvite(adminToken, lead.id, 'complete-no-alert');
  const { registration } = await registerInvite(invite.token, 'complete-no-alert', {
    name: lead.identity.name,
    email: lead.identity.email,
  });
  const identity = { ...lead.identity, email: String(registration.user.email || lead.identity.email) };
  await completeBasic(registration.token, lead.id, identity);
  const intake = await completeHealthIntake(registration.token, lead.id);
  const parq = await completeParq(
    registration.token,
    lead.id,
    negativeParq,
    `issue-275-no-alert-${suffix}`
  );
  assert(parq.status === 'COMPLETED_NO_ALERT', 'PAR-Q negativo gerou alerta');
  const submissionId = (parq.latestSubmission as JsonRecord | undefined)?.id;
  await reviewAndConvert(adminToken, lead.id, 'complete-no-alert');
  const [intakeAfter, submissionAfter] = await Promise.all([
    prisma.studentHealthIntake.findUnique({ where: { alunoId: lead.id } }),
    submissionId
      ? prisma.studentParqSubmission.findUnique({ where: { id: String(submissionId) } })
      : Promise.resolve(null),
  ]);
  assert(intakeAfter && intakeAfter.status === 'COMPLETED', 'Histórico da Anamnese foi perdido');
  assert(submissionAfter?.id === submissionId, 'Histórico do PAR-Q foi perdido');
  return { historiesPreserved: true, noAlert: true };
}

async function scenarioPositiveParq(adminToken: string) {
  const lead = await createPhoneOnlyLead(adminToken, 'positive-parq');
  const invite = await generateInvite(adminToken, lead.id, 'positive-parq');
  const { registration } = await registerInvite(invite.token, 'positive-parq', {
    name: lead.identity.name,
    email: lead.identity.email,
  });
  const identity = { ...lead.identity, email: String(registration.user.email || lead.identity.email) };
  await completeBasic(registration.token, lead.id, identity);
  const parq = await completeParq(
    registration.token,
    lead.id,
    positiveParq,
    `issue-275-positive-${suffix}`
  );
  assert(parq.status === 'COMPLETED_REVIEW_REQUIRED', 'PAR-Q positivo não abriu análise');
  assert((parq.latestSubmission as JsonRecord)?.positiveCount === 2, 'positiveCount canônico incorreto');
  await reviewAndConvert(adminToken, lead.id, 'positive-parq');
  const [active, pending] = await Promise.all([
    prisma.aluno.findUniqueOrThrow({ where: { id: lead.id } }),
    prisma.studentParqProfessionalReview.count({
      where: { alunoId: lead.id, status: 'PENDING' },
    }),
  ]);
  assert(active.parqRequiresProfessionalReview && pending === 1, 'Alerta PAR-Q não permaneceu');
  return { positiveCount: 2, pendingReviews: pending, commercialEnrollmentAllowed: true };
}

async function scenarioResume(currentBrowser: Browser, adminToken: string) {
  const lead = await createPhoneOnlyLead(adminToken, 'resume-browser');
  const invite = await generateInvite(adminToken, lead.id, 'resume-browser');
  const { registration } = await registerInvite(invite.token, 'resume-browser', {
    name: lead.identity.name,
    email: lead.identity.email,
  });
  const initial = dataOf(
    await request<SessionData>(`/pre-registration/processes/${lead.id}/session`, {
      token: registration.token,
    }),
    200,
    'retomada: sessão inicial'
  );

  const first = await newIsolatedPage(currentBrowser);
  await installSession(first.page, registration.token, registration.user);
  await first.page.goto(`${webUrl}/pre-cadastro`, { waitUntil: 'networkidle0' });
  await waitForHeading(first.page, 'Identificação');
  const saved = await first.page.evaluate(
    async (input) => {
      const response = await fetch(`${input.apiUrl}/api/v1/pre-registration/processes/${input.alunoId}/steps`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${input.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expectedVersion: input.version,
          step: 'IDENTIFICATION',
          data: { name: input.name, birthDate: '1992-03-10', cpf: input.cpf },
        }),
      });
      return { status: response.status, body: await response.json() };
    },
    {
      apiUrl,
      alunoId: lead.id,
      token: registration.token,
      version: initial.version,
      name: lead.identity.name,
      cpf: lead.identity.cpf,
    }
  );
  assert(saved.status === 200, `Dispositivo A não salvou: ${JSON.stringify(saved.body)}`);
  await first.context.close();

  const second = await newIsolatedPage(currentBrowser);
  await installSession(second.page, registration.token, registration.user);
  await second.page.goto(`${webUrl}/pre-cadastro`, { waitUntil: 'networkidle0' });
  await waitForHeading(second.page, 'Contato');
  await second.page.screenshot({
    path: path.join(artifactDir, 'full-e2e-resume-second-browser.png'),
    fullPage: true,
  });
  const resumed = dataOf(
    await request<SessionData>(`/pre-registration/processes/${lead.id}/session`, {
      token: registration.token,
    }),
    200,
    'retomada: sessão no dispositivo B'
  );
  assert(resumed.currentStep === 'CONTACT', 'Dispositivo B não retomou a etapa persistida');
  assert(resumed.identity.cpf === lead.identity.cpf, 'Dispositivo B não recuperou os dados persistidos');
  await second.context.close();
  return { separateBrowserContexts: true, resumedStep: resumed.currentStep };
}

async function scenarioInviteRegeneration(adminToken: string) {
  const lead = await createPhoneOnlyLead(adminToken, 'regeneration-http');
  const first = await generateInvite(adminToken, lead.id, 'regeneration-a');
  const second = await generateInvite(adminToken, lead.id, 'regeneration-b');
  assert(first.token !== second.token, 'Regeneração reutilizou token');
  const oldResult = await request(`/pre-cadastro/${first.token}`);
  const newResult = await request(`/pre-cadastro/${second.token}`);
  assert(oldResult.status === 404, 'Convite A permaneceu válido após regeneração');
  assert(newResult.status === 200, 'Convite B não ficou válido');
  const detail = dataOf<JsonRecord>(
    await request<JsonRecord>(`/pre-registration-admin/leads/${lead.id}`, { token: adminToken }),
    200,
    'regeneração: consultar detalhe'
  );
  assert(!JSON.stringify(detail).includes(second.token), 'Token bruto foi recuperado administrativamente');
  return { oldInvalid: true, newValid: true, rawTokenRecoverable: false };
}

async function scenarioDuplicates(adminToken: string) {
  const canonicalIdentity = nextIdentity('duplicate-canonical');
  const canonical = await createLead(adminToken, 'duplicate-canonical', canonicalIdentity);
  const exact = await request('/pre-registration-admin/leads', {
    token: adminToken,
    method: 'POST',
    body: {
      name: 'Pessoa duplicada exata',
      phone: nextIdentity('duplicate-attempt').phone,
      cpf: canonicalIdentity.cpf,
      origin: 'issue-275-duplicate-blocked',
    },
  });
  assert(exact.status === 409, `CPF idêntico não foi bloqueado: ${exact.status}`);

  const sharedIdentity = nextIdentity('shared-phone');
  const duplicateCheck = dataOf<JsonRecord>(
    await request<JsonRecord>('/pre-registration-admin/leads/duplicates', {
      token: adminToken,
      method: 'POST',
      body: {
        name: sharedIdentity.name,
        phone: canonicalIdentity.phone,
        email: sharedIdentity.email,
      },
    }),
    200,
    'telefone compartilhado: detectar'
  );
  assert(duplicateCheck.classification === 'REVIEW_REQUIRED', 'Telefone compartilhado não exigiu revisão');
  const allowed = dataOf<JsonRecord>(
    await request<JsonRecord>('/pre-registration-admin/leads', {
      token: adminToken,
      method: 'POST',
      body: {
        name: sharedIdentity.name,
        phone: canonicalIdentity.phone,
        email: sharedIdentity.email,
        origin: 'issue-275-shared-phone',
        confirmedDuplicateFingerprint: duplicateCheck.fingerprint,
        confirmedDuplicateReason: 'Telefone familiar compartilhado; pessoas distintas confirmadas.',
      },
    }),
    201,
    'telefone compartilhado: criar falso positivo permitido'
  );

  const publicLead = await createPhoneOnlyLead(adminToken, 'duplicate-public');
  const publicInvite = await generateInvite(adminToken, publicLead.id, 'duplicate-public');
  const { registration } = await registerInvite(publicInvite.token, 'duplicate-public', {
    name: publicLead.identity.name,
    email: publicLead.identity.email,
  });
  const session = dataOf(
    await request<SessionData>(`/pre-registration/processes/${publicLead.id}/session`, {
      token: registration.token,
    }),
    200,
    'duplicidade pública: carregar sessão'
  );
  const publicConflict = await request<SessionData>(
    `/pre-registration/processes/${publicLead.id}/steps`,
    {
      token: registration.token,
      method: 'PATCH',
      body: {
        expectedVersion: session.version,
        step: 'IDENTIFICATION',
        data: {
          name: publicLead.identity.name,
          birthDate: '1990-05-10',
          cpf: canonicalIdentity.cpf,
        },
      },
    }
  );
  assert([200, 409].includes(publicConflict.status), 'Conflito público retornou estado inesperado');
  const publicSerialized = JSON.stringify(publicConflict.body);
  for (const forbidden of [canonical.id, canonicalIdentity.name, 'candidateAlunoId', 'fingerprint']) {
    assert(!publicSerialized.includes(forbidden), `Resposta pública revelou cadastro encontrado: ${forbidden}`);
  }
  return {
    exactCpfBlocked: true,
    sharedPhoneAllowed: typeof allowed.id === 'string',
    publicResponseNonEnumerating: true,
  };
}

async function scenarioConcurrency(adminToken: string) {
  const claimLead = await createPhoneOnlyLead(adminToken, 'concurrent-claim');
  const claimInvite = await generateInvite(adminToken, claimLead.id, 'concurrent-claim');
  const accountA = nextIdentity('claim-a');
  const accountB = nextIdentity('claim-b');
  const claims = await Promise.all([
    request<RegistrationData>(`/pre-cadastro/${claimInvite.token}/register`, {
      method: 'POST',
      body: { name: accountA.name, email: accountA.email, password: 'Senha-segura-275', role: 'STUDENT' },
    }),
    request<RegistrationData>(`/pre-cadastro/${claimInvite.token}/register`, {
      method: 'POST',
      body: { name: accountB.name, email: accountB.email, password: 'Senha-segura-275', role: 'STUDENT' },
    }),
  ]);
  assert(claims.filter((result) => result.status === 201).length === 1, 'Claims concorrentes não tiveram vencedor único');

  const regenLead = await createPhoneOnlyLead(adminToken, 'concurrent-regeneration');
  await generateInvite(adminToken, regenLead.id, 'concurrent-regeneration-initial');
  const regenerations = await Promise.all([
    request(`/pre-registration-admin/leads/${regenLead.id}/invites`, {
      token: adminToken,
      method: 'POST',
      body: {},
    }),
    request(`/pre-registration-admin/leads/${regenLead.id}/invites`, {
      token: adminToken,
      method: 'POST',
      body: {},
    }),
  ]);
  assert(regenerations.some((result) => result.status === 201), 'Nenhuma regeneração concorrente concluiu');
  const activeInviteCount = await prisma.preRegistrationInvite.count({
    where: { alunoId: regenLead.id, status: 'ACTIVE' },
  });
  assert(activeInviteCount === 1, 'Regenerações concorrentes deixaram mais de um convite ativo');

  const completeLead = await createPhoneOnlyLead(adminToken, 'concurrent-complete');
  const completeInvite = await generateInvite(adminToken, completeLead.id, 'concurrent-complete');
  const { registration } = await registerInvite(completeInvite.token, 'concurrent-complete', {
    name: completeLead.identity.name,
    email: completeLead.identity.email,
  });
  const completeIdentity = {
    ...completeLead.identity,
    email: String(registration.user.email || completeLead.identity.email),
  };
  const readyToComplete = await saveBasicSteps(registration.token, completeLead.id, completeIdentity);
  const completionBody = { expectedVersion: readyToComplete.version, privacyAccepted: true };
  const completions = await Promise.all([
    request(`/pre-registration/processes/${completeLead.id}/complete`, {
      token: registration.token,
      method: 'POST',
      body: completionBody,
    }),
    request(`/pre-registration/processes/${completeLead.id}/complete`, {
      token: registration.token,
      method: 'POST',
      body: completionBody,
    }),
  ]);
  assert(completions.some((result) => result.status === 200), 'Conclusões concorrentes não produziram sucesso');
  const completionEvents = await prisma.studentLifecycleEvent.count({
    where: { alunoId: completeLead.id, eventType: 'PRE_REGISTRATION_COMPLETED' },
  });
  assert(completionEvents === 1, 'Conclusão básica duplicou evento');

  const parqSession = dataOf<JsonRecord>(
    await request<JsonRecord>(`/pre-registration/processes/${completeLead.id}/parq`, {
      token: registration.token,
    }),
    200,
    'concorrência PAR-Q: carregar'
  );
  const parqConsent = parqSession.consent as JsonRecord;
  const parqBody = {
    catalogVersion: PARQ_CATALOG_VERSION,
    expectedVersion: parqSession.version,
    responses: negativeParq,
    consent: {
      accepted: true,
      privacyNoticeVersion: '2026-07',
      expectedVersion: parqConsent.version,
    },
    declarationAccepted: true,
    idempotencyKey: `issue-275-concurrent-parq-${suffix}`,
  };
  await Promise.all([
    request(`/pre-registration/processes/${completeLead.id}/parq/complete`, {
      token: registration.token,
      method: 'POST',
      body: parqBody,
    }),
    request(`/pre-registration/processes/${completeLead.id}/parq/complete`, {
      token: registration.token,
      method: 'POST',
      body: parqBody,
    }),
  ]);
  const submissionCount = await prisma.studentParqSubmission.count({
    where: { alunoId: completeLead.id, idempotencyKey: parqBody.idempotencyKey },
  });
  assert(submissionCount === 1, 'Conclusão concorrente do PAR-Q duplicou submissão');

  const review = dataOf(
    await request<ReviewData>(
      `/pre-registration-admin/leads/${completeLead.id}/enrollment-review`,
      { token: adminToken }
    ),
    200,
    'concorrência matrícula: revisar'
  );
  const ready = dataOf(
    await request<ReviewData>(`/pre-registration-admin/leads/${completeLead.id}/review`, {
      token: adminToken,
      method: 'POST',
      body: {
        expectedVersion: review.recordVersion,
        fingerprint: review.fingerprint,
        reason: 'Revisão concorrente',
      },
    }),
    200,
    'concorrência matrícula: marcar pronto'
  );
  const conversionBody = {
    expectedVersion: ready.recordVersion,
    fingerprint: ready.fingerprint,
    confirmationAccepted: true,
  };
  const conversions = await Promise.all([
    request(`/pre-registration-admin/leads/${completeLead.id}/convert`, {
      token: adminToken,
      method: 'POST',
      body: conversionBody,
    }),
    request(`/pre-registration-admin/leads/${completeLead.id}/convert`, {
      token: adminToken,
      method: 'POST',
      body: conversionBody,
    }),
  ]);
  assert(conversions.some((result) => result.status === 200), 'Conversões concorrentes não ativaram matrícula');
  const activationEvents = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "StudentLifecycleEvent"
    WHERE "alunoId" = ${completeLead.id}
      AND "eventType" = 'STATUS_CHANGED'
      AND "metadata"->>'to' = 'ACTIVE_STUDENT'
  `;
  assert(Number(activationEvents[0]?.count ?? 0n) === 1, 'Conversão concorrente duplicou ativação');

  const raceLead = await createPhoneOnlyLead(adminToken, 'admin-public-race');
  const raceInvite = await generateInvite(adminToken, raceLead.id, 'admin-public-race');
  const { registration: raceRegistration } = await registerInvite(raceInvite.token, 'admin-public-race', {
    name: raceLead.identity.name,
    email: raceLead.identity.email,
  });
  const raceSession = dataOf(
    await request<SessionData>(`/pre-registration/processes/${raceLead.id}/session`, {
      token: raceRegistration.token,
    }),
    200,
    'corrida admin/público: carregar'
  );
  const [publicSave, adminEdit] = await Promise.all([
    request(`/pre-registration/processes/${raceLead.id}/steps`, {
      token: raceRegistration.token,
      method: 'PATCH',
      body: {
        expectedVersion: raceSession.version,
        step: 'IDENTIFICATION',
        data: { name: raceLead.identity.name, birthDate: '1990-05-10', cpf: raceLead.identity.cpf },
      },
    }),
    request(`/pre-registration-admin/leads/${raceLead.id}`, {
      token: adminToken,
      method: 'PATCH',
      body: { commercialNotes: 'Atualização administrativa concorrente' },
    }),
  ]);
  assert(publicSave.status < 500 && adminEdit.status < 500, 'Corrida administrativa/pública produziu erro interno');
  const coherent = await prisma.aluno.findUniqueOrThrow({
    where: { id: raceLead.id },
    include: { studentProfile: true },
  });
  assert(coherent.id === raceLead.id, 'Corrida administrativa/pública alterou identidade canônica');

  return {
    claimWinnerCount: 1,
    activeInviteCount,
    completionEventCount: completionEvents,
    parqSubmissionCount: submissionCount,
    activationEventCount: 1,
    administrativePublicRaceCoherent: true,
  };
}

async function scenarioUnexpectedErrorBoundary(adminToken: string) {
  const lead = await createPhoneOnlyLead(adminToken, 'safe-error-boundary');
  const secret = `CPF-123.456.789-00-token-${suffix}`;
  const result = await request(`/pre-registration-admin/leads/${lead.id}`, {
    token: adminToken,
    method: 'PATCH',
    body: { commercialNotes: { secret } },
  });
  assert(result.status === 500, `Falha deliberada não alcançou 5xx: ${result.status}`);
  assert(result.body.error === 'PRE_REGISTRATION_INTERNAL_ERROR', 'Erro 5xx não foi normalizado');
  assert(typeof (result.body as JsonRecord).correlationId === 'string', 'Resposta 5xx sem correlationId');
  const serializedResponse = JSON.stringify(result.body);
  assert(!serializedResponse.includes(secret), 'Resposta 5xx expôs conteúdo da requisição');
  await new Promise((resolve) => setTimeout(resolve, 250));
  const logs = apiOutput.join('');
  assert(!logs.includes(secret), 'Log da API expôs conteúdo da requisição em erro inesperado');
  return { genericResponse: true, sanitizedLogs: true, correlationIdPresent: true };
}

async function cleanup() {
  stopProcess(previewProcess);
  stopProcess(apiProcess);
  await new Promise((resolve) => setTimeout(resolve, 500));
  for (const contractId of [...createdContractIds].reverse()) {
    await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
  }
  for (const userId of [...createdUserIds].reverse()) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
}

async function main() {
  await mkdir(artifactDir, { recursive: true });
  const admin = await createTenantAndAdmin();

  const build = spawnSync('pnpm', ['--filter', '@corrida/web', 'build'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      VITE_API_URL: apiUrl,
      VITE_PRE_REGISTRATION_ENABLED: 'true',
    },
    stdio: 'inherit',
  });
  assert(build.status === 0, `Build web para E2E falhou com status ${build.status}`);

  apiProcess = spawn('pnpm', ['--filter', '@corrida/api', 'exec', 'tsx', 'src/main.ts'], {
    cwd: repoRoot,
    detached: true,
    env: {
      ...process.env,
      PORT: '3010',
      API_PORT: '3010',
      NODE_ENV: 'test',
      JWT_SECRET: jwtSecret,
      FRONTEND_URL: webUrl,
      CORS_ORIGINS: webUrl,
      PRE_REGISTRATION_ENABLED: 'true',
      PRE_REGISTRATION_TELEMETRY_ENABLED: 'true',
      PRIVACY_NOTICE_URL: `${webUrl}/privacidade`,
      PRIVACY_NOTICE_VERSION: '2026-07',
      HEALTH_PRIVACY_NOTICE_VERSION: '2026-07',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  apiProcess.stdout?.on('data', (chunk) => apiOutput.push(String(chunk)));
  apiProcess.stderr?.on('data', (chunk) => apiOutput.push(String(chunk)));
  previewProcess = spawn(
    'pnpm',
    ['--filter', '@corrida/web', 'preview', '--host', '127.0.0.1', '--port', '4182'],
    { cwd: repoRoot, detached: true, stdio: 'inherit' }
  );
  await Promise.all([waitForUrl(`${apiUrl}/health`), waitForUrl(webUrl)]);
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results = {
    schemaVersion: 2,
    kind: 'issue-275-integrated-e2e',
    dataset: `synthetic-postgresql-browser-http-${suffix}`,
    boundaryCoverage: {
      administrativeBrowser: true,
      publicBrowser: true,
      isolatedSecondBrowser: true,
      authentication: true,
      httpApi: true,
      domainServices: true,
      postgresql: true,
    },
    scenarios: {
      basic: await scenarioBasic(browser, admin.token, admin.browserUser),
      completeNoAlert: await scenarioCompleteNoAlert(admin.token),
      positiveParq: await scenarioPositiveParq(admin.token),
      resume: await scenarioResume(browser, admin.token),
      inviteRegeneration: await scenarioInviteRegeneration(admin.token),
      duplicates: await scenarioDuplicates(admin.token),
      concurrency: await scenarioConcurrency(admin.token),
      unexpectedErrorBoundary: await scenarioUnexpectedErrorBoundary(admin.token),
    },
  };

  const serialized = JSON.stringify(results, null, 2);
  for (const forbidden of [
    'tokenHash',
    'passwordHash',
    'privacyAcceptedIp',
    'positiveItems',
    'Senha-segura-275',
  ]) {
    assert(!serialized.includes(`"${forbidden}"`), `Evidência expôs campo sensível ${forbidden}`);
  }
  await writeFile(
    path.join(artifactDir, 'integrated-e2e.json'),
    `${serialized}\n`,
    'utf8'
  );
  console.log(serialized);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close().catch(() => undefined);
    await cleanup().catch(() => undefined);
    await prisma.$disconnect();
  });
