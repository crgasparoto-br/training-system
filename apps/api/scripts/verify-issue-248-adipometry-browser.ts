import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import puppeteer, { type Page } from 'puppeteer';
import { adipometryGovernanceService } from '../src/modules/adipometry/adipometry-governance.service.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const artifactDir = path.join(repoRoot, 'artifacts', 'issue-275');
const webUrl = 'http://127.0.0.1:4180';
const apiUrl = 'http://127.0.0.1:3011';
const jwtSecret = 'issue-248-adipometry-browser-integration-secret';
const prisma = new PrismaClient();
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

let contractId = '';
let actorUserId = '';
let responsibleUserId = '';
let responsibleProfessorId = '';
let studentUserId = '';
let alunoId = '';
let actorFunctionId = '';
let responsibleFunctionId = '';
let apiProcess: ChildProcess | undefined;
let previewProcess: ChildProcess | undefined;
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function stopProcess(child?: ChildProcess): void {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

async function waitForUrl(url: string, timeoutMs = 60_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Processo ainda iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Servidor não respondeu em ${url}.`);
}

async function waitForText(page: Page, text: string, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    (expected) => document.body.innerText.includes(expected),
    { timeout },
    text
  );
}

async function clickButton(page: Page, text: string, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const button = Array.from(document.querySelectorAll('button')).find(
        (item) => item.textContent?.trim() === expected
      );
      return button instanceof HTMLButtonElement && !button.disabled;
    },
    { timeout },
    text
  );
  const clicked = await page.$$eval(
    'button',
    (buttons, expected) => {
      const button = buttons.find((item) => item.textContent?.trim() === expected);
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    },
    text
  );
  assert(clicked, `Botão habilitado não encontrado: ${text}.`);
}

async function setControlValue(page: Page, selector: string, value: string): Promise<void> {
  await page.waitForSelector(selector, { timeout: 30_000 });
  const changed = await page.$eval(
    selector,
    (element, nextValue) => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        const prototype = element instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        setter?.call(element, nextValue);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return element.value === nextValue;
      }
      if (element instanceof HTMLSelectElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(element, nextValue);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return element.value === nextValue;
      }
      return false;
    },
    value
  );
  assert(changed, `Não foi possível preencher ${selector}.`);
}

async function selectFirstAvailableProtocol(page: Page): Promise<string> {
  await page.waitForSelector('#adpt-protocol', { timeout: 30_000 });
  const value = await page.$eval('#adpt-protocol', (element) => {
    if (!(element instanceof HTMLSelectElement)) return '';
    const option = Array.from(element.options).find(
      (candidate) => candidate.value && !candidate.disabled
    );
    if (!option) return '';
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(element, option.value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return option.value;
  });
  assert(value, 'Nenhum protocolo aprovado ficou disponível na interface.');
  return value;
}

async function waitForAssessmentId(
  page: Page,
  previousId = '',
  timeout = 30_000
): Promise<string> {
  await page.waitForFunction(
    (oldId) => {
      const current = new URL(window.location.href).searchParams.get('assessmentId') ?? '';
      return Boolean(current && current !== oldId);
    },
    { timeout },
    previousId
  );
  return page.evaluate(
    () => new URL(window.location.href).searchParams.get('assessmentId') ?? ''
  );
}

async function poll<T>(
  description: string,
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 30_000
): Promise<T> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Tempo esgotado aguardando ${description}.`);
}

