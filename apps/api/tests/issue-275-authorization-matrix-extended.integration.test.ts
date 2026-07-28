import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { replaceAccessPermissionsForFunction } from '../src/modules/access-control/access-control.service.js';
import { preRegistrationEnrollmentCreateService } from '../src/modules/pre-registration-enrollment/pre-registration-enrollment-create.service.js';
import { upsertStudentIdentity } from '../src/modules/alunos/student-identity.service.js';

type Actor = {
  user: { id: string; email: string; type: 'professor' | 'aluno' };
  professorId?: string;
  contractId: string;
};

type ApiResult = {
  status: number;
  body: Record<string, unknown>;
};

const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseTests ? describe : describe.skip;
const prisma = new PrismaClient();
const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const apiUrl = 'http://127.0.0.1:3008';
const jwtSecret = 'issue-275-extended-authorization-secret';
const createdContractIds: string[] = [];
const createdUserIds: string[] = [];
let apiProcess: ChildProcess | undefined;

jest.setTimeout(120_000);

function stopProcess(child?: ChildProcess) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

async function waitForApi() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (response.ok) return;
    } catch {
      // API still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('API da matriz estendida não iniciou');
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
  return { status: response.status, body };
}

async function createContract(label: string) {
  const contract = await prisma.companyContract.create({
    data: {
      type: 'academy',
      document: `275-ext-${label}-${suffix}`,
      name: `Academia Matriz Estendida ${label}`,
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
      email: `issue-275-ext-${params.label}-${suffix}@example.test`,
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
      code: `issue-275-ext-${params.label}-${suffix}`,
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

describeDatabase('issue 275 extended API authorization matrix', () => {
  let targetId: string;
  let healthAlunoId: string;
  let tokens: Record<string, string>;
  let tenantAId: string;

  beforeAll(async () => {
    const [tenantA, tenantB] = await Promise.all([
      createContract('a'),
      createContract('b'),
    ]);
    tenantAId = tenantA.id;

    const [master, readOnly, commercial, reviewer, clinical, otherTenantMaster, linkedStudent, unlinkedStudent] =
      await Promise.all([
        createActor({ label: 'master', contractId: tenantA.id, master: true }),
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
        createActor({ label: 'other-tenant-master', contractId: tenantB.id, master: true }),
        createActor({ label: 'linked-student', contractId: tenantA.id, type: 'aluno' }),
        createActor({ label: 'unlinked-student', contractId: tenantA.id, type: 'aluno' }),
      ]);

    if (!master.professorId) throw new Error('Administrador sem professor');
    targetId = await preRegistrationEnrollmentCreateService.create(
      {
        userId: master.user.id,
        professorId: master.professorId,
        contractId: tenantA.id,
      },
      {
        name: 'Lead Matriz Estendida',
        phone: '15940000001',
        email: `issue-275-ext-target-${suffix}@example.test`,
        origin: 'issue-275-extended-matrix',
        responsibleProfessorId: master.professorId,
      }
    );

    healthAlunoId = (
      await prisma.aluno.create({
        data: {
          contractId: tenantA.id,
          userId: linkedStudent.user.id,
          status: 'PRE_REGISTRATION_COMPLETED',
          leadName: 'Aluno Clínico Matriz Estendida',
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
      })
    ).id;
    await upsertStudentIdentity(
      healthAlunoId,
      tenantA.id,
      {
        name: 'Aluno Clínico Matriz Estendida',
        birthDate: '1990-05-10',
        cpf: '11144477735',
        phone: '15940000002',
      },
      { sourceType: 'student', sourceReference: 'issue_275_extended_matrix' }
    );

    tokens = {
      master: tokenFor(master),
      readOnly: tokenFor(readOnly),
      commercial: tokenFor(commercial),
      reviewer: tokenFor(reviewer),
      clinical: tokenFor(clinical),
      otherTenantMaster: tokenFor(otherTenantMaster),
      linkedStudent: tokenFor(linkedStudent),
      unlinkedStudent: tokenFor(unlinkedStudent),
    };

    apiProcess = spawn('pnpm', ['--filter', '@corrida/api', 'exec', 'tsx', 'src/main.ts'], {
      cwd: process.cwd(),
      detached: true,
      env: {
        ...process.env,
        PORT: '3008',
        API_PORT: '3008',
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
  });

  afterAll(async () => {
    stopProcess(apiProcess);
    await new Promise((resolve) => setTimeout(resolve, 300));
    for (const contractId of [...createdContractIds].reverse()) {
      await prisma.companyContract.delete({ where: { id: contractId } }).catch(() => undefined);
    }
    for (const userId of [...createdUserIds].reverse()) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('enforces commercial edit, invite, revoke, review and conversion blocks', async () => {
    expect(
      await request(`/pre-registration-admin/leads/${targetId}`, {
        token: tokens.readOnly,
        method: 'PATCH',
        body: { commercialNotes: 'não deve persistir' },
      })
    ).toMatchObject({ status: 403 });
    expect(
      await request(`/pre-registration-admin/leads/${targetId}/invites`, {
        token: tokens.readOnly,
        method: 'POST',
        body: {},
      })
    ).toMatchObject({ status: 403 });
    expect(
      await request(`/pre-registration-admin/leads/${targetId}/convert`, {
        token: tokens.readOnly,
        method: 'POST',
        body: { confirmationAccepted: true, expectedVersion: 1, fingerprint: 'stale' },
      })
    ).toMatchObject({ status: 403 });

    expect(
      await request(`/pre-registration-admin/leads/${targetId}`, {
        token: tokens.commercial,
        method: 'PATCH',
        body: { commercialNotes: 'contato comercial validado' },
      })
    ).toMatchObject({ status: 200 });
    expect(
      await request(`/pre-registration-admin/leads/${targetId}/invites`, {
        token: tokens.commercial,
        method: 'POST',
        body: {},
      })
    ).toMatchObject({ status: 201 });
    expect(
      await request(`/pre-registration-admin/leads/${targetId}/invites/revoke`, {
        token: tokens.commercial,
        method: 'POST',
        body: { reason: 'matriz estendida' },
      })
    ).toMatchObject({ status: 200 });
    expect(
      await request(`/pre-registration-admin/leads/${targetId}/enrollment-review`, {
        token: tokens.commercial,
      })
    ).toMatchObject({ status: 403 });
    expect(
      await request(`/pre-registration-admin/leads/${targetId}/convert`, {
        token: tokens.commercial,
        method: 'POST',
        body: { confirmationAccepted: true, expectedVersion: 1, fingerprint: 'stale' },
      })
    ).toMatchObject({ status: 403 });

    expect(
      await request(`/pre-registration-admin/leads/${targetId}`, {
        token: tokens.reviewer,
        method: 'PATCH',
        body: { commercialNotes: 'não deve persistir pelo revisor' },
      })
    ).toMatchObject({ status: 403 });
    expect(
      await request(`/pre-registration-admin/leads/${targetId}/invites`, {
        token: tokens.reviewer,
        method: 'POST',
        body: {},
      })
    ).toMatchObject({ status: 403 });
    expect(
      await request(`/pre-registration-admin/leads/${targetId}/enrollment-review`, {
        token: tokens.reviewer,
      })
    ).toMatchObject({ status: 200 });
    const conversion = await request(`/pre-registration-admin/leads/${targetId}/convert`, {
      token: tokens.reviewer,
      method: 'POST',
      body: { confirmationAccepted: true, expectedVersion: 1, fingerprint: 'stale' },
    });
    expect(conversion.status).not.toBe(401);
    expect(conversion.status).not.toBe(403);

    const profile = await prisma.studentProfile.findUniqueOrThrow({ where: { alunoId: targetId } });
    expect(
      (profile.identificationData as { _leadCommercial?: { notes?: string } })._leadCommercial
        ?.notes
    ).toBe('contato comercial validado');
  });

  it('separates status summaries, clinical content and PRNT by role and tenant', async () => {
    const status = await request(`/pre-registration-admin/leads/${healthAlunoId}`, {
      token: tokens.readOnly,
    });
    expect(status.status).toBe(200);
    const data = status.body.data as {
      progress?: { healthModuleStatus?: string; parqModuleStatus?: string };
    };
    expect(data.progress).toMatchObject({
      healthModuleStatus: 'NOT_STARTED',
      parqModuleStatus: 'NOT_STARTED',
    });

    expect(
      await request(`/pre-registration/processes/${healthAlunoId}/health-intake`, {
        token: tokens.linkedStudent,
      })
    ).toMatchObject({ status: 200 });
    expect(
      await request(`/pre-registration/processes/${healthAlunoId}/parq`, {
        token: tokens.linkedStudent,
      })
    ).toMatchObject({ status: 200 });
    expect(
      await request(`/pre-registration/processes/${healthAlunoId}/health-intake`, {
        token: tokens.unlinkedStudent,
      })
    ).toMatchObject({ status: 404 });
    expect(
      await request(`/pre-registration/processes/${healthAlunoId}/parq`, {
        token: tokens.unlinkedStudent,
      })
    ).toMatchObject({ status: 404 });

    expect(
      await request(`/prontuario/alunos/${healthAlunoId}`, { token: tokens.clinical })
    ).toMatchObject({ status: 200 });
    expect(
      await request(`/prontuario/alunos/${healthAlunoId}/parq-submissions`, {
        token: tokens.clinical,
      })
    ).toMatchObject({ status: 200 });
    expect(
      await request(`/prontuario/alunos/${healthAlunoId}`, { token: tokens.commercial })
    ).toMatchObject({ status: 403 });
    expect(
      await request(`/prontuario/alunos/${healthAlunoId}`, { token: tokens.readOnly })
    ).toMatchObject({ status: 403 });
    expect(
      await request(`/prontuario/alunos/${healthAlunoId}`, {
        token: tokens.otherTenantMaster,
      })
    ).toMatchObject({ status: 404 });
  });

  it('keeps audit records tenant scoped and does not expose an undocumented audit endpoint', async () => {
    expect(
      await request(`/pre-registration-admin/leads/${targetId}/audit`, { token: tokens.master })
    ).toMatchObject({ status: 404 });
    expect(
      await request(`/pre-registration-admin/leads/${targetId}/audit`, {
        token: tokens.readOnly,
      })
    ).toMatchObject({ status: 404 });

    const ownEvents = await prisma.studentLifecycleEvent.count({
      where: { alunoId: targetId, contractId: tenantAId },
    });
    const foreignEvents = await prisma.studentLifecycleEvent.count({
      where: { alunoId: targetId, contractId: { not: tenantAId } },
    });
    expect(ownEvents).toBeGreaterThan(0);
    expect(foreignEvents).toBe(0);

    const deniedRecords = await prisma.studentProfile.findUniqueOrThrow({ where: { alunoId: targetId } });
    const notes = (deniedRecords.identificationData as {
      _leadCommercial?: { notes?: string };
    })._leadCommercial?.notes;
    expect(notes).toBe('contato comercial validado');
  });
});
