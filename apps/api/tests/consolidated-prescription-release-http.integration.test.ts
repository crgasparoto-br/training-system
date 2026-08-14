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

const contractA = 'issue-320-release-http-a';
const contractB = 'issue-320-release-http-b';
const emailPrefix = 'issue-320-release-http-';

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
  dataScope: 'self' | 'managed' | 'contract';
  release: boolean;
}) {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: input.contractId,
      name: `Função ${input.suffix}`,
      code: `issue-320-release-${input.suffix}`,
      isActive: true,
    },
  });
  await prisma.accessPermission.create({
    data: {
      collaboratorFunctionId: collaboratorFunction.id,
      screenKey: 'plans',
      blockKey: '',
      canView: true,
      dataScope: input.dataScope,
    },
  });
  const releasePermission = await prisma.accessPermission.create({
    data: {
      collaboratorFunctionId: collaboratorFunction.id,
      screenKey: 'plans',
      blockKey: 'plans.consolidatedPrescriptions.release',
      canView: input.release,
    },
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
  return { user, professor, releasePermission, token: tokenFor(user) };
}

async function createAluno(input: { id: string; contractId: string; professorId: string }) {
  return prisma.aluno.create({
    data: {
      id: input.id,
      contractId: input.contractId,
      professorId: input.professorId,
      status: StudentLifecycleStatus.ACTIVE_STUDENT,
    },
  });
}

function releasePayload() {
  return {
    expectedCurrentVersion: 1,
    target: {
      trainingPlanId: 'plan-does-not-matter-before-scope-gate',
      mesocycleNumber: 1,
      weekNumber: 1,
      weekStartDate: '2026-08-17T00:00:00.000Z',
      placements: [],
    },
  };
}

async function cleanup() {
  const contractIds = [contractA, contractB];
  await prisma.aluno.deleteMany({ where: { contractId: { in: contractIds } } });
  await prisma.professor.deleteMany({ where: { contractId: { in: contractIds } } });
  await prisma.collaboratorFunctionOption.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.companyContract.deleteMany({ where: { id: { in: contractIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
}

describeDatabase('consolidated operational release HTTP authorization boundary - issue 320', () => {
  const app = express();
  app.use(express.json());
  app.use('/consolidated-prescriptions', consolidatedPrescriptionRoutes);

  beforeEach(async () => {
    await cleanup();
    await createContract(contractA, '57365610000801');
    await createContract(contractB, '57365610000802');
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('revalida release no backend depois da emissão do token e rejeita permissão revogada', async () => {
    const actor = await createProfessor({
      contractId: contractA,
      suffix: 'revoked',
      dataScope: 'contract',
      release: true,
    });
    await createAluno({ id: 'issue-320-revoked-aluno', contractId: contractA, professorId: actor.professor.id });

    await prisma.accessPermission.update({
      where: { id: actor.releasePermission.id },
      data: { canView: false },
    });

    const response = await request(app)
      .post('/consolidated-prescriptions/alunos/issue-320-revoked-aluno/operational-release')
      .set('Authorization', `Bearer ${actor.token}`)
      .send(releasePayload());

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: 'Perfil sem permissão para liberar esta montagem',
    });
  });

  it('não enumera aluno de outro contrato', async () => {
    const actor = await createProfessor({
      contractId: contractA,
      suffix: 'tenant-a',
      dataScope: 'contract',
      release: true,
    });
    const ownerB = await createProfessor({
      contractId: contractB,
      suffix: 'tenant-b',
      dataScope: 'contract',
      release: true,
    });
    const targetId = 'issue-320-cross-tenant-aluno';
    await createAluno({ id: targetId, contractId: contractB, professorId: ownerB.professor.id });

    const response = await request(app)
      .post(`/consolidated-prescriptions/alunos/${targetId}/operational-release`)
      .set('Authorization', `Bearer ${actor.token}`)
      .send(releasePayload());

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, error: 'Recurso não encontrado' });
    expect(JSON.stringify(response.body)).not.toContain(targetId);
  });

  it('não enumera aluno fora do dataScope self no mesmo contrato', async () => {
    const actor = await createProfessor({
      contractId: contractA,
      suffix: 'self',
      dataScope: 'self',
      release: true,
    });
    const owner = await createProfessor({
      contractId: contractA,
      suffix: 'other-owner',
      dataScope: 'self',
      release: true,
    });
    const targetId = 'issue-320-outside-self-aluno';
    await createAluno({ id: targetId, contractId: contractA, professorId: owner.professor.id });

    const response = await request(app)
      .post(`/consolidated-prescriptions/alunos/${targetId}/operational-release`)
      .set('Authorization', `Bearer ${actor.token}`)
      .send(releasePayload());

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, error: 'Recurso não encontrado' });
    expect(JSON.stringify(response.body)).not.toContain(targetId);
  });
});
