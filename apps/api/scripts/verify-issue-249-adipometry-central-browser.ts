import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import puppeteer, { type Page } from 'puppeteer';
import { adipometryGovernanceService } from '../src/modules/adipometry/adipometry-governance.service.js';
import { adipometryService } from '../src/modules/adipometry/adipometry.service.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const artifactDir = path.join(repoRoot, 'artifacts', 'issue-275');
const webUrl = 'http://127.0.0.1:4180';
const apiUrl = 'http://127.0.0.1:3011';
const jwtSecret = 'issue-249-adipometry-central-browser-integration-secret';
const prisma = new PrismaClient();
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

let contractId = '';
let functionId = '';
let actorUserId = '';
let actorProfessorId = '';
let studentUserId = '';
let alunoId = '';
let otherContractId = '';
let otherFunctionId = '';
let otherProfessorUserId = '';
let otherProfessorId = '';
let otherStudentUserId = '';
let otherAlunoId = '';
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

async function clickLabel(page: Page, text: string, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    (expected) => Array.from(document.querySelectorAll('label')).some(
      (label) => label.textContent?.includes(expected)
    ),
    { timeout },
    text
  );
  const clicked = await page.$$eval(
    'label',
    (labels, expected) => {
      const label = labels.find((item) => item.textContent?.includes(expected));
      if (!(label instanceof HTMLLabelElement)) return false;
      label.click();
      return true;
    },
    text
  );
  assert(clicked, `Rótulo não encontrado: ${text}.`);
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
      document: `248-browser-central-${suffix}`,
      name: 'Academia ADPT Central Integration',
    },
  });
  contractId = contract.id;

  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Professora Central ADPT',
      code: `ADPT-BROWSER-CENTRAL-${suffix}`,
    },
  });
  functionId = collaboratorFunction.id;

  const studentDetailBlocks = [
    'students.details.summary',
    'students.details.profile',
    'students.details.health',
    'students.details.financialContract',
    'students.details.assessmentPlan',
    'students.details.assessments',
    'students.details.profileReviews',
    'students.details.trainingPlans',
    'students.details.integrations',
    'students.details.audit',
  ];
  await prisma.accessPermission.createMany({
    data: [
      {
        collaboratorFunctionId: functionId,
        screenKey: 'students.details',
        blockKey: '',
        canView: true,
      },
      ...studentDetailBlocks.map((blockKey) => ({
        collaboratorFunctionId: functionId,
        screenKey: 'students.details',
        blockKey,
        canView: true,
      })),
      ...[
        '',
        'physicalAssessment.adpt.view',
        'physicalAssessment.adpt.actions.manage',
        'physicalAssessment.adpt.actions.correctCompleted',
      ].map((blockKey) => ({
        collaboratorFunctionId: functionId,
        screenKey: 'physicalAssessment.protocol',
        blockKey,
        canView: true,
      })),
      {
        collaboratorFunctionId: functionId,
        screenKey: 'settings.contract',
        blockKey: '',
        canView: true,
      },
      {
        collaboratorFunctionId: functionId,
        screenKey: 'settings.contract',
        blockKey: 'settings.contract.actions.manageClinicalTechnicalResponsibility',
        canView: true,
      },
      {
        collaboratorFunctionId: functionId,
        screenKey: 'settings.contract',
        blockKey: 'settings.contract.adipometryProtocolApproval',
        canView: true,
      },
    ],
  });

  const actorEmail = `adpt-browser-central-professor-${suffix}@example.invalid`;
  const [actorUser, studentUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: actorEmail,
        passwordHash: 'not-used',
        type: 'professor',
        isActive: true,
        profile: {
          create: {
            name: 'Professora Central ADPT',
            cref: '000249-G/SP',
          },
        },
      },
    }),
    prisma.user.create({
      data: {
        email: `adpt-browser-central-student-${suffix}@example.invalid`,
        passwordHash: 'not-used',
        type: 'aluno',
        isActive: true,
        profile: {
          create: {
            name: 'Aluno Central ADPT',
            birthDate: new Date('2001-08-04T00:00:00.000Z'),
            gender: 'male',
          },
        },
      },
    }),
  ]);
  actorUserId = actorUser.id;
  studentUserId = studentUser.id;

  const professor = await prisma.professor.create({
    data: {
      userId: actorUserId,
      contractId,
      collaboratorFunctionId: functionId,
      role: 'professor',
      currentStatus: 'active',
    },
  });
  actorProfessorId = professor.id;

  const aluno = await prisma.aluno.create({
    data: {
      userId: studentUserId,
      professorId: actorProfessorId,
      contractId,
      status: 'ACTIVE_STUDENT',
      birthDate: new Date('2001-08-04T00:00:00.000Z'),
    },
  });
  alunoId = aluno.id;

  await prisma.studentProfile.create({
    data: {
      alunoId,
      contractId,
      sourceType: 'professional',
      sourceReference: 'issue-249-real-central-integration',
      identificationData: {
        birthDate: '2001-08-04',
        gender: 'male',
      },
    },
  });

  const designated = await adipometryGovernanceService.designate(
    contractId,
    actorUserId,
    actorProfessorId,
    { professorId: actorProfessorId }
  );
  const governedProtocol = designated.protocols.find(
    (item) => item.code === 'GUEDES_1991_ADULT_YOUNG'
  );
  assert(governedProtocol, 'O protocolo Guedes não está disponível para a Central ADPT.');

  await adipometryGovernanceService.approve(
    contractId,
    actorUserId,
    actorProfessorId,
    governedProtocol.code,
    governedProtocol.version,
    {
      approvalStatement:
        'Aprovo esta especificação clínica para a integração real da Central do Aluno na Issue 249.',
      approvedSpecificationHash: governedProtocol.specificationHash,
    }
  );

  return {
    actorEmail,
    protocolCode: governedProtocol.code,
    protocolVersion: governedProtocol.version,
  };
}

