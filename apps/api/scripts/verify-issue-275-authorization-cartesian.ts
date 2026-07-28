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
const apiUrl = 'http://127.0.0.1:3010';
const jwtSecret = 'issue-275-authorization-cartesian-secret';
const prisma = new PrismaClient();
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const createdContractIds: string[] = [];
const createdUserIds: string[] = [];
let apiProcess: ChildProcess | undefined;

type Actor = {
  user: { id: string; email: string; type: 'professor' | 'aluno' };
  professorId?: string;
  contractId: string;
};

type ProfileName =
  | 'administrador'
  | 'comercial'
  | 'profissional-clinico'
  | 'somente-leitura'
  | 'aluno-vinculado'
  | 'autenticado-sem-vinculo'
  | 'visitante-com-token'
  | 'outro-tenant';

type ActionName =
  | 'listagem'
  | 'consulta'
  | 'edicao-comercial'
  | 'convite'
  | 'revisao'
  | 'conversao'
  | 'status-saude'
  | 'conteudo-anamnese'
  | 'conteudo-parq'
  | 'anamnese-propria'
  | 'parq-proprio'
  | 'prnt'
  | 'auditoria'
  | 'convite-publico';

type ApiResult = {
  status: number;
  body: Record<string, unknown>;
};

type MatrixEntry = {
  profile: ProfileName;
  action: ActionName;
  status: number;
  expectedStatuses: number[];
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

async function waitForApi(timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if ((await fetch(`${apiUrl}/health`)).ok) return;
    } catch {
      // API ainda iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('API da matriz cartesiana não iniciou');
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
  options: {
    token?: string;
    method?: 'GET' | 'POST' | 'PATCH';
    body?: unknown;
  } = {}
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
  return { status: response.status, body };
}

async function createContract(label: string) {
  const contract = await prisma.companyContract.create({
    data: {
      type: 'academy',
      document: `275-cartesian-${label}-${suffix}`,
      name: `Academia Cartesiana ${label}`,
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
      email: `issue-275-cartesian-${params.label}-${suffix}@example.test`,
      passwordHash: 'not-used',
      type,
      profile: { create: { name: `Ator ${params.label}` } },
    },
  });
  createdUserIds.push(user.id);
  if (type === 'aluno') {
    return { user, contractId: params.contractId } satisfies Actor;
  }
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: params.contractId,
      name: `Função ${params.label}`,
      code: `issue-275-cartesian-${params.label}-${suffix}`,
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
    contractId: params.contractId,
  } satisfies Actor;
}

