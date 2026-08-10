import express from 'express';
import jwt from 'jsonwebtoken';
import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  StudentLifecycleStatus,
  UserType,
} from '@prisma/client';

const request = require('supertest');
const { consolidatedPrescriptionRoutes } = require('../src/modules/consolidated-prescriptions/index');

const runDatabaseIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const contractA = 'consolidated-http-contract-a';
const contractB = 'consolidated-http-contract-b';
const alunoA = 'consolidated-http-aluno-a';
const alunoOther = 'consolidated-http-aluno-other';
const emailPrefix = 'consolidated-http-test-';
const capacities = ['resisted', 'flexibility', 'cyclic', 'balance'] as const;

function tokenFor(user: { id: string; email: string; type: UserType }) {
  return jwt.sign(
    { userId: user.id, email: user.email, type: user.type },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h' }
  );
}

async function createContract(id: string, document: string) {
  return prisma.companyContract.create({
    data: { id, type: ContractType.academy, document, name: `Contrato ${id}` },
  });
}

async function createProfessor(input: {
  contractId: string;
  suffix: string;
  role?: ProfessorRole;
  view?: boolean;
  manage?: boolean;
  approve?: boolean;
  dataScope?: 'self' | 'managed' | 'contract';
  responsibleManagerId?: string | null;
}) {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: input.contractId,
      name: `Função ${input.suffix}`,
      code: `consolidated-http-${input.suffix}`,
      isActive: true,
    },
  });
  await prisma.accessPermission.createMany({
    data: [
      {
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'plans',
        blockKey: '',
        canView: true,
        dataScope: input.dataScope ?? 'contract',
      },
      {
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'plans',
        blockKey: 'plans.consolidatedPrescriptions.view',
        canView: input.view ?? true,
      },
      {
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'plans',
        blockKey: 'plans.consolidatedPrescriptions.manage',
        canView: input.manage ?? true,
      },
      {
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'plans',
        blockKey: 'plans.consolidatedPrescriptions.approve',
        canView: input.approve ?? false,
      },
    ],
  });
  const user = await prisma.user.create({
    data: {
      email: `${emailPrefix}${input.suffix}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: `Professor ${input.suffix}` } },
    },
  });
  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId: input.contractId,
      role: input.role ?? ProfessorRole.professor,
      collaboratorFunctionId: collaboratorFunction.id,
      responsibleManagerId: input.responsibleManagerId ?? null,
    },
  });
  return { user, professor, token: tokenFor(user) };
}

async function createAlunoGoal(input: {
  contractId: string;
  alunoId: string;
  professorId: string;
  suffix: string;
}) {
  const aluno = await prisma.aluno.create({
    data: {
      id: input.alunoId,
      contractId: input.contractId,
      professorId: input.professorId,
      status: StudentLifecycleStatus.ACTIVE_STUDENT,
    },
  });
  const record = await prisma.prontuarioRecord.create({
    data: {
      contractId: input.contractId,
      alunoId: aluno.id,
      professorId: input.professorId,
      code: `PRNT-CONSOLIDATED-${input.suffix}`,
      summary: 'Fonte estruturada para montagem consolidada',
    },
  });
  const goal = await prisma.prontuarioGoal.create({
    data: { recordId: record.id, title: `Objetivo ${input.suffix}`, priority: 1 },
  });
  return { aluno, goal };
}

async function createCapacityVersion(input: {
  contractId: string;
  alunoId: string;
  professorId: string;
  capacity: (typeof capacities)[number];
  version: number;
  goalId: string;
  rootId?: string;
  alertSeverity?: 'info' | 'warning' | 'critical';
}) {
  let rootId = input.rootId;
  if (!rootId) {
    const root = await prisma.capacityPrescription.create({
      data: {
        contractId: input.contractId,
        alunoId: input.alunoId,
        capacity: input.capacity,
        status: 'active',
        currentVersion: input.version,
        createdByProfessorId: input.professorId,
        updatedByProfessorId: input.professorId,
        publishesTodayWorkout: false,
      },
    });
    rootId = root.id;
  } else {
    await prisma.capacityPrescription.update({
      where: { id: rootId },
      data: {
        status: 'active',
        currentVersion: input.version,
        updatedByProfessorId: input.professorId,
      },
    });
  }

  const version = await prisma.capacityPrescriptionVersion.create({
    data: {
      prescriptionId: rootId,
      contractId: input.contractId,
      alunoId: input.alunoId,
      responsibleProfessorId: input.professorId,
      capacity: input.capacity,
      status: 'active',
      version: input.version,
      technicalJustification: `Justificativa estruturada ${input.capacity}.`,
      professorSummary: `Resumo ${input.capacity}.`,
      studentMessage: null,
      methodologyVersion: null,
      parameterSetIds: [],
      publishesTodayWorkout: false,
      sources: {
        create: {
          sourceType: 'prontuario_goal',
          sourceId: input.goalId,
          label: 'Objetivo canônico do PRNT',
          origin: 'PRNT',
          sourceVersion: '1',
          responsibleProfessorId: input.professorId,
        },
      },
      ...(input.alertSeverity
        ? {
            alerts: {
              create: {
                code: `alert-${input.capacity}-${input.version}`,
                message: 'Alerta estruturado persistido.',
                severity: input.alertSeverity,
                sourceRefId: input.goalId,
              },
            },
          }
        : {}),
    },
  });
  return { rootId, versionId: version.id };
}

async function createCapacitySet(input: {
  contractId: string;
  alunoId: string;
  professorId: string;
  goalId: string;
  critical?: boolean;
}) {
  const result: Record<string, { rootId: string; versionId: string }> = {};
  for (const capacity of capacities) {
    result[capacity] = await createCapacityVersion({
      ...input,
      capacity,
      version: 1,
      alertSeverity: input.critical && capacity === 'resisted' ? 'critical' : undefined,
    });
  }
  return result;
}

function compositionPayload(versions: Record<string, { versionId: string }>) {
  return {
    capacityBlocks: capacities.map((capacity) => ({
      capacityPrescriptionVersionId: versions[capacity].versionId,
    })),
    professorJustification:
      'Dor intensa no joelho, agachamento forte e alta intensidade aparecem somente em texto livre.',
    studentInstruction: 'Aguarde a validação profissional.',
  };
}

async function cleanupFixtures() {
  const contractIds = [contractA, contractB];

  await prisma.consolidatedPrescription.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.capacityPrescription.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.prontuarioRecord.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.aluno.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.professor.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.collaboratorFunctionOption.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.companyContract.deleteMany({ where: { id: { in: contractIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
}

describeDatabase('consolidated prescription workflow HTTP integration with PostgreSQL', () => {
  const app = express();
  app.use(express.json());
  app.use('/consolidated-prescriptions', consolidatedPrescriptionRoutes);

  let master: Awaited<ReturnType<typeof createProfessor>>;
  let tenantB: Awaited<ReturnType<typeof createProfessor>>;
  let deniedApprover: Awaited<ReturnType<typeof createProfessor>>;
  let selfProfessor: Awaited<ReturnType<typeof createProfessor>>;
  let goalA = '';

  beforeEach(async () => {
    await cleanupFixtures();
    await createContract(contractA, '57365610000701');
    await createContract(contractB, '57365610000702');

    master = await createProfessor({
      contractId: contractA,
      suffix: 'master',
      role: ProfessorRole.master,
      approve: true,
    });
    deniedApprover = await createProfessor({
      contractId: contractA,
      suffix: 'denied-approve',
      view: true,
      manage: true,
      approve: false,
      dataScope: 'contract',
    });
    selfProfessor = await createProfessor({
      contractId: contractA,
      suffix: 'self',
      view: true,
      manage: true,
      approve: false,
      dataScope: 'self',
    });
    tenantB = await createProfessor({
      contractId: contractB,
      suffix: 'tenant-b',
      role: ProfessorRole.master,
      approve: true,
    });

    goalA = (
      await createAlunoGoal({
        contractId: contractA,
        alunoId: alunoA,
        professorId: master.professor.id,
        suffix: 'A',
      })
    ).goal.id;
    await createAlunoGoal({
      contractId: contractA,
      alunoId: alunoOther,
      professorId: selfProfessor.professor.id,
      suffix: 'OTHER',
    });
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejeita autoridade forjada, isolamento cross-tenant/dataScope e permissão específica de aprovação', async () => {
    const versions = await createCapacitySet({
      contractId: contractA,
      alunoId: alunoA,
      professorId: master.professor.id,
      goalId: goalA,
    });

    const forged = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ ...compositionPayload(versions), status: 'approved', contractId: contractB });
    expect(forged.status).toBe(400);

    const created = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${master.token}`)
      .send(compositionPayload(versions));
    expect(created.status).toBe(201);

    const crossTenant = await request(app)
      .get(`/consolidated-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${tenantB.token}`);
    const outsideSelfScope = await request(app)
      .get(`/consolidated-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${selfProfessor.token}`);
    const deniedApproval = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/approve`)
      .set('Authorization', `Bearer ${deniedApprover.token}`)
      .send({ expectedCurrentVersion: 1 });

    expect(crossTenant.status).toBe(404);
    expect(outsideSelfScope.status).toBe(404);
    expect(deniedApproval.status).toBe(403);
  });

  it('não bloqueia por texto livre e conclui draft -> ready_for_review -> approved', async () => {
    const versions = await createCapacitySet({
      contractId: contractA,
      alunoId: alunoA,
      professorId: master.professor.id,
      goalId: goalA,
    });
    const created = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${master.token}`)
      .send(compositionPayload(versions));

    expect(created.status).toBe(201);
    expect(created.body.data.latestVersion.conflicts).toEqual([]);

    const review = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/send-for-review`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 1 });
    expect(review.status).toBe(200);
    expect(review.body.data.currentStatus).toBe('ready_for_review');

    const approved = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/approve`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 2 });
    expect(approved.status).toBe(200);
    expect(approved.body.data.currentStatus).toBe('approved');
    expect(approved.body.data.latestVersion.approvedByProfessorId).toBe(master.professor.id);

    const release = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/release`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 3 });
    expect(release.status).toBe(404);
  });

  it('bloqueia critical estruturado, permite remediação ainda bloqueada e exige desbloqueio explícito', async () => {
    const versions = await createCapacitySet({
      contractId: contractA,
      alunoId: alunoA,
      professorId: master.professor.id,
      goalId: goalA,
      critical: true,
    });
    await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${master.token}`)
      .send(compositionPayload(versions))
      .expect(201);

    const blocked = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/send-for-review`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 1 });
    expect(blocked.status).toBe(200);
    expect(blocked.body.data.currentStatus).toBe('blocked');
    expect(blocked.body.data.latestVersion.conflicts).toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: 'critical' })])
    );

    const unblockStillCritical = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/unblock`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 2, targetStatus: 'ready_for_review' });
    expect(unblockStillCritical.status).toBe(400);

    const replacement = await createCapacityVersion({
      contractId: contractA,
      alunoId: alunoA,
      professorId: master.professor.id,
      capacity: 'resisted',
      version: 2,
      goalId: goalA,
      rootId: versions.resisted.rootId,
    });
    const remediatedVersions = {
      ...versions,
      resisted: { ...versions.resisted, versionId: replacement.versionId },
    };

    const remediation = await request(app)
      .patch(`/consolidated-prescriptions/alunos/${alunoA}/composition`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({
        ...compositionPayload(remediatedVersions),
        expectedCurrentVersion: 2,
      });
    expect(remediation.status).toBe(200);
    expect(remediation.body.data.currentStatus).toBe('blocked');
    expect(remediation.body.data.latestVersion.conflicts).toEqual([]);

    const unblocked = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/unblock`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 3, targetStatus: 'ready_for_review', reason: 'Restrição resolvida.' });
    expect(unblocked.status).toBe(200);
    expect(unblocked.body.data.currentStatus).toBe('ready_for_review');
    expect(unblocked.body.data.latestVersion.approvedByProfessorId).toBeNull();
    expect(unblocked.body.data.latestVersion.blockReason).toBeNull();

    const approved = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/approve`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 4 });
    expect(approved.body.data.currentStatus).toBe('approved');

    const revision = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/revisions`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 5, reason: 'Novo ciclo de planejamento.' });
    expect(revision.status).toBe(201);
    expect(revision.body.data.currentStatus).toBe('draft');
    expect(revision.body.data.latestVersion.blockReason).toBeNull();

    const history = await request(app)
      .get(`/consolidated-prescriptions/alunos/${alunoA}/history`)
      .set('Authorization', `Bearer ${master.token}`);
    expect(history.status).toBe(200);
    expect(history.body.data.auditEvents.map((event: { action: string }) => event.action)).toEqual(
      expect.arrayContaining([
        'created',
        'blocked_by_conflict',
        'composition_updated',
        'unblocked',
        'approved',
        'revision_created',
      ])
    );
    expect(history.body.data.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'unblocked', reason: 'Restrição resolvida.' }),
        expect.objectContaining({ action: 'revision_created', reason: 'Novo ciclo de planejamento.' }),
      ])
    );
  });

  it('não herda motivo de bloqueio quando o desbloqueio não informa motivo', async () => {
    const versions = await createCapacitySet({
      contractId: contractA,
      alunoId: alunoA,
      professorId: master.professor.id,
      goalId: goalA,
    });
    await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${master.token}`)
      .send(compositionPayload(versions))
      .expect(201);

    await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/block`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 1, reason: 'Bloqueio temporário.' })
      .expect(200);

    const unblocked = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/unblock`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 2, targetStatus: 'draft' });
    expect(unblocked.status).toBe(200);
    expect(unblocked.body.data.latestVersion.blockReason).toBeNull();

    const history = await request(app)
      .get(`/consolidated-prescriptions/alunos/${alunoA}/history`)
      .set('Authorization', `Bearer ${master.token}`);
    expect(history.status).toBe(200);
    const unblockedEvent = history.body.data.auditEvents.find(
      (event: { action: string }) => event.action === 'unblocked'
    );
    expect(unblockedEvent).toEqual(expect.objectContaining({ reason: null }));
  });

  it('retorna 409 para expectedCurrentVersion obsoleto sem criar versão parcial', async () => {
    const versions = await createCapacitySet({
      contractId: contractA,
      alunoId: alunoA,
      professorId: master.professor.id,
      goalId: goalA,
    });
    await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${master.token}`)
      .send(compositionPayload(versions))
      .expect(201);
    await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/send-for-review`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 1 })
      .expect(200);

    const stale = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/block`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 1, reason: 'Comando obsoleto.' });
    expect(stale.status).toBe(409);

    const current = await prisma.consolidatedPrescription.findFirst({
      where: { contractId: contractA, alunoId: alunoA },
    });
    expect(current?.currentVersion).toBe(2);
  });
});
