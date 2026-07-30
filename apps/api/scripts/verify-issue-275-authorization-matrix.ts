import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { replaceAccessPermissionsForFunction } from '../src/modules/access-control/access-control.service.js';
import { preRegistrationEnrollmentCreateService } from '../src/modules/pre-registration-enrollment/pre-registration-enrollment-create.service.js';
import { preRegistrationInviteAdminService } from '../src/modules/pre-registration-invites/pre-registration-invite-admin.service.js';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const artifactDir = path.join(repoRoot, 'artifacts', 'issue-275');
const apiUrl = 'http://127.0.0.1:3005';
const jwtSecret = 'issue-275-authorization-matrix-secret';
const prisma = new PrismaClient();
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const createdContractIds: string[] = [];
const createdUserIds: string[] = [];
let apiProcess: ChildProcess | undefined;

type Actor = {
  user: { id: string; email: string; type: 'professor' | 'aluno' };
  professorId?: string;
  functionId?: string;
  contractId: string;
};

type ApiResult = {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
};

type MatrixEntry = {
  role: string;
  action: string;
  expected: string;
  observed: number;
  passed: boolean;
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

async function waitForUrl(url: string, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`API não respondeu em ${url}`);
}

function tokenFor(actor: Actor) {
  return jwt.sign(
    { userId: actor.user.id, email: actor.user.email, type: actor.user.type },
    jwtSecret,
    { expiresIn: '1h' }
  );
}