async function createOtherTenantAluno(): Promise<void> {
  const contract = await prisma.companyContract.create({
    data: {
      type: 'academy',
      document: `248-browser-other-${suffix}`,
      name: 'Academia ADPT Outro Contrato',
    },
  });
  otherContractId = contract.id;
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: otherContractId,
      name: 'Professor Outro Contrato',
      code: `ADPT-BROWSER-OTHER-${suffix}`,
    },
  });
  otherFunctionId = collaboratorFunction.id;
  const [professorUser, studentUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: `adpt-browser-other-professor-${suffix}@example.invalid`,
        passwordHash: 'not-used',
        type: 'professor',
        isActive: true,
        profile: { create: { name: 'Professor Outro Contrato' } },
      },
    }),
    prisma.user.create({
      data: {
        email: `adpt-browser-other-student-${suffix}@example.invalid`,
        passwordHash: 'not-used',
        type: 'aluno',
        isActive: true,
        profile: { create: { name: 'Aluno Outro Contrato' } },
      },
    }),
  ]);
  otherProfessorUserId = professorUser.id;
  otherStudentUserId = studentUser.id;
  const professor = await prisma.professor.create({
    data: {
      userId: otherProfessorUserId,
      contractId: otherContractId,
      collaboratorFunctionId: otherFunctionId,
      role: 'professor',
      currentStatus: 'active',
    },
  });
  otherProfessorId = professor.id;
  const aluno = await prisma.aluno.create({
    data: {
      userId: otherStudentUserId,
      professorId: otherProfessorId,
      contractId: otherContractId,
      status: 'ACTIVE_STUDENT',
    },
  });
  otherAlunoId = aluno.id;
}

