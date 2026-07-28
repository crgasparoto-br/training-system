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
const { capacityPrescriptionRoutes } = require('../src/modules/capacity-prescriptions/index');

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const contractA = 'capacity-http-contract-a';
const contractB = 'capacity-http-contract-b';
const alunoA = 'capacity-http-aluno-a';
const alunoB = 'capacity-http-aluno-b';
const emailPrefix = 'capacity-http-test-';

function tokenFor(user: { id: string; email: string; type: UserType }) {
  return jwt.sign(
    { userId: user.id, email: user.email, type: user.type },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h' }
  );
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

async function createProfessor(input: {
  contractId: string;
  suffix: string;
  role: ProfessorRole;
  canView: boolean;
  canManage: boolean;
  canManageParameters: boolean;
}) {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: input.contractId,
      name: `Função ${input.suffix}`,
      code: `capacity-http-${input.suffix}`,
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
      },
      {
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'plans',
        blockKey: 'plans.capacityPrescriptions.view',
        canView: input.canView,
      },
      {
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'plans',
        blockKey: 'plans.capacityPrescriptions.manage',
        canView: input.canManage,
      },
      {
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'settings.parameters',
        blockKey: '',
        canView: input.canManageParameters,
      },
      {
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'settings.parameters',
        blockKey: 'settings.parameters.capacityPrescriptions',
        canView: input.canManageParameters,
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
      role: input.role,
      collaboratorFunctionId: collaboratorFunction.id,
    },
  });

  return { user, professor, token: tokenFor(user) };
}

async function createAlunoAndGoal(input: {
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
      maxHeartRate: 190,
      restingHeartRate: 60,
    },
  });
  const record = await prisma.prontuarioRecord.create({
    data: {
      contractId: input.contractId,
      alunoId: aluno.id,
      professorId: input.professorId,
      code: `PRNT-${input.suffix}`,
      summary: 'Registro técnico para teste de capacidade',
    },
  });
  const goal = await prisma.prontuarioGoal.create({
    data: {
      recordId: record.id,
      title: `Objetivo ${input.suffix}`,
      priority: 1,
    },
  });
  await prisma.prontuarioGoalCapacityClassification.create({
    data: {
      goalId: goal.id,
      contractId: input.contractId,
      alunoId: aluno.id,
      capacities: ['resisted'],
      relatesToAssessment: false,
      relatesToActionPlan: false,
      updatedByProfessorId: input.professorId,
    },
  });
  return { aluno, record, goal };
}

function resistedPayload(goalId: string, expectedCurrentVersion?: number) {
  return {
    capacity: 'resisted',
    ...(expectedCurrentVersion === undefined ? {} : { expectedCurrentVersion }),
    sourceRefs: [
      {
        type: 'prontuario_goal',
        id: goalId,
        label: 'Objetivo PRNT principal',
        origin: 'PRNT',
        version: 1,
      },
    ],
    linkedProntuarioGoalIds: [goalId],
    technicalJustification: 'Bloco resistido compatível com o objetivo e alertas atuais.',
    professorSummary: 'Aplicar progressão conservadora e revisar PSE.',
    studentMessage: 'Seu treino de força será ajustado com progressão gradual.',
    parameters: {
      type: 'resisted',
      resisted: {
        method: 'adaptacao_anatomica',
        sets: 3,
        repetitions: '8-12',
        expectedPse: 6,
      },
    },
  };
}

function cyclicParameterPayload(code: string) {
  return {
    capacity: 'cyclic',
    code,
    name: 'Base aeróbica',
    methodologyVersion: 'run-v1',
    parameters: {
      type: 'cyclic',
      cyclic: {
        zoneBasis: 'heart_rate_reserve',
        zones: [{ name: 'Z2', minPercent: 60, maxPercent: 70 }],
        expectedPse: 5,
      },
    },
  };
}