async function request(
  pathname: string,
  options: { token?: string; method?: 'GET' | 'POST' | 'PATCH'; body?: unknown } = {}
): Promise<ApiResult> {
  const response = await fetch(`${apiUrl}/api/v1${pathname}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { nonJson: true };
  }
  return {
    status: response.status,
    body,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

function record(
  matrix: MatrixEntry[],
  role: string,
  action: string,
  result: ApiResult,
  predicate: (status: number) => boolean,
  expected: string
) {
  const passed = predicate(result.status);
  matrix.push({ role, action, expected, observed: result.status, passed });
  assert(passed, `${role}/${action}: esperado ${expected}, recebido ${result.status}`);
}

function hiddenShape(result: ApiResult) {
  const details = result.body.details;
  return JSON.stringify({
    status: result.status,
    success: result.body.success,
    error: result.body.error,
    code:
      details && typeof details === 'object' && !Array.isArray(details)
        ? (details as Record<string, unknown>).code
        : result.body.code,
  });
}

async function createContract(label: string) {
  const contract = await prisma.companyContract.create({
    data: {
      type: 'academy',
      document: `275-auth-${label}-${suffix}`,
      name: `Academia Autorização ${label}`,
    },
  });
  createdContractIds.push(contract.id);
  return contract;
}

async function createActor(params: {
  label: string;
  contractId: string;
  type?: 'professor' | 'aluno';
  master?: boolean;
  screens?: string[];
  blocks?: string[];
}) {
  const type = params.type ?? 'professor';
  const user = await prisma.user.create({
    data: {
      email: `issue-275-auth-${params.label}-${suffix}@example.test`,
      passwordHash: 'not-used',
      type,
      profile: { create: { name: `Ator ${params.label}` } },
    },
  });
  createdUserIds.push(user.id);
  if (type === 'aluno') return { user, contractId: params.contractId } satisfies Actor;

  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: params.contractId,
      name: `Função ${params.label}`,
      code: `issue-275-${params.label}-${suffix}`,
      isActive: true,
    },
  });
  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId: params.contractId,
      collaboratorFunctionId: collaboratorFunction.id,
      role: params.master ? 'master' : 'professor',
    },
  });
  if (!params.master) {
    await replaceAccessPermissionsForFunction(
      collaboratorFunction.id,
      collaboratorFunction.code,
      {
        screens: params.screens ?? [],
        blocks: params.blocks ?? [],
        dataScopes: { 'students.preRegistration': 'contract' },
      }
    );
  }
  return {
    user,
    professorId: professor.id,
    functionId: collaboratorFunction.id,
    contractId: params.contractId,
  } satisfies Actor;
}

async function cleanup() {
  stopProcess(apiProcess);
  await new Promise((resolve) => setTimeout(resolve, 300));
  for (const contractId of [...createdContractIds].reverse()) {
    await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
  }
  for (const userId of [...createdUserIds].reverse()) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
}

async function main() {
  await mkdir(artifactDir, { recursive: true });
  const [tenantA, tenantB] = await Promise.all([
    createContract('a'),
    createContract('b'),
  ]);

  const [master, noScreen, readOnly, commercial, reviewer, otherTenantMaster, linkedStudent, unlinkedStudent] =
    await Promise.all([
      createActor({ label: 'master', contractId: tenantA.id, master: true }),
      createActor({ label: 'no-screen', contractId: tenantA.id }),
      createActor({
        label: 'read-only',
        contractId: tenantA.id,
        screens: ['students.preRegistration'],
      }),
      createActor({
        label: 'commercial',
        contractId: tenantA.id,
        screens: ['students.preRegistration'],
        blocks: [
          'students.preRegistration.create',
          'students.preRegistration.editCommercial',
          'students.preRegistration.generateInvite',
          'students.preRegistration.revokeInvite',
        ],
      }),
      createActor({
        label: 'reviewer',
        contractId: tenantA.id,
        screens: ['students.preRegistration'],
        blocks: ['students.preRegistration.review', 'students.preRegistration.convert'],
      }),
      createActor({ label: 'other-master', contractId: tenantB.id, master: true }),
      createActor({ label: 'linked-student', contractId: tenantA.id, type: 'aluno' }),
      createActor({ label: 'unlinked-student', contractId: tenantA.id, type: 'aluno' }),
    ]);

  assert(master.professorId, 'Ator master sem professor');
  const masterActor = {
    userId: master.user.id,
    professorId: master.professorId,
    contractId: tenantA.id,
  };
  const targetId = await preRegistrationEnrollmentCreateService.create(masterActor, {
    name: 'Lead Matriz Autorização',
    phone: '15920000001',
    email: `issue-275-target-${suffix}@example.test`,
    origin: 'issue-275-authorization-matrix',
    responsibleProfessorId: master.professorId,
  });
  const publicLeadId = await preRegistrationEnrollmentCreateService.create(masterActor, {
    name: 'Lead Público Matriz',
    phone: '15920000002',
    origin: 'issue-275-public-token',
    responsibleProfessorId: master.professorId,
  });
  const publicInvite = await preRegistrationInviteAdminService.generateFirstInvite(
    publicLeadId,
    tenantA.id,
    masterActor
  );

  const healthAluno = await prisma.aluno.create({
    data: {
      contractId: tenantA.id,
      userId: linkedStudent.user.id,
      status: 'PRE_REGISTRATION_COMPLETED',
      leadName: 'Aluno Vinculado Matriz',
      birthDate: new Date('1990-05-10T00:00:00.000Z'),
      onboarding: {
        create: {
          contractId: tenantA.id,
          claimedByUserId: linkedStudent.user.id,
          claimedAt: new Date(),
          claimRole: 'STUDENT',
          currentStep: 'PRIVACY',
          privacyNoticeVersion: '2026-07',
          privacyAcceptedAt: new Date(),
          completedAt: new Date(),
        },
      },
    },
  });
  await upsertStudentIdentity(
    healthAluno.id,
    tenantA.id,
    {
      name: 'Aluno Vinculado Matriz',
      birthDate: '1990-05-10',
      cpf: '52998224725',
      phone: '15920000003',
    },
    { sourceType: 'student', sourceReference: 'issue_275_authorization_matrix' }
  );

  apiProcess = spawn('pnpm', ['--filter', '@corrida/api', 'exec', 'tsx', 'src/main.ts'], {
    cwd: repoRoot,
    detached: true,
    env: {
      ...process.env,
      PORT: '3005',
      API_PORT: '3005',
      NODE_ENV: 'test',
      JWT_SECRET: jwtSecret,
      FRONTEND_URL: 'http://127.0.0.1:4173',
      CORS_ORIGINS: 'http://127.0.0.1:4173',
      PRE_REGISTRATION_ENABLED: 'true',
      PRE_REGISTRATION_TELEMETRY_ENABLED: 'false',
      PRIVACY_NOTICE_URL: 'https://example.test/privacidade',
      PRIVACY_NOTICE_VERSION: '2026-07',
      HEALTH_PRIVACY_NOTICE_VERSION: '2026-07',
    },
    stdio: 'inherit',
  });
  await waitForUrl(`${apiUrl}/health`);

  const tokens = {
    master: tokenFor(master),
    noScreen: tokenFor(noScreen),
    readOnly: tokenFor(readOnly),
    commercial: tokenFor(commercial),
    reviewer: tokenFor(reviewer),
    otherTenantMaster: tokenFor(otherTenantMaster),
    linkedStudent: tokenFor(linkedStudent),
    unlinkedStudent: tokenFor(unlinkedStudent),
  };
  const matrix: MatrixEntry[] = [];

  record(matrix, 'visitante', 'listagem administrativa', await request('/pre-registration-admin/leads'), (s) => s === 401, '401');
  record(matrix, 'aluno vinculado', 'listagem administrativa', await request('/pre-registration-admin/leads', { token: tokens.linkedStudent }), (s) => s === 403, '403');
  record(matrix, 'profissional sem tela', 'listagem administrativa', await request('/pre-registration-admin/leads', { token: tokens.noScreen }), (s) => s === 403, '403');
  record(matrix, 'somente leitura', 'listagem administrativa', await request('/pre-registration-admin/leads', { token: tokens.readOnly }), (s) => s === 200, '200');
  record(matrix, 'somente leitura', 'consulta administrativa', await request(`/pre-registration-admin/leads/${targetId}`, { token: tokens.readOnly }), (s) => s === 200, '200');
  record(matrix, 'somente leitura', 'criação', await request('/pre-registration-admin/leads', {
    token: tokens.readOnly,
    method: 'POST',
    body: { name: 'Negado', phone: '15929999999', origin: 'matrix' },
  }), (s) => s === 403, '403');
  record(matrix, 'somente leitura', 'revisão', await request(`/pre-registration-admin/leads/${targetId}/enrollment-review`, { token: tokens.readOnly }), (s) => s === 403, '403');

  const commercialCreate = await request('/pre-registration-admin/leads', {
    token: tokens.commercial,
    method: 'POST',
    body: { name: 'Lead Comercial Permitido', phone: '15920000004', origin: 'matrix-commercial' },
  });
  record(matrix, 'comercial', 'criação', commercialCreate, (s) => s === 201, '201');
  record(matrix, 'comercial', 'convite', await request(`/pre-registration-admin/leads/${targetId}/invites`, {
    token: tokens.commercial,
    method: 'POST',
    body: {},
  }), (s) => s === 201, '201');
  record(matrix, 'comercial', 'revisão clínica/comercial final', await request(`/pre-registration-admin/leads/${targetId}/enrollment-review`, { token: tokens.commercial }), (s) => s === 403, '403');

  record(matrix, 'revisor profissional', 'consulta de revisão', await request(`/pre-registration-admin/leads/${targetId}/enrollment-review`, { token: tokens.reviewer }), (s) => s === 200, '200');
  record(matrix, 'revisor profissional', 'criação', await request('/pre-registration-admin/leads', {
    token: tokens.reviewer,
    method: 'POST',
    body: { name: 'Negado Revisor', phone: '15928888888', origin: 'matrix-reviewer' },
  }), (s) => s === 403, '403');
  record(matrix, 'revisor profissional', 'conversão autorizada porém estado inválido', await request(`/pre-registration-admin/leads/${targetId}/convert`, {
    token: tokens.reviewer,
    method: 'POST',
    body: { confirmationAccepted: true, expectedVersion: 1, fingerprint: 'stale' },
  }), (s) => s !== 401 && s !== 403, 'não 401/403');

  record(matrix, 'administrador', 'listagem', await request('/pre-registration-admin/leads', { token: tokens.master }), (s) => s === 200, '200');
  record(matrix, 'administrador', 'consulta de revisão', await request(`/pre-registration-admin/leads/${targetId}/enrollment-review`, { token: tokens.master }), (s) => s === 200, '200');

  const otherTenant = await request(`/pre-registration-admin/leads/${targetId}`, { token: tokens.otherTenantMaster });
  const nonexistent = await request(`/pre-registration-admin/leads/not-found-${suffix}`, { token: tokens.otherTenantMaster });
  record(matrix, 'outro tenant', 'consulta de registro alheio', otherTenant, (s) => s === 404, '404');
  assert(hiddenShape(otherTenant) === hiddenShape(nonexistent), 'Cross-tenant revelou existência por formato de resposta');

  const linkedHealth = await request(`/pre-registration/processes/${healthAluno.id}/health-intake`, { token: tokens.linkedStudent });
  const unlinkedHealth = await request(`/pre-registration/processes/${healthAluno.id}/health-intake`, { token: tokens.unlinkedStudent });
  const missingHealth = await request(`/pre-registration/processes/not-found-${suffix}/health-intake`, { token: tokens.unlinkedStudent });
  record(matrix, 'aluno vinculado', 'conteúdo clínico próprio', linkedHealth, (s) => s === 200, '200');
  record(matrix, 'autenticado sem vínculo', 'conteúdo clínico alheio', unlinkedHealth, (s) => s === 404, '404');
  assert(hiddenShape(unlinkedHealth) === hiddenShape(missingHealth), 'Usuário sem vínculo obteve oráculo de existência clínica');

  const publicResponse = await request(`/pre-cadastro/${publicInvite.token}`);
  record(matrix, 'visitante com token', 'abertura pública permitida', publicResponse, (s) => s === 200, '200');
  const publicSerialized = JSON.stringify(publicResponse.body);
  assert(!publicSerialized.includes('cpf') && !publicSerialized.includes('passwordHash'), 'Resposta pública expôs dados internos');

  const deniedCreated = await prisma.aluno.count({
    where: { contractId: tenantA.id, leadName: { in: ['Negado', 'Negado Revisor'] } },
  });
  assert(deniedCreated === 0, 'Negação de permissão persistiu criação parcial');

  const report = {
    schemaVersion: 1,
    kind: 'issue-275-authorization-matrix',
    entries: matrix,
    crossTenantIndistinguishable: true,
    unlinkedClinicalIndistinguishable: true,
    deniedWritesPersisted: deniedCreated,
  };
  assert(matrix.every((entry) => entry.passed), 'Matriz contém negação ou permissão divergente');
  await writeFile(
    path.join(artifactDir, 'authorization-matrix.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch(() => undefined);
    await prisma.$disconnect();
    process.exit(1);
  });
