import express from 'express';
import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';

const request = require('supertest');

let mockProfessorId = 'professor-http-create-read';
let mockContractId = 'issue-450-http-contract';

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as any).user = {
      userId: 'issue-450-http-professor-user',
      email: 'issue-450-http-professor@example.com',
      type: 'professor',
      professorId: mockProfessorId,
      professorRole: 'master',
      contractId: mockContractId,
    };
    next();
  },
  professorMiddleware: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

jest.mock('../src/modules/access-control/access-control.middleware', () => ({
  blockAccessMiddleware: () => (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

const studentParqBoundaryRoutes = require('../src/modules/alunos/student-parq-boundary.routes').default;
const alunoCreateRoutes = require('../src/modules/alunos/aluno-create.routes').default;

const runDatabaseIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const contractId = 'issue-450-http-contract';
const emailPrefix = 'issue-450-http-';

async function createContract() {
  return prisma.companyContract.create({
    data: {
      id: contractId,
      type: ContractType.academy,
      document: '57365610000457',
      name: 'Contrato Issue 450 HTTP',
    },
  });
}

async function createProfessor() {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Professor',
      code: 'issue-450-http-professor',
      isActive: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `${emailPrefix}professor@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: 'Professor Issue 450' } },
    },
  });

  return prisma.professor.create({
    data: {
      userId: user.id,
      contractId,
      role: ProfessorRole.master,
      collaboratorFunctionId: collaboratorFunction.id,
    },
  });
}

async function createService() {
  return prisma.serviceOption.create({
    data: {
      contractId,
      name: 'Serviço Issue 450',
      code: 'issue_450_http_service',
      category: 'individual_service',
      displayOrder: 0,
      origin: 'manual',
      isActive: true,
    },
  });
}

describeDatabase('Issue 450 administrative create/read HTTP flow', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/alunos', studentParqBoundaryRoutes);
  app.use('/api/v1/alunos', alunoCreateRoutes);

  beforeEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
    await createContract();
    const professor = await createProfessor();
    mockProfessorId = professor.id;
    mockContractId = contractId;
  });

  afterEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns 200 on immediate GET after POST when PAR-Q onboarding has not started', async () => {
    const service = await createService();
    const email = `${emailPrefix}student@example.com`;

    const created = await request(app)
      .post('/api/v1/alunos')
      .send({
        name: 'Aluno Issue 450',
        email,
        serviceId: service.id,
        schedulePlan: 'free',
        age: 29,
      });

    expect(created.status).toBe(201);
    const alunoId = created.body.data?.aluno?.id;
    expect(alunoId).toEqual(expect.any(String));

    const read = await request(app).get(`/api/v1/alunos/${alunoId}`);

    expect(read.status).toBe(200);
    expect(read.body.data).toMatchObject({
      id: alunoId,
      contractId,
      parq: {
        state: 'NOT_STARTED',
        latestSubmission: null,
        requiresProfessionalReview: false,
      },
    });
  });
});