describeDatabase('capacity prescriptions HTTP integration with PostgreSQL', () => {
  const app = express();
  app.use(express.json());
  app.use('/capacity-prescriptions', capacityPrescriptionRoutes);

  let masterToken = '';
  let tenantBToken = '';
  let deniedToken = '';
  let masterProfessorId = '';
  let goalA = '';
  let goalB = '';

  beforeEach(async () => {
    await prisma.companyContract.deleteMany({
      where: { id: { in: [contractA, contractB] } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });

    await createContract(contractA, '57365610000601');
    await createContract(contractB, '57365610000602');

    const master = await createProfessor({
      contractId: contractA,
      suffix: 'master',
      role: ProfessorRole.master,
      canView: true,
      canManage: true,
      canManageParameters: true,
    });
    const denied = await createProfessor({
      contractId: contractA,
      suffix: 'denied',
      role: ProfessorRole.professor,
      canView: false,
      canManage: false,
      canManageParameters: false,
    });
    const professorB = await createProfessor({
      contractId: contractB,
      suffix: 'tenant-b',
      role: ProfessorRole.master,
      canView: true,
      canManage: true,
      canManageParameters: true,
    });

    masterToken = master.token;
    tenantBToken = professorB.token;
    deniedToken = denied.token;
    masterProfessorId = master.professor.id;
    goalA = (
      await createAlunoAndGoal({
        contractId: contractA,
        alunoId: alunoA,
        professorId: master.professor.id,
        suffix: 'A',
      })
    ).goal.id;
    goalB = (
      await createAlunoAndGoal({
        contractId: contractB,
        alunoId: alunoB,
        professorId: professorB.professor.id,
        suffix: 'B',
      })
    ).goal.id;
  });

  afterEach(async () => {
    await prisma.companyContract.deleteMany({
      where: { id: { in: [contractA, contractB] } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('exige autenticação e permissão real para leitura e escrita', async () => {
    const unauthenticated = await request(app).get(
      `/capacity-prescriptions/alunos/${alunoA}`
    );
    const denied = await request(app)
      .post(`/capacity-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${deniedToken}`)
      .send(resistedPayload(goalA));

    expect(unauthenticated.status).toBe(401);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('Perfil sem permissão para acessar este recurso');
  });

  it('cria, consulta e versiona a capacidade no contrato autenticado com contrato público', async () => {
    const created = await request(app)
      .post(`/capacity-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send(resistedPayload(goalA));

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      contractId: contractA,
      alunoId: alunoA,
      capacity: 'resisted',
      currentVersion: 1,
      publishesTodayWorkout: false,
      latestVersion: {
        version: 1,
        responsibleProfessorId: masterProfessorId,
        publishesTodayWorkout: false,
        linkedProntuarioGoalIds: [goalA],
        sourceRefs: [expect.objectContaining({ type: 'prontuario_goal', id: goalA })],
      },
    });
    expect(created.body.data.latestVersion.sources).toBeUndefined();
    expect(created.body.data.latestVersion.goals).toBeUndefined();

    const second = await request(app)
      .post(`/capacity-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send(resistedPayload(goalA, 1));
    expect(second.status).toBe(201);
    expect(second.body.data.currentVersion).toBe(2);
    expect(second.body.data.latestVersion.version).toBe(2);

    const list = await request(app)
      .get(`/capacity-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${masterToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].latestVersion.version).toBe(2);

    const history = await request(app)
      .get(`/capacity-prescriptions/${created.body.data.id}/versions`)
      .set('Authorization', `Bearer ${masterToken}`);
    expect(history.status).toBe(200);
    expect(history.body.data.map((item: { version: number }) => item.version)).toEqual([2, 1]);
    expect(history.body.data[0].sourceRefs[0].id).toBe(goalA);
  });

  it('retorna conflito HTTP para versão otimista desatualizada', async () => {
    await request(app)
      .post(`/capacity-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send(resistedPayload(goalA));

    const stale = await request(app)
      .post(`/capacity-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send(resistedPayload(goalA, 0));

    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('A prescrição foi alterada por outro usuário');
  });

  it('não enumera aluno de outro tenant', async () => {
    const crossTenantStudent = await request(app)
      .post(`/capacity-prescriptions/alunos/${alunoB}`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send(resistedPayload(goalB));
    const missingStudent = await request(app)
      .post('/capacity-prescriptions/alunos/aluno-inexistente')
      .set('Authorization', `Bearer ${masterToken}`)
      .send(resistedPayload(goalB));

    expect(crossTenantStudent.status).toBe(404);
    expect(missingStudent.status).toBe(404);
    expect(crossTenantStudent.body.error).toBe(missingStudent.body.error);
  });

  it('atinge diretamente a fronteira de objetivo de outro tenant com aluno válido', async () => {
    const crossTenantGoal = await request(app)
      .post(`/capacity-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send(resistedPayload(goalB));
    const missingGoal = await request(app)
      .post(`/capacity-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send(resistedPayload('goal-inexistente'));

    expect(crossTenantGoal.status).toBe(400);
    expect(missingGoal.status).toBe(400);
    expect(crossTenantGoal.body.error).toBe(missingGoal.body.error);
    expect(
      await prisma.capacityPrescription.count({ where: { contractId: contractA, alunoId: alunoA } })
    ).toBe(0);
  });

  it('atinge diretamente a fronteira de parâmetro de outro tenant com aluno e objetivo válidos', async () => {
    const parameterB = await request(app)
      .post('/capacity-prescriptions/parameters')
      .set('Authorization', `Bearer ${tenantBToken}`)
      .send(cyclicParameterPayload('TENANT_B_RUN'));
    expect(parameterB.status).toBe(201);

    const response = await request(app)
      .post(`/capacity-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        ...resistedPayload(goalA),
        parameterSetIds: [parameterB.body.data.id],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Parâmetro técnico inválido ou pertencente a outro contrato');
    expect(
      await prisma.capacityPrescription.count({ where: { contractId: contractA, alunoId: alunoA } })
    ).toBe(0);
  });

  it('não enumera prescrição de outro tenant com rota direta', async () => {
    const createdB = await request(app)
      .post(`/capacity-prescriptions/alunos/${alunoB}`)
      .set('Authorization', `Bearer ${tenantBToken}`)
      .send(resistedPayload(goalB));
    expect(createdB.status).toBe(201);

    const crossTenant = await request(app)
      .get(`/capacity-prescriptions/${createdB.body.data.id}`)
      .set('Authorization', `Bearer ${masterToken}`);
    const missing = await request(app)
      .get('/capacity-prescriptions/prescription-inexistente')
      .set('Authorization', `Bearer ${masterToken}`);

    expect(crossTenant.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(crossTenant.body.error).toBe(missing.body.error);
  });

  it('rejeita tentativa de publicar Treino de hoje pelo payload', async () => {
    const response = await request(app)
      .post(`/capacity-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send({ ...resistedPayload(goalA), publishesTodayWorkout: true });

    expect(response.status).toBe(400);
    expect(
      await prisma.capacityPrescription.count({ where: { contractId: contractA, alunoId: alunoA } })
    ).toBe(0);
  });

  it('versiona parâmetros técnicos por contrato sem aceitar perfil negado', async () => {
    const created = await request(app)
      .post('/capacity-prescriptions/parameters')
      .set('Authorization', `Bearer ${masterToken}`)
      .send(cyclicParameterPayload('RUN_BASE'));
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      contractId: contractA,
      code: 'RUN_BASE',
      version: 1,
      isCurrent: true,
    });

    const denied = await request(app)
      .post('/capacity-prescriptions/parameters')
      .set('Authorization', `Bearer ${deniedToken}`)
      .send({
        capacity: 'balance',
        code: 'DENIED',
        name: 'Negado',
        methodologyVersion: 'v1',
        parameters: { type: 'balance', balance: { expectedPse: 4 } },
      });
    expect(denied.status).toBe(403);

    const listed = await request(app)
      .get('/capacity-prescriptions/parameters?capacity=cyclic')
      .set('Authorization', `Bearer ${masterToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].contractId).toBe(contractA);
  });
});