async function createFixture(): Promise<{
  actorEmail: string;
  protocolCode: string;
  protocolVersion: number;
}> {
  const contract = await prisma.companyContract.create({
    data: {
      type: 'academy',
      document: `248-browser-${suffix}`,
      name: 'Academia ADPT Browser Integration',
    },
  });
  contractId = contract.id;

  const [actorFunction, responsibleFunction] = await Promise.all([
    prisma.collaboratorFunctionOption.create({
      data: {
        contractId,
        name: 'Operação ADPT Browser',
        code: `ADPT-BROWSER-ACTOR-${suffix}`,
      },
    }),
    prisma.collaboratorFunctionOption.create({
      data: {
        contractId,
        name: 'Responsável ADPT Browser',
        code: `ADPT-BROWSER-RESPONSIBLE-${suffix}`,
      },
    }),
  ]);
  actorFunctionId = actorFunction.id;
  responsibleFunctionId = responsibleFunction.id;

  await prisma.accessPermission.createMany({
    data: [
      ...[
        '',
        'physicalAssessment.adpt.view',
        'physicalAssessment.adpt.actions.manage',
        'physicalAssessment.adpt.actions.correctCompleted',
      ].map((blockKey) => ({
        collaboratorFunctionId: actorFunction.id,
        screenKey: 'physicalAssessment.protocol',
        blockKey,
        canView: true,
      })),
      ...['', 'physicalAssessment.adpt.view', 'physicalAssessment.adpt.actions.manage'].map(
        (blockKey) => ({
          collaboratorFunctionId: responsibleFunction.id,
          screenKey: 'physicalAssessment.protocol',
          blockKey,
          canView: true,
        })
      ),
      {
        collaboratorFunctionId: responsibleFunction.id,
        screenKey: 'settings.contract',
        blockKey: '',
        canView: true,
      },
      {
        collaboratorFunctionId: responsibleFunction.id,
        screenKey: 'settings.contract',
        blockKey: 'settings.contract.actions.manageClinicalTechnicalResponsibility',
        canView: true,
      },
      {
        collaboratorFunctionId: responsibleFunction.id,
        screenKey: 'settings.contract',
        blockKey: 'settings.contract.adipometryProtocolApproval',
        canView: true,
      },
    ],
  });

  const actorEmail = `adpt-browser-actor-${suffix}@example.invalid`;
  const [actorUser, responsibleUser, studentUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: actorEmail,
        passwordHash: 'not-used',
        type: 'professor',
        isActive: true,
        profile: { create: { name: 'Operadora ADPT Browser' } },
      },
    }),
    prisma.user.create({
      data: {
        email: `adpt-browser-responsible-${suffix}@example.invalid`,
        passwordHash: 'not-used',
        type: 'professor',
        isActive: true,
        profile: {
          create: {
            name: 'Professora Clínica ADPT Browser',
            cref: '000001-G/SP',
          },
        },
      },
    }),
    prisma.user.create({
      data: {
        email: `adpt-browser-student-${suffix}@example.invalid`,
        passwordHash: 'not-used',
        type: 'aluno',
        isActive: true,
        profile: {
          create: {
            name: 'Aluno ADPT Browser',
            birthDate: new Date('2001-08-04T00:00:00.000Z'),
            gender: 'male',
          },
        },
      },
    }),
  ]);
  actorUserId = actorUser.id;
  responsibleUserId = responsibleUser.id;
  studentUserId = studentUser.id;

  const responsible = await prisma.professor.create({
    data: {
      userId: responsibleUser.id,
      contractId,
      collaboratorFunctionId: responsibleFunction.id,
      role: 'professor',
      currentStatus: 'active',
    },
  });
  responsibleProfessorId = responsible.id;

  const aluno = await prisma.aluno.create({
    data: {
      userId: studentUser.id,
      professorId: responsible.id,
      contractId,
      status: 'ACTIVE_STUDENT',
      birthDate: new Date('2001-08-04T00:00:00.000Z'),
    },
  });
  alunoId = aluno.id;

  await prisma.studentProfile.create({
    data: {
      alunoId: aluno.id,
      contractId,
      sourceType: 'professional',
      sourceReference: 'issue-248-real-browser-integration',
      identificationData: {
        birthDate: '2001-08-04',
        gender: 'male',
      },
    },
  });

  await prisma.$executeRawUnsafe(
    `INSERT INTO "ProfessionalActorMembership"
       ("id", "userId", "contractId", "collaboratorFunctionId", "isActive")
     VALUES ($1, $2, $3, $4, TRUE)`,
    `adpt-browser-membership-${suffix}`,
    actorUser.id,
    contractId,
    actorFunction.id
  );

  const designated = await adipometryGovernanceService.designate(
    contractId,
    responsibleUser.id,
    responsible.id,
    { professorId: responsible.id }
  );
  const governedProtocol = designated.protocols.find(
    (item) => item.code === 'GUEDES_1991_ADULT_YOUNG'
  );
  assert(governedProtocol, 'O protocolo Guedes não está disponível na governança ADPT.');

  await adipometryGovernanceService.approve(
    contractId,
    responsibleUser.id,
    responsible.id,
    governedProtocol.code,
    governedProtocol.version,
    {
      approvalStatement:
        'Aprovo esta especificação clínica para o cenário integrado automatizado da Issue 248.',
      approvedSpecificationHash: governedProtocol.specificationHash,
    }
  );

  return {
    actorEmail,
    protocolCode: governedProtocol.code,
    protocolVersion: governedProtocol.version,
  };
}

