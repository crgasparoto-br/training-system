import express from 'express';
import jwt from 'jsonwebtoken';
import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';

const request = require('supertest');
const { alunoRoutes } = require('../src/modules/alunos/index');

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const contractA = 'service-interest-http-contract-a';
const contractB = 'service-interest-http-contract-b';
const emailPrefix = 'service-interest-http-';

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
  canEditProfile: boolean;
}) {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: input.contractId,
      name: `Função ${input.suffix}`,
      code: `service-interest-http-${input.suffix}`,
      isActive: true,
    },
  });

  await prisma.accessPermission.createMany({
    data: [
      {
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'students.details',
        blockKey: '',
        canView: true,
        dataScope: 'self',
      },
      {
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'students.details',
        blockKey: 'students.actions.editProfile',
        canView: input.canEditProfile,
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

  return { professor, token: tokenFor(user) };
}

async function createService(contractId: string, suffix: string) {
  return prisma.serviceOption.create({
    data: {
      contractId,
      name: `Serviço ${suffix}`,
      code: `service_interest_http_${suffix}`,
      category: 'individual_service',
      displayOrder: 0,
      origin: 'manual',
      isActive: true,
    },
  });
}

async function createAluno(
  professorId: string,
  serviceId: string,
  suffix: string
) {
  const user = await prisma.user.create({
    data: {
      email: `${emailPrefix}aluno-${suffix}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.aluno,
      profile: { create: { name: `Aluno ${suffix}` } },
    },
  });

  const professor = await prisma.professor.findUniqueOrThrow({
    where: { id: professorId },
    select: { contractId: true },
  });

  return prisma.aluno.create({
    data: {
      userId: user.id,
      professorId,
      contractId: professor.contractId,
      serviceId,
      schedulePlan: 'free',
      age: 35,
    },
  });
}

describeDatabase('student service interest through real HTTP routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/alunos', alunoRoutes);

  beforeEach(async () => {
    await prisma.companyContract.deleteMany({
      where: { id: { in: [contractA, contractB] } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });

    await createContract(contractA, '57365610000601');
    await createContract(contractB, '57365610000602');
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

  it('updates the service interest through the authenticated contract', async () => {
    const actor = await createProfessor({
      contractId: contractA,
      suffix: 'allowed',
      canEditProfile: true,
    });
    const currentService = await createService(contractA, 'current');
    const nextService = await createService(contractA, 'next');
    const aluno = await createAluno(
      actor.professor.id,
      currentService.id,
      'successful-update'
    );

    const response = await request(app)
      .put(`/alunos/${aluno.id}`)
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ serviceId: nextService.id, age: 36 });

    expect(response.status).toBe(200);
    await expect(
      prisma.aluno.findUniqueOrThrow({ where: { id: aluno.id } })
    ).resolves.toMatchObject({ serviceId: nextService.id, age: 36 });
  });

  it('rejects an edit without students.actions.editProfile and preserves the selection', async () => {
    const actor = await createProfessor({
      contractId: contractA,
      suffix: 'denied',
      canEditProfile: false,
    });
    const currentService = await createService(contractA, 'denied-current');
    const nextService = await createService(contractA, 'denied-next');
    const aluno = await createAluno(
      actor.professor.id,
      currentService.id,
      'denied-update'
    );

    const response = await request(app)
      .put(`/alunos/${aluno.id}`)
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ serviceId: nextService.id, age: 41 });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe(
      'Perfil sem permissão para acessar este recurso'
    );
    await expect(
      prisma.aluno.findUniqueOrThrow({ where: { id: aluno.id } })
    ).resolves.toMatchObject({ serviceId: currentService.id, age: 35 });
  });

  it('rolls back every field when the API rejects a service from another contract', async () => {
    const actor = await createProfessor({
      contractId: contractA,
      suffix: 'failed-edit',
      canEditProfile: true,
    });
    const currentService = await createService(contractA, 'failure-current');
    const foreignService = await createService(contractB, 'failure-foreign');
    const aluno = await createAluno(
      actor.professor.id,
      currentService.id,
      'failed-update'
    );

    const response = await request(app)
      .put(`/alunos/${aluno.id}`)
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ serviceId: foreignService.id, age: 42 });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Erro ao atualizar aluno');
    await expect(
      prisma.aluno.findUniqueOrThrow({ where: { id: aluno.id } })
    ).resolves.toMatchObject({ serviceId: currentService.id, age: 35 });
  });
});