async function createFinalizedAssessment(input: {
  assessmentDate: string;
  weightKg: number;
  tricepsMm: number;
  subscapularMm: number;
  suprailiacMm: number;
  abdominalMm: number;
  thighMm: number;
  protocolCode: string;
  protocolVersion: number;
}) {
  const draft = await adipometryService.createDraft(
    contractId,
    alunoId,
    actorUserId,
    actorProfessorId,
    {
      assessmentDate: input.assessmentDate,
      protocolCode: input.protocolCode,
      protocolVersion: input.protocolVersion,
      protocolSex: 'male',
      protocolSexSource: 'profile',
      measurements: {
        weightKg: input.weightKg,
        tricepsMm: input.tricepsMm,
        subscapularMm: input.subscapularMm,
        suprailiacMm: input.suprailiacMm,
        abdominalMm: input.abdominalMm,
        thighMm: input.thighMm,
      },
    }
  );
  const preview = await adipometryService.calculate(
    contractId,
    draft.id,
    actorUserId
  );
  assert(preview.canFinalize, `A prévia de ${draft.code} não permitiu conclusão.`);
  const finalized = await adipometryService.finalize(
    contractId,
    draft.id,
    actorUserId,
    {
      inputFingerprint: preview.inputFingerprint,
      expectedUpdatedAt: draft.updatedAt,
    }
  );
  return finalized.assessment;
}

async function createPreparedDraft(input: {
  assessmentDate: string;
  protocolCode: string;
  protocolVersion: number;
}) {
  return adipometryService.createDraft(
    contractId,
    alunoId,
    actorUserId,
    actorProfessorId,
    {
      assessmentDate: input.assessmentDate,
      protocolCode: input.protocolCode,
      protocolVersion: input.protocolVersion,
      protocolSex: 'male',
      protocolSexSource: 'profile',
      measurements: {
        weightKg: 77,
        tricepsMm: 11,
        subscapularMm: 13,
        suprailiacMm: 17,
        abdominalMm: 19,
        thighMm: 15,
      },
    }
  );
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
  assert(response.ok && body.data, `Falha ao resolver o usuário da Central: ${JSON.stringify(body.error)}`);
  return body.data;
}

async function cleanup(): Promise<void> {
  if (browser) await browser.close().catch(() => undefined);
  stopProcess(previewProcess);
  stopProcess(apiProcess);
  await new Promise((resolve) => setTimeout(resolve, 500));

  for (const cleanupContractId of [contractId, otherContractId].filter(Boolean)) {
    await prisma.adipometryAuditEvent.deleteMany({ where: { contractId: cleanupContractId } }).catch(() => undefined);
    await prisma.adipometryAssessment.deleteMany({ where: { contractId: cleanupContractId } }).catch(() => undefined);
    await prisma.adipometrySequence.deleteMany({ where: { contractId: cleanupContractId } }).catch(() => undefined);
    await prisma.adipometryProtocolApproval.deleteMany({ where: { contractId: cleanupContractId } }).catch(() => undefined);
    await prisma.adipometryClinicalResponsibility.deleteMany({ where: { contractId: cleanupContractId } }).catch(() => undefined);
    await prisma.studentProfile.deleteMany({ where: { contractId: cleanupContractId } }).catch(() => undefined);
    await prisma.aluno.deleteMany({ where: { contractId: cleanupContractId } }).catch(() => undefined);
  }

  await prisma.professor.deleteMany({
    where: { id: { in: [actorProfessorId, otherProfessorId].filter(Boolean) } },
  }).catch(() => undefined);
  await prisma.accessPermission.deleteMany({
    where: { collaboratorFunctionId: { in: [functionId, otherFunctionId].filter(Boolean) } },
  }).catch(() => undefined);
  await prisma.collaboratorFunctionOption.deleteMany({
    where: { id: { in: [functionId, otherFunctionId].filter(Boolean) } },
  }).catch(() => undefined);
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          actorUserId,
          studentUserId,
          otherProfessorUserId,
          otherStudentUserId,
        ].filter(Boolean),
      },
    },
  }).catch(() => undefined);
  await prisma.companyContract.deleteMany({
    where: { id: { in: [contractId, otherContractId].filter(Boolean) } },
  }).catch(() => undefined);
  await prisma.$disconnect();
}