function expectedStatuses(profile: ProfileName, action: ActionName): number[] {
  if (action === 'convite-publico') return [200];
  if (profile === 'visitante-com-token') return [401];
  if (action === 'listagem' && profile === 'outro-tenant') return [200];
  if (profile === 'outro-tenant') return [404];

  const professionalRead = new Set<ProfileName>([
    'administrador',
    'comercial',
    'profissional-clinico',
    'somente-leitura',
  ]);
  if (action === 'listagem' || action === 'consulta' || action === 'status-saude') {
    return professionalRead.has(profile) ? [200] : [403, 404];
  }
  if (action === 'edicao-comercial' || action === 'convite') {
    return profile === 'administrador' || profile === 'comercial'
      ? action === 'convite'
        ? [201]
        : [200]
      : [403, 404];
  }
  if (action === 'revisao') {
    return profile === 'administrador' || profile === 'profissional-clinico'
      ? [200]
      : [403, 404];
  }
  if (action === 'conversao') {
    return profile === 'administrador' ? [400, 409, 422] : [403, 404];
  }
  if (action === 'conteudo-anamnese' || action === 'conteudo-parq' || action === 'prnt') {
    return profile === 'administrador' || profile === 'profissional-clinico'
      ? [200]
      : [403, 404];
  }
  if (action === 'anamnese-propria' || action === 'parq-proprio') {
    return profile === 'aluno-vinculado' ? [200] : [403, 404];
  }
  if (action === 'auditoria') return [404];
  return [500];
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
  const [tenantA, tenantB] = await Promise.all([createContract('a'), createContract('b')]);
  const [
    master,
    commercial,
    clinical,
    readOnly,
    otherTenant,
    linkedStudent,
    unlinkedStudent,
  ] = await Promise.all([
    createActor({ label: 'master', contractId: tenantA.id, master: true }),
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
      label: 'clinical',
      contractId: tenantA.id,
      screens: ['students.preRegistration', 'physicalAssessment.protocol'],
      blocks: [
        'students.preRegistration.review',
        'physicalAssessment.prnt.summary',
        'physicalAssessment.prnt.parqSubmissions',
      ],
    }),
    createActor({
      label: 'read-only',
      contractId: tenantA.id,
      screens: ['students.preRegistration'],
    }),
    createActor({ label: 'other-tenant', contractId: tenantB.id, master: true }),
    createActor({ label: 'linked-student', contractId: tenantA.id, type: 'aluno' }),
    createActor({ label: 'unlinked-student', contractId: tenantA.id, type: 'aluno' }),
  ]);
  assert(master.professorId, 'Administrador sem professor');
  const adminActor = {
    userId: master.user.id,
    professorId: master.professorId,
    contractId: tenantA.id,
  };

  const targetId = await preRegistrationEnrollmentCreateService.create(adminActor, {
    name: 'Lead Matriz Cartesiana',
    phone: '15971000001',
    email: `target-${suffix}@example.test`,
    origin: 'issue-275-cartesian',
    responsibleProfessorId: master.professorId,
  });
  const publicLeadId = await preRegistrationEnrollmentCreateService.create(adminActor, {
    name: 'Lead Público Cartesiano',
    phone: '15971000002',
    origin: 'issue-275-cartesian-public',
    responsibleProfessorId: master.professorId,
  });
  const publicInvite = await preRegistrationInviteAdminService.generateFirstInvite(
    publicLeadId,
    tenantA.id,
    adminActor
  );

  const healthAluno = await prisma.aluno.create({
    data: {
      contractId: tenantA.id,
      userId: linkedStudent.user.id,
      status: 'PRE_REGISTRATION_COMPLETED',
      leadName: 'Aluno Clínico Cartesiano',
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
      name: 'Aluno Clínico Cartesiano',
      birthDate: '1990-05-10',
      cpf: '52998224725',
      phone: '15971000003',
    },
    { sourceType: 'student', sourceReference: 'issue_275_authorization_cartesian' }
  );

  apiProcess = spawn('pnpm', ['--filter', '@corrida/api', 'exec', 'tsx', 'src/main.ts'], {
    cwd: repoRoot,
    detached: true,
    env: {
      ...process.env,
      PORT: '3010',
      API_PORT: '3010',
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
  await waitForApi();

  const profiles: Record<ProfileName, { token?: string }> = {
    administrador: { token: tokenFor(master) },
    comercial: { token: tokenFor(commercial) },
    'profissional-clinico': { token: tokenFor(clinical) },
    'somente-leitura': { token: tokenFor(readOnly) },
    'aluno-vinculado': { token: tokenFor(linkedStudent) },
    'autenticado-sem-vinculo': { token: tokenFor(unlinkedStudent) },
    'visitante-com-token': {},
    'outro-tenant': { token: tokenFor(otherTenant) },
  };

  const actions: Record<
    ActionName,
    (profile: ProfileName, token?: string) => Promise<ApiResult>
  > = {
    listagem: (_profile, token) =>
      request('/pre-registration-admin/leads?page=1&pageSize=20', { token }),
    consulta: (_profile, token) =>
      request(`/pre-registration-admin/leads/${targetId}`, { token }),
    'edicao-comercial': (profile, token) =>
      request(`/pre-registration-admin/leads/${targetId}`, {
        token,
        method: 'PATCH',
        body: { commercialNotes: `cartesian-${profile}` },
      }),
    convite: (_profile, token) =>
      request(`/pre-registration-admin/leads/${targetId}/invites`, {
        token,
        method: 'POST',
        body: {},
      }),
    revisao: (_profile, token) =>
      request(`/pre-registration-admin/leads/${targetId}/enrollment-review`, { token }),
    conversao: (_profile, token) =>
      request(`/pre-registration-admin/leads/${targetId}/convert`, {
        token,
        method: 'POST',
        body: { confirmationAccepted: true, expectedVersion: -1, fingerprint: 'stale' },
      }),
    'status-saude': (_profile, token) =>
      request(`/pre-registration-admin/leads/${healthAluno.id}`, { token }),
    'conteudo-anamnese': (_profile, token) =>
      request(`/prontuario/alunos/${healthAluno.id}`, { token }),
    'conteudo-parq': (_profile, token) =>
      request(`/prontuario/alunos/${healthAluno.id}/parq-submissions`, { token }),
    'anamnese-propria': (_profile, token) =>
      request(`/pre-registration/processes/${healthAluno.id}/health-intake`, { token }),
    'parq-proprio': (_profile, token) =>
      request(`/pre-registration/processes/${healthAluno.id}/parq`, { token }),
    prnt: (_profile, token) =>
      request(`/prontuario/alunos/${healthAluno.id}`, { token }),
    auditoria: (_profile, token) =>
      request(`/pre-registration-admin/leads/${targetId}/audit`, { token }),
    'convite-publico': () => request(`/pre-cadastro/${publicInvite.token}`),
  };

  const entries: MatrixEntry[] = [];
  for (const profile of Object.keys(profiles) as ProfileName[]) {
    for (const action of Object.keys(actions) as ActionName[]) {
      const result = await actions[action](profile, profiles[profile].token);
      const expected = expectedStatuses(profile, action);
      const passed = expected.includes(result.status);
      entries.push({ profile, action, status: result.status, expectedStatuses: expected, passed });
      assert(
        passed,
        `${profile}/${action}: esperado ${expected.join('|')}, recebido ${result.status}`
      );
      if (profile === 'outro-tenant' && action === 'listagem') {
        assert(
          !JSON.stringify(result.body).includes(targetId),
          'Listagem de outro tenant revelou o registro alvo'
        );
      }
      if (action === 'convite-publico') {
        const serialized = JSON.stringify(result.body);
        assert(!serialized.includes('passwordHash'), 'Convite público expôs passwordHash');
        assert(!serialized.includes('cpf'), 'Convite público expôs CPF');
      }
    }
  }

  const expectedEntryCount = Object.keys(profiles).length * Object.keys(actions).length;
  assert(entries.length === expectedEntryCount, 'Matriz cartesiana incompleta');
  assert(entries.every((entry) => entry.passed), 'Matriz cartesiana contém divergências');
  const activeInvites = await prisma.preRegistrationInvite.count({
    where: { alunoId: targetId, status: 'ACTIVE' },
  });
  assert(activeInvites === 1, 'Matriz deixou mais de um convite ativo');
  const targetProfile = await prisma.studentProfile.findUniqueOrThrow({ where: { alunoId: targetId } });
  const serializedIdentity = JSON.stringify(targetProfile.identificationData);
  for (const deniedProfile of [
    'profissional-clinico',
    'somente-leitura',
    'aluno-vinculado',
    'autenticado-sem-vinculo',
    'visitante-com-token',
    'outro-tenant',
  ]) {
    assert(
      !serializedIdentity.includes(`cartesian-${deniedProfile}`),
      `Negação de ${deniedProfile} persistiu alteração comercial`
    );
  }
  const tenantScopedAudit = await prisma.studentLifecycleEvent.count({
    where: { alunoId: targetId, contractId: tenantA.id },
  });
  const foreignAudit = await prisma.studentLifecycleEvent.count({
    where: { alunoId: targetId, contractId: { not: tenantA.id } },
  });
  assert(tenantScopedAudit > 0, 'Matriz não produziu auditoria tenant-scoped');
  assert(foreignAudit === 0, 'Auditoria vazou para outro tenant');

  const report = {
    schemaVersion: 1,
    kind: 'issue-275-authorization-cartesian',
    profiles: Object.keys(profiles),
    actions: Object.keys(actions),
    expectedEntryCount,
    entries,
    deniedWritesPersisted: false,
    activeInviteCount: activeInvites,
    tenantScopedAuditEvents: tenantScopedAudit,
    foreignAuditEvents: foreignAudit,
  };
  await writeFile(
    path.join(artifactDir, 'authorization-cartesian.json'),
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
