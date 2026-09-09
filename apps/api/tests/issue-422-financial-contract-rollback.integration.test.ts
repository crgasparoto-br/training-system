import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import { studentFinancialContractService } from '../src/modules/alunos/student-financial-contract.service.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const companyContractId = 'issue-422-rollback-company';
const emailPrefix = 'issue-422-rollback-';
const triggerName = 'test_issue_422_fail_student_contract_insert';
const triggerFunctionName = 'test_issue_422_fail_student_contract_insert_fn';

let professorId: string;
let templateId: string;

async function dropInjectedFailure() {
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS "${triggerName}" ON "StudentContract"`
  );
  await prisma.$executeRawUnsafe(
    `DROP FUNCTION IF EXISTS "${triggerFunctionName}"()`
  );
}

async function seedFixture() {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: companyContractId,
      name: 'Professor',
      code: 'issue-422-rollback-professor',
      isActive: true,
    },
  });
  const professorUser = await prisma.user.create({
    data: {
      email: `${emailPrefix}professor@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: 'Professor Rollback 422' } },
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
      name: 'Modelo rollback Issue 422',
      version: 1,
      status: 'ACTIVE',
      headerHtml: '',
      footerHtml: '',
    },
  });

  professorId = professor.id;
  templateId = template.id;
}

describeDatabase('Issue 422 create-with-contract persistent rollback', () => {
  beforeEach(async () => {
    await dropInjectedFailure();
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await prisma.companyContract.create({
      data: {
        id: companyContractId,
        type: ContractType.academy,
        document: '57365610000490',
        name: 'Issue 422 Rollback',
      },
    });
    await seedFixture();
  });

  afterEach(async () => {
    await dropInjectedFailure();
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rolls back User, Aluno, generated Contract and StudentContract when the link insert fails', async () => {
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "${triggerFunctionName}"()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'injected issue 422 student contract link failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT ON "StudentContract"
      FOR EACH ROW EXECUTE FUNCTION "${triggerFunctionName}"()
    `);

    const studentEmail = `${emailPrefix}student@example.com`;

    await expect(
      studentFinancialContractService.createAlunoWithContract(
        {
          name: 'Aluno Rollback 422',
          email: studentEmail,
          professorId,
          schedulePlan: 'free',
          age: 30,
        },
        { contractId: `template:${templateId}` },
        { professorId, companyContractId }
      )
    ).rejects.toThrow('injected issue 422 student contract link failure');

    expect(await prisma.user.findUnique({ where: { email: studentEmail } })).toBeNull();
    expect(await prisma.aluno.count({ where: { contractId: companyContractId } })).toBe(0);
    expect(
      await prisma.studentOnboardingProcess.count({
        where: { contractId: companyContractId },
      })
    ).toBe(0);
    expect(
      await prisma.contract.count({
        where: { companyContractId, templateId },
      })
    ).toBe(0);
    expect(
      await prisma.studentContract.count({
        where: { aluno: { contractId: companyContractId } },
      })
    ).toBe(0);
  });
});