async function startServers(): Promise<void> {
  apiProcess = spawn('pnpm', ['--filter', '@corrida/api', 'exec', 'tsx', 'src/main.ts'], {
    cwd: repoRoot,
    detached: true,
    env: {
      ...process.env,
      PORT: '3011',
      API_PORT: '3011',
      NODE_ENV: 'test',
      JWT_SECRET: jwtSecret,
      FRONTEND_URL: webUrl,
      CORS_ORIGINS: webUrl,
    },
    stdio: 'inherit',
  });

  previewProcess = spawn(
    'pnpm',
    ['--filter', '@corrida/web', 'preview', '--host', '127.0.0.1', '--port', '4180'],
    {
      cwd: repoRoot,
      detached: true,
      env: { ...process.env, VITE_API_URL: apiUrl },
      stdio: 'inherit',
    }
  );

  await Promise.all([waitForUrl(`${apiUrl}/health`), waitForUrl(webUrl)]);
}

async function readAuthenticatedUser(token: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${apiUrl}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await response.json()) as {
    success?: boolean;
    data?: Record<string, unknown>;
    error?: unknown;
  };
  assert(response.ok && body.data, `Falha ao resolver o ator autenticado: ${JSON.stringify(body.error)}`);
  return body.data;
}

async function cleanup(): Promise<void> {
  if (browser) await browser.close().catch(() => undefined);
  stopProcess(previewProcess);
  stopProcess(apiProcess);
  await new Promise((resolve) => setTimeout(resolve, 500));

  if (contractId) {
    await prisma.adipometryAuditEvent.deleteMany({ where: { contractId } }).catch(() => undefined);
    await prisma.adipometryAssessment.deleteMany({ where: { contractId } }).catch(() => undefined);
    await prisma.adipometrySequence.deleteMany({ where: { contractId } }).catch(() => undefined);
    await prisma.adipometryProtocolApproval.deleteMany({ where: { contractId } }).catch(() => undefined);
    await prisma.adipometryClinicalResponsibility.deleteMany({ where: { contractId } }).catch(() => undefined);
    await prisma.studentProfile.deleteMany({ where: { contractId } }).catch(() => undefined);
    await prisma.aluno.deleteMany({ where: { contractId } }).catch(() => undefined);
    await prisma.$executeRawUnsafe(
      'DELETE FROM "ProfessionalActorMembership" WHERE "contractId" = $1',
      contractId
    ).catch(() => undefined);
  }

  if (responsibleProfessorId) {
    await prisma.professor.delete({ where: { id: responsibleProfessorId } }).catch(() => undefined);
  }
  if (actorFunctionId || responsibleFunctionId) {
    await prisma.accessPermission.deleteMany({
      where: {
        collaboratorFunctionId: {
          in: [actorFunctionId, responsibleFunctionId].filter(Boolean),
        },
      },
    }).catch(() => undefined);
    await prisma.collaboratorFunctionOption.deleteMany({
      where: { id: { in: [actorFunctionId, responsibleFunctionId].filter(Boolean) } },
    }).catch(() => undefined);
  }
  const userIds = [actorUserId, responsibleUserId, studentUserId].filter(Boolean);
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);
  }
  if (contractId) {
    await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
  }
  await prisma.$disconnect();
}