async function main(): Promise<void> {
  await mkdir(artifactDir, { recursive: true });
  const fixture = await createFixture();
  await createOtherTenantAluno();

  const firstFinalized = await createFinalizedAssessment({
    assessmentDate: '2026-05-01',
    weightKg: 80,
    tricepsMm: 12,
    subscapularMm: 14,
    suprailiacMm: 18,
    abdominalMm: 20,
    thighMm: 16,
    protocolCode: fixture.protocolCode,
    protocolVersion: fixture.protocolVersion,
  });
  const correctionDraft = await adipometryService.startCorrection(
    contractId,
    firstFinalized.id,
    actorUserId,
    'DATA_ENTRY_ERROR',
    'Corrigir a dobra tricipital para validar a revisão vigente na Central do Aluno.'
  );
  const correctedDraft = await adipometryService.updateDraft(
    contractId,
    correctionDraft.id,
    actorUserId,
    {
      measurements: { tricepsMm: 13 },
      expectedUpdatedAt: correctionDraft.updatedAt,
    }
  );
  const correctionPreview = await adipometryService.calculate(
    contractId,
    correctedDraft.id,
    actorUserId
  );
  assert(correctionPreview.canFinalize, 'A revisão corretiva da fixture não pôde ser finalizada.');
  const correctedFinalized = await adipometryService.finalize(
    contractId,
    correctedDraft.id,
    actorUserId,
    {
      inputFingerprint: correctionPreview.inputFingerprint,
      expectedUpdatedAt: correctedDraft.updatedAt,
    }
  );

  const secondFinalized = await createFinalizedAssessment({
    assessmentDate: '2026-08-01',
    weightKg: 78,
    tricepsMm: 11,
    subscapularMm: 13,
    suprailiacMm: 17,
    abdominalMm: 19,
    thighMm: 15,
    protocolCode: fixture.protocolCode,
    protocolVersion: fixture.protocolVersion,
  });
  const pendingDraft = await createPreparedDraft({
    assessmentDate: '2026-08-05',
    protocolCode: fixture.protocolCode,
    protocolVersion: fixture.protocolVersion,
  });

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
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.evaluateOnNewDocument(
    (token, user) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    },
    bearerToken,
    authenticatedUser
  );

  const centralRoute = `/central-do-aluno/${encodeURIComponent(alunoId)}`;
  await page.goto(`${webUrl}${centralRoute}`, { waitUntil: 'networkidle0', timeout: 30_000 });
  await waitForText(page, 'Aluno 360');
  await clickButton(page, 'Fluxo técnico');
  await clickButton(page, 'Avaliação Física');
  await waitForText(page, 'Adipometria e evolução ADPT');
  await waitForText(page, 'Nova adipometria');
  await waitForText(page, 'Iniciar antropometria');
  await waitForText(page, 'Pendências operacionais (1)');
  await page.waitForFunction(
    () => ['ADPT-001', 'ADPT-002'].every((code) => Array.from(
      document.querySelectorAll('label')
    ).some((label) => label.textContent?.includes(code))),
    { timeout: 30_000 }
  );

  await clickLabel(page, 'ADPT-002');
  await clickLabel(page, 'ADPT-001');
  await clickButton(page, 'Comparar avaliações selecionadas');
  await waitForText(page, 'Variação');
  const comparisonTablePresent = await page.$('table') !== null;
  assert(comparisonTablePresent, 'A comparação real da Central não exibiu a tabela acessível.');
  await page.screenshot({
    path: path.join(artifactDir, 'adipometry-central-real-comparison.png'),
    fullPage: true,
  });

  const crossTenantResult = await page.evaluate(
    async ({ endpoint, targetAlunoId }) => {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${endpoint}/api/v1/adipometry/alunos/${targetAlunoId}/assessments`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return { status: response.status, body: await response.json() };
    },
    { endpoint: apiUrl, targetAlunoId: otherAlunoId }
  );
  const crossTenantCode = (
    crossTenantResult.body as {
      error?: { details?: { code?: string } };
      details?: { code?: string };
    }
  ).error?.details?.code
    ?? (crossTenantResult.body as { details?: { code?: string } }).details?.code;
  assert(crossTenantResult.status === 404, `A consulta cross-tenant retornou ${crossTenantResult.status}.`);
  assert(
    crossTenantCode === 'ADIPOMETRY_RESOURCE_NOT_FOUND',
    `A consulta cross-tenant revelou código inesperado: ${String(crossTenantCode)}.`
  );

  const pendingPreview = await adipometryService.calculate(
    contractId,
    pendingDraft.id,
    actorUserId
  );
  assert(pendingPreview.canFinalize, 'O rascunho pendente não ficou pronto para a revalidação.');
  await adipometryService.finalize(
    contractId,
    pendingDraft.id,
    actorUserId,
    {
      inputFingerprint: pendingPreview.inputFingerprint,
      expectedUpdatedAt: pendingDraft.updatedAt,
    }
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(
    () => {
      const latest = document.querySelector('[aria-labelledby="adpt-latest-title"]');
      return latest?.textContent?.includes('ADPT-003')
        && !document.body.innerText.includes('Pendências operacionais (1)');
    },
    { timeout: 30_000 }
  );

  await page.setViewport({ width: 390, height: 844 });
  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  assert(noHorizontalOverflow, 'A Central ADPT apresentou overflow horizontal em 390px.');
  await page.screenshot({
    path: path.join(artifactDir, 'adipometry-central-real-mobile.png'),
    fullPage: true,
  });

  assert(pageErrors.length === 0, `Erros de página na Central: ${pageErrors.join(' | ')}`);
  assert(consoleErrors.length === 0, `Erros de console na Central: ${consoleErrors.join(' | ')}`);

  const currentFirstRevision = await prisma.adipometryAssessment.findFirst({
    where: {
      rootAssessmentId: firstFinalized.rootAssessmentId,
      revisionStatus: 'FINALIZED',
      correctedByAssessmentId: null,
    },
  });
  assert(
    currentFirstRevision?.id === correctedFinalized.assessment.id,
    'A Central não foi preparada com a revisão corretiva vigente esperada.'
  );

  const report = {
    schemaVersion: 1,
    kind: 'issue-249-adipometry-central-real-browser-integration',
    issue: 249,
    route: centralRoute,
    headSha: process.env.AUDIT_HEAD_SHA ?? process.env.GITHUB_SHA ?? null,
    baseSha: process.env.AUDIT_BASE_SHA ?? null,
    mergePreviewSha: process.env.AUDIT_MERGE_PREVIEW_SHA ?? process.env.GITHUB_SHA ?? null,
    protocol: {
      code: fixture.protocolCode,
      version: fixture.protocolVersion,
    },
    revisions: {
      originalAssessmentId: firstFinalized.id,
      currentCorrectedAssessmentId: correctedFinalized.assessment.id,
      secondAssessmentId: secondFinalized.id,
      revalidatedAssessmentId: pendingDraft.id,
    },
    central: {
      anthropometryActionVisible: true,
      adipometryActionVisible: true,
      accessibleComparisonTable: comparisonTablePresent,
      targetedRefreshAfterFinalize: true,
      sameAlunoPreserved: true,
      noHorizontalOverflowAt390: noHorizontalOverflow,
    },
    privacy: {
      crossTenantAlunoId: otherAlunoId,
      status: crossTenantResult.status,
      code: crossTenantCode,
    },
    screenshots: [
      'adipometry-central-real-comparison.png',
      'adipometry-central-real-mobile.png',
    ],
    browserErrors: pageErrors,
    consoleErrors,
    generatedAt: new Date().toISOString(),
  };

  await writeFile(
    path.join(artifactDir, 'adipometry-central-browser-integration.json'),
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
