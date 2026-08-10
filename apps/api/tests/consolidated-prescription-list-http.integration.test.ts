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

const contractA = 'consolidated-list-contract-a';
const contractB = 'consolidated-list-contract-b';
const alunoA = 'consolidated-list-aluno-a';
const emailPrefix = 'consolidated-list-test-';
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
  view?: boolean;
  manage?: boolean;
}) {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: input.contractId,
      name: `Função ${input.suffix}`,
      code: `consolidated-list-${input.suffix}`,
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
        dataScope: 'contract',
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
      role: ProfessorRole.professor,
      collaboratorFunctionId: collaboratorFunction.id,
    },
  });
  return { user, professor, token: tokenFor(user) };
}

async function createCapacitySet(professorId: string) {
  const versionIds: string[] = [];
  for (const capacity of capacities) {
    const root = await prisma.capacityPrescription.create({
      data: {
        contractId: contractA,
        alunoId: alunoA,
        capacity,
        status: 'active',
        currentVersion: 1,
        createdByProfessorId: professorId,
        updatedByProfessorId: professorId,
        publishesTodayWorkout: false,
      },
    });
    const version = await prisma.capacityPrescriptionVersion.create({
      data: {
        prescriptionId: root.id,
        contractId: contractA,
        alunoId: alunoA,
        responsibleProfessorId: professorId,
        capacity,
        status: 'active',
        version: 1,
        technicalJustification: `Justificativa ${capacity}.`,
        professorSummary: `Resumo ${capacity}.`,
        studentMessage: null,
        methodologyVersion: null,
        parameterSetIds: [],
        publishesTodayWorkout: false,
      },
    });
    versionIds.push(version.id);
  }
  return versionIds;
}

async function cleanupFixtures() {
  const contractIds = [contractA, contractB];
  await prisma.consolidatedPrescription.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.capacityPrescription.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.aluno.deleteMany({ where: { contractId: { in: contractIds } } });
  await prisma.professor.deleteMany({ where: { contractId: { in: contractIds } } });
  await prisma.collaboratorFunctionOption.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.companyContract.deleteMany({ where: { id: { in: contractIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
}

describeDatabase('consolidated prescription listing HTTP integration with PostgreSQL', () => {
  const app = express();
  app.use(express.json());
  app.use('/consolidated-prescriptions', consolidatedPrescriptionRoutes);

  let owner: Awaited<ReturnType<typeof createProfessor>>;
  let denied: Awaited<ReturnType<typeof createProfessor>>;
  let tenantB: Awaited<ReturnType<typeof createProfessor>>;
  let versionIds: string[] = [];

  beforeEach(async () => {
    await cleanupFixtures();
    await createContract(contractA, '57365610000801');
    await createContract(contractB, '57365610000802');
    owner = await createProfessor({ contractId: contractA, suffix: 'owner' });
    denied = await createProfessor({
      contractId: contractA,
      suffix: 'denied',
      view: false,
      manage: false,
    });
    tenantB = await createProfessor({ contractId: contractB, suffix: 'tenant-b' });
    await prisma.aluno.create({
      data: {
        id: alunoA,
        contractId: contractA,
        professorId: owner.professor.id,
        status: StudentLifecycleStatus.ACTIVE_STUDENT,
      },
    });
    versionIds = await createCapacitySet(owner.professor.id);
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lista zero/uma montagem e preserva permissão e isolamento cross-tenant', async () => {
    const empty = await request(app)
      .get(`/consolidated-prescriptions/alunos/${alunoA}/assemblies`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual([]);

    const created = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        capacityBlocks: versionIds.map((capacityPrescriptionVersionId) => ({
          capacityPrescriptionVersionId,
        })),
        professorJustification: 'Montagem criada para validar a coleção HTTP.',
      });
    expect(created.status).toBe(201);

    const listed = await request(app)
      .get(`/consolidated-prescriptions/alunos/${alunoA}/assemblies`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0]).toMatchObject({
      id: created.body.data.id,
      alunoId: alunoA,
      currentVersion: 1,
      currentStatus: 'draft',
    });

    const deniedResponse = await request(app)
      .get(`/consolidated-prescriptions/alunos/${alunoA}/assemblies`)
      .set('Authorization', `Bearer ${denied.token}`);
    expect(deniedResponse.status).toBe(403);

    const crossTenant = await request(app)
      .get(`/consolidated-prescriptions/alunos/${alunoA}/assemblies`)
      .set('Authorization', `Bearer ${tenantB.token}`);
    expect(crossTenant.status).toBe(404);
  });
});
