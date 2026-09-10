import express from 'express';
import { ContractType, PrismaClient, ProfessorRole, UserType } from '@prisma/client';

const request = require('supertest');

const runDatabaseIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const companyContractId = 'issue-425-public-boundary-company';
const emailPrefix = 'issue-425-public-boundary-';
const triggerName = 'test_issue_425_public_boundary_failure';
const triggerFunctionName = 'test_issue_425_public_boundary_failure_fn';

let professorId: string;
let templateId: string;

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: 'issue-425-public-boundary-user',
      email: 'professor@example.com',
      type: 'professor',
      professorId,
      professorRole: 'master',
      contractId: companyContractId,
    };
    next();
  },
  professorMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../src/modules/access-control/access-control.middleware', () => ({
  blockAccessMiddleware: jest.fn(
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
  ),
}));

const router = require('../src/modules/alunos/student-financial-contract.routes').default;

async function dropInjectedFailure() {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "StudentContract"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${triggerFunctionName}"()`);
}

async function seedFixture() {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: companyContractId,
      name: 'Professor',
      code: 'issue-425-public-boundary-professor',
      isActive: true,
    },
  });
  const professorUser = await prisma.user.create({
    data: {
      email: `${emailPrefix}professor@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: 'Professor Public Boundary 425' } },
    },
  });
  const professor = await prisma.professor.create({
    data: {
      userId: professorUser.id,
      contractId: companyContractId,
      collaboratorFunctionId: collaboratorFunction.id,
      role: ProfessorRole.master,
    },
  });
  const template = await prisma.contractTemplate.create({
    data: {
      contractId: companyContractId,
      name: 'Modelo public boundary Issue 425',
      version: 1,
      status: 'ACTIVE',
      headerHtml: '',
      footerHtml: '',
    },
  });

  professorId = professor.id;
  templateId = template.id;
}

describeDatabase('Issue 425 atomic create public boundary rollback', () => {
  const app = express();
  app.use(express.json());
  app.use('/alunos', router);

  beforeEach(async () => {
    await dropInjectedFailure();
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
    await prisma.companyContract.create({
      data: {
        id: companyContractId,
        type: ContractType.academy,
        document: '57365610000491',
        name: 'Issue 425 Public Boundary',
      },
    });
    await seedFixture();
  });

  afterEach(async () => {
    await dropInjectedFailure();
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('PB-ERR-001 returns a generic correlatable 5xx and rolls back all writes on P0001', async () => {
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "${triggerFunctionName}"()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'fingerprint=pb-secret idempotencyKey=pb-key amount=1234.56'
          USING ERRCODE = 'P0001';
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT ON "StudentContract"
      FOR EACH ROW EXECUTE FUNCTION "${triggerFunctionName}"()
    `);

    const studentEmail = `${emailPrefix}student@example.com`;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(app).post('/alunos/financial-contract').send({
      profile: {
        name: 'Aluno Public Boundary 425',
        email: studentEmail,
        schedulePlan: 'free',
        age: 30,
      },
      contract: { contractId: `template:${templateId}` },
    });

    const serialized = JSON.stringify(response.body);
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Erro ao criar aluno');
    expect(response.body.details).toMatchObject({ code: 'ALUNO_CREATE_INTERNAL_ERROR' });
    expect(typeof response.body.details.correlationId).toBe('string');
    expect(serialized).not.toContain('P0001');
    expect(serialized).not.toContain('fingerprint');
    expect(serialized).not.toContain('idempotencyKey');
    expect(serialized).not.toContain('1234.56');

    expect(await prisma.user.findUnique({ where: { email: studentEmail } })).toBeNull();
    expect(await prisma.aluno.count({ where: { contractId: companyContractId } })).toBe(0);
    expect(await prisma.studentOnboardingProcess.count({ where: { contractId: companyContractId } })).toBe(0);
    expect(await prisma.contract.count({ where: { companyContractId, templateId } })).toBe(0);
    expect(
      await prisma.studentContract.count({ where: { aluno: { contractId: companyContractId } } })
    ).toBe(0);

    consoleError.mockRestore();
  });
});