async function main(): Promise<void> {
  await mkdir(artifactDir, { recursive: true });
  const fixture = await createFixture();
  await startServers();

  const bearerToken = jwt.sign(
    { userId: actorUserId, email: fixture.actorEmail, type: 'professor' },
    jwtSecret,
    { expiresIn: '1h' }
  );
  const authenticatedUser = await readAuthenticatedUser(bearerToken);

  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const previews: Array<{ inputFingerprint: string; canFinalize: boolean }> = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', async (response) => {
    if (
      response.request().method() === 'POST'
      && response.url().includes('/adipometry/assessments/')
      && response.url().endsWith('/calculate')
      && response.ok()
    ) {
      const body = (await response.json().catch(() => null)) as {
        data?: { inputFingerprint?: string; canFinalize?: boolean };
      } | null;
      if (body?.data?.inputFingerprint) {
        previews.push({
          inputFingerprint: body.data.inputFingerprint,
          canFinalize: Boolean(body.data.canFinalize),
        });
      }
    }
  });

  await page.evaluateOnNewDocument(
    (token, user) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    },
    bearerToken,
    authenticatedUser
  );

  const route = `/protocolo-avaliacao-fisica/adipometria?alunoId=${encodeURIComponent(alunoId)}`;
  await page.goto(`${webUrl}${route}`, { waitUntil: 'networkidle0', timeout: 30_000 });
  await waitForText(page, 'Aluno preservado porque o fluxo foi iniciado pela Central.');
  await clickButton(page, 'Nova avaliação');
  const originalAssessmentId = await waitForAssessmentId(page);
  await waitForText(page, 'ADPT-001');

  const protocolKey = await selectFirstAvailableProtocol(page);
  await setControlValue(page, '#adpt-sex', 'male');
  await setControlValue(page, '#adpt-sex-source', 'profile');
  await setControlValue(page, '#adpt-weightKg', '80');
  await setControlValue(page, '#adpt-tricepsMm', '12');
  await setControlValue(page, '#adpt-subscapularMm', '14');
  await setControlValue(page, '#adpt-suprailiacMm', '18');
  await setControlValue(page, '#adpt-abdominalMm', '20');
  await setControlValue(page, '#adpt-thighMm', '16');

  await clickButton(page, 'Salvar e calcular');
  await poll(
    'a primeira prévia autoritativa',
    async () => previews.length,
    (count) => count >= 1
  );
  assert(previews[0]?.canFinalize, 'A primeira prévia não permitiu conclusão.');
  await waitForText(page, '18,12 %');

  await clickButton(page, 'Concluir avaliação');
  await waitForText(page, 'Confirmar conclusão da ADPT');
  await clickButton(page, 'Confirmar conclusão');
  const originalFinalized = await poll(
    'a conclusão original',
    () => prisma.adipometryAssessment.findUnique({ where: { id: originalAssessmentId } }),
    (row) => row?.revisionStatus === 'FINALIZED'
  );
  assert(originalFinalized, 'A avaliação original desapareceu após a conclusão.');
  await page.screenshot({
    path: path.join(artifactDir, 'adipometry-browser-finalized.png'),
    fullPage: true,
  });

  const firstFingerprint = previews[0]!.inputFingerprint;
  const beforeRepeat = {
    assessmentCount: await prisma.adipometryAssessment.count({
      where: { rootAssessmentId: originalFinalized.rootAssessmentId },
    }),
    auditCount: await prisma.adipometryAuditEvent.count({
      where: { assessmentId: originalAssessmentId },
    }),
    completedAt: originalFinalized.completedAt?.toISOString() ?? null,
  };
  const repeatResult = await page.evaluate(
    async ({ endpoint, assessmentId, fingerprint }) => {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${endpoint}/api/v1/adipometry/assessments/${assessmentId}/finalize`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inputFingerprint: fingerprint }),
        }
      );
      return {
        status: response.status,
        body: await response.json(),
      };
    },
    {
      endpoint: apiUrl,
      assessmentId: originalAssessmentId,
      fingerprint: firstFingerprint,
    }
  );
  assert(repeatResult.status === 200, `A repetição da conclusão retornou ${repeatResult.status}.`);
  const repeatData = (repeatResult.body as { data?: { alreadyFinalized?: boolean } }).data;
  assert(repeatData?.alreadyFinalized === true, 'A repetição não informou alreadyFinalized=true.');

  const afterRepeatRow = await prisma.adipometryAssessment.findUniqueOrThrow({
    where: { id: originalAssessmentId },
  });
  const afterRepeat = {
    assessmentCount: await prisma.adipometryAssessment.count({
      where: { rootAssessmentId: originalFinalized.rootAssessmentId },
    }),
    auditCount: await prisma.adipometryAuditEvent.count({
      where: { assessmentId: originalAssessmentId },
    }),
    completedAt: afterRepeatRow.completedAt?.toISOString() ?? null,
  };
  assert(
    JSON.stringify(afterRepeat) === JSON.stringify(beforeRepeat),
    `A conclusão repetida produziu efeitos: ${JSON.stringify({ beforeRepeat, afterRepeat })}.`
  );

  await clickButton(page, 'Iniciar correção');
  await setControlValue(
    page,
    '#adpt-correction-reason',
    'Corrigir a dobra tricipital para validar o ciclo integrado de revisão.'
  );
  await clickButton(page, 'Criar revisão');
  const correctionAssessmentId = await waitForAssessmentId(page, originalAssessmentId);
  await page.waitForSelector('#adpt-tricepsMm:not([disabled])', { timeout: 30_000 });
  await setControlValue(page, '#adpt-tricepsMm', '13');
  await clickButton(page, 'Salvar e calcular');
  await poll(
    'a prévia da correção',
    async () => previews.length,
    (count) => count >= 2
  );
  assert(previews[1]?.canFinalize, 'A prévia da correção não permitiu conclusão.');
  await clickButton(page, 'Concluir avaliação');
  await clickButton(page, 'Confirmar conclusão');

  const correctionFinalized = await poll(
    'a conclusão da revisão corretiva',
    () => prisma.adipometryAssessment.findUnique({ where: { id: correctionAssessmentId } }),
    (row) => row?.revisionStatus === 'FINALIZED'
  );
  const originalSuperseded = await prisma.adipometryAssessment.findUniqueOrThrow({
    where: { id: originalAssessmentId },
  });
  assert(correctionFinalized, 'A revisão corretiva desapareceu após a conclusão.');
  assert(originalSuperseded.revisionStatus === 'SUPERSEDED', 'A revisão original não foi substituída.');
  assert(correctionFinalized.revisionNumber === 2, 'A correção não recebeu revisão R2.');
  assert(correctionFinalized.rootAssessmentId === originalSuperseded.rootAssessmentId, 'A correção mudou a raiz.');
  assert(correctionFinalized.code === originalSuperseded.code, 'A correção consumiu outro código ADPT.');
  assert(correctionFinalized.beforeSnapshot, 'A correção final não preservou beforeSnapshot.');
  assert(correctionFinalized.afterSnapshot, 'A correção final não preservou afterSnapshot.');
  assert(
    Array.isArray(correctionFinalized.changedFields)
      && correctionFinalized.changedFields.length > 0,
    'A correção final não registrou changedFields.'
  );
  await page.screenshot({
    path: path.join(artifactDir, 'adipometry-browser-correction-finalized.png'),
    fullPage: true,
  });

  await clickButton(page, 'Iniciar correção');
  await setControlValue(
    page,
    '#adpt-correction-reason',
    'Abrir uma revisão para comprovar o cancelamento auditável no navegador.'
  );
  await clickButton(page, 'Criar revisão');
  const cancelledAssessmentId = await waitForAssessmentId(page, correctionAssessmentId);
  await clickButton(page, 'Cancelar correção');
  await setControlValue(
    page,
    '#adpt-cancel-reason',
    'Cancelamento deliberado do controle integrado da Issue 248.'
  );
  await clickButton(page, 'Confirmar cancelamento');

  const cancelledRevision = await poll(
    'o cancelamento da revisão R3',
    () => prisma.adipometryAssessment.findUnique({ where: { id: cancelledAssessmentId } }),
    (row) => row?.revisionStatus === 'CANCELLED'
  );
  assert(cancelledRevision?.revisionNumber === 3, 'A revisão cancelada não foi preservada como R3.');
  const currentFinalized = await prisma.adipometryAssessment.findMany({
    where: {
      rootAssessmentId: originalFinalized.rootAssessmentId,
      revisionStatus: 'FINALIZED',
    },
  });
  assert(
    currentFinalized.length === 1 && currentFinalized[0]?.id === correctionAssessmentId,
    'O cancelamento alterou a revisão finalizada vigente.'
  );
  await page.screenshot({
    path: path.join(artifactDir, 'adipometry-browser-correction-cancelled.png'),
    fullPage: true,
  });

  assert(pageErrors.length === 0, `Erros de página: ${pageErrors.join(' | ')}`);
  assert(consoleErrors.length === 0, `Erros no console: ${consoleErrors.join(' | ')}`);

  const report = {
    schemaVersion: 1,
    kind: 'issue-248-adipometry-real-browser-integration',
    issue: 248,
    route: '/protocolo-avaliacao-fisica/adipometria',
    headSha: process.env.AUDIT_HEAD_SHA ?? process.env.GITHUB_SHA ?? null,
    baseSha: process.env.AUDIT_BASE_SHA ?? null,
    mergePreviewSha: process.env.AUDIT_MERGE_PREVIEW_SHA ?? process.env.GITHUB_SHA ?? null,
    actorModel: 'professional-actor-without-professor-profile',
    responsibleModel: 'eligible-professor-same-contract',
    protocol: {
      key: protocolKey,
      code: fixture.protocolCode,
      version: fixture.protocolVersion,
    },
    original: {
      assessmentId: originalAssessmentId,
      revisionNumber: 1,
      finalStatus: originalSuperseded.revisionStatus,
    },
    idempotentFinalize: {
      repeatedStatus: repeatResult.status,
      alreadyFinalized: repeatData.alreadyFinalized,
      effectsUnchanged: true,
      before: beforeRepeat,
      after: afterRepeat,
    },
    correction: {
      assessmentId: correctionAssessmentId,
      revisionNumber: correctionFinalized.revisionNumber,
      revisionStatus: correctionFinalized.revisionStatus,
      originalStatus: originalSuperseded.revisionStatus,
      snapshotsPreserved: Boolean(
        correctionFinalized.beforeSnapshot && correctionFinalized.afterSnapshot
      ),
      changedFields: correctionFinalized.changedFields,
    },
    cancelledCorrection: {
      assessmentId: cancelledAssessmentId,
      revisionNumber: cancelledRevision.revisionNumber,
      revisionStatus: cancelledRevision.revisionStatus,
      currentFinalizedAssessmentId: currentFinalized[0]?.id,
    },
    screenshots: [
      'adipometry-browser-finalized.png',
      'adipometry-browser-correction-finalized.png',
      'adipometry-browser-correction-cancelled.png',
    ],
    browserErrors: pageErrors,
    consoleErrors,
    generatedAt: new Date().toISOString(),
  };

  await writeFile(
    path.join(artifactDir, 'adipometry-browser-integration.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(cleanup);
