import express from 'express';
import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';

const request = require('supertest');

const mockBlockAccessMiddleware = jest.fn(
  () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
);

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
  academyMasterMiddleware: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

jest.mock('../src/modules/access-control/access-control.middleware', () => ({
  blockAccessMiddleware: mockBlockAccessMiddleware,
}));

const studentParqBoundaryRoutes = require('../src/modules/alunos/student-parq-boundary.routes').default;
const alunoCreateRoutes = require('../src/modules/alunos/aluno-create.routes').default;

const runDatabaseIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const contractId = 'issue-450-http-contract';
const otherContractId = 'issue-450-http-contract-other';
const emailPrefix = 'issue-450-http-';

async function createContract(
  id = contractId,
  document = '57365610000457',
  name = 'Contrato Issue 450 HTTP'
) {
  return prisma.companyContract.create({
    data: {
      id,
      type: ContractType.academy,
      document,
      name,
    },
  });
}

async function createProfessor(targetContractId = contractId, suffix = 'professor') {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: targetContractId,
      name: 'Professor',
      code: 'issue-450-http-professor-' + suffix,
      isActive: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: emailPrefix + 'professor-' + suffix + '@example.com',
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: 'Professor Issue 450 ' + suffix } },
    },
  });

  return prisma.professor.create({
    data: {
      userId: user.id,
      contractId: targetContractId,
      role: ProfessorRole.master,
      collaboratorFunctionId: collaboratorFunction.id,
    },
  });
}

async function createService(targetContractId = contractId, suffix = 'main') {
  return prisma.serviceOption.create({
    data: {
      contractId: targetContractId,
      name: 'Serviço Issue 450 ' + suffix,
      code: 'issue_450_http_service_' + suffix,
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
    await prisma.companyContract.deleteMany({
      where: { id: { in: [contractId, otherContractId] } },
    });
    await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
    await createContract();
    const professor = await createProfessor();
    mockProfessorId = professor.id;
    mockContractId = contractId;
  });

  afterEach(async () => {
    await prisma.companyContract.deleteMany({
      where: { id: { in: [contractId, otherContractId] } },
    });
    await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('preserves the complete administrative projection on immediate POST -> GET', async () => {
    const service = await createService();
    const email = emailPrefix + 'student@example.com';

    const created = await request(app)
      .post('/api/v1/alunos')
      .send({
        name: 'Aluno Issue 450',
        email,
        serviceId: service.id,
        schedulePlan: 'free',
        age: 29,
        intakeForm: {
          formResponses: {
            identification: {
              cpf: '139.513.548-79',
              address: 'Rua Canônica',
              addressNumber: '123',
              neighborhood: 'Centro',
              city: 'Sorocaba',
              state: 'SP',
              zipCode: '18000-000',
              emergencyContactName: 'Contato Seguro',
              emergencyContactPhone: '15999999999',
              emergencyContactRelationship: 'Irmão',
            },
            preferences: {
              preferredTrainingPeriod: 'morning',
            },
            financial: {},
            ahaResponses: {},
          },
        },
      });

    expect(created.status).toBe(201);
    const alunoId = created.body.data?.aluno?.id;
    expect(alunoId).toEqual(expect.any(String));

    const persisted = await prisma.aluno.findUnique({
      where: { id: alunoId },
      select: { contractId: true, serviceId: true },
    });
    expect(persisted).toMatchObject({
      contractId,
      serviceId: service.id,
    });

    const read = await request(app).get('/api/v1/alunos/' + alunoId);

    expect(read.status).toBe(200);
    expect(read.body.data).toMatchObject({
      id: alunoId,
      contractId,
      serviceId: service.id,
      intakeForm: {
        formResponses: {
          identification: {
            cpf: '139.513.548-79',
            address: 'Rua Canônica',
            emergencyContactName: 'Contato Seguro',
          },
          preferences: {
            preferredTrainingPeriod: 'morning',
          },
        },
      },
      parq: {
        state: 'NOT_STARTED',
        latestSubmission: null,
        requiresProfessionalReview: false,
      },
    });
    expect(mockBlockAccessMiddleware).toHaveBeenCalledWith('students.details.summary');

    const firstReadPayload = JSON.stringify(read.body.data);
    for (const forbidden of [
      'parqResponses',
      'questionnaireParq',
      'positiveItems',
      'reviewNotes',
    ]) {
      expect(firstReadPayload).not.toContain(forbidden);
    }

    const legacyFormResponses = {
      identification: {
        cpf: '000.000.000-00',
        address: 'Rua Legada',
        emergencyContactName: 'Contato Legado',
      },
      preferences: {
        preferredTrainingPeriod: 'night',
      },
      parqResponses: { q1: true },
      questionnaireParq: { q1: true },
      questionnaires: {
        parq: { q1: true },
        american: { q1: false },
      },
    };

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'ALTER TABLE "AlunoIntakeForm" DISABLE TRIGGER "AlunoIntakeForm_read_only_after_issue_272"'
      );
      try {
        await tx.alunoIntakeForm.upsert({
          where: { alunoId },
          create: {
            alunoId,
            formResponses: legacyFormResponses,
          },
          update: {
            formResponses: legacyFormResponses,
          },
        });
      } finally {
        await tx.$executeRawUnsafe(
          'ALTER TABLE "AlunoIntakeForm" ENABLE TRIGGER "AlunoIntakeForm_read_only_after_issue_272"'
        );
      }
    });

    const precedenceRead = await request(app).get('/api/v1/alunos/' + alunoId);

    expect(precedenceRead.status).toBe(200);
    expect(precedenceRead.body.data.intakeForm.formResponses).toMatchObject({
      identification: {
        cpf: '139.513.548-79',
        address: 'Rua Canônica',
        emergencyContactName: 'Contato Seguro',
      },
      preferences: {
        preferredTrainingPeriod: 'morning',
      },
      questionnaires: {
        american: { q1: false },
      },
    });
    expect(
      precedenceRead.body.data.intakeForm.formResponses.questionnaires?.parq
    ).toBeUndefined();

    const precedencePayload = JSON.stringify(precedenceRead.body.data);
    for (const forbidden of [
      'parqResponses',
      'questionnaireParq',
      'positiveItems',
      'reviewNotes',
    ]) {
      expect(precedencePayload).not.toContain(forbidden);
    }
  });

  it('keeps cross-tenant reads indistinguishable from a missing student', async () => {
    const service = await createService('issue-450-http-contract', 'cross-tenant');
    const email = emailPrefix + 'cross-tenant-student@example.com';

    const created = await request(app)
      .post('/api/v1/alunos')
      .send({
        name: 'Aluno Isolado Issue 450',
        email,
        serviceId: service.id,
        schedulePlan: 'free',
        age: 31,
      });

    expect(created.status).toBe(201);
    const alunoId = created.body.data?.aluno?.id;
    expect(alunoId).toEqual(expect.any(String));

    await createContract(
      otherContractId,
      '57365610000458',
      'Contrato Issue 450 HTTP Outro'
    );
    const outsider = await createProfessor(otherContractId, 'outsider');
    mockProfessorId = outsider.id;
    mockContractId = otherContractId;

    const response = await request(app).get('/api/v1/alunos/' + alunoId);

    expect(response.status).toBe(404);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(email);
    expect(serialized).not.toContain('Aluno Isolado Issue 450');
  });
});
