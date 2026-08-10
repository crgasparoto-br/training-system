import {
  ContractStatus,
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const companyContractId = 'financial-contract-authority-company';
const emailPrefix = 'financial-contract-authority-';

describeDatabase('student financial contract authority with PostgreSQL', () => {
  beforeEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await prisma.companyContract.create({
      data: {
        id: companyContractId,
        type: ContractType.academy,
        document: '31122333000199',
        name: 'Contrato Autoridade Financeira',
      },
    });
  });

  afterEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('uses GeneratedContract.serviceId without writing the historical intake table', async () => {
    const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
      data: {
        contractId: companyContractId,
        name: 'Professor',
        code: 'financial-authority-professor',
      },
    });
    const professorUser = await prisma.user.create({
      data: {
        email: `${emailPrefix}professor@example.com`,
        passwordHash: 'test-hash',
        type: UserType.professor,
        profile: { create: { name: 'Professor Financeiro' } },
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
    const alunoUser = await prisma.user.create({
      data: {
        email: `${emailPrefix}aluno@example.com`,
        passwordHash: 'test-hash',
        type: UserType.aluno,
        profile: { create: { name: 'Aluno Financeiro' } },
      },
    });
    const aluno = await prisma.aluno.create({
      data: {
        userId: alunoUser.id,
        professorId: professor.id,
        contractId: professor.contractId,
        schedulePlan: 'free',
        age: 30,
      },
    });

    await expect(
      prisma.alunoIntakeForm.create({
        data: {
          alunoId: aluno.id,
          formResponses: { financial: { currentService: 'valor legado' } },
        },
      })
    ).rejects.toThrow(/read-only after issue #272 cutover/u);

    const interestService = await prisma.serviceOption.create({
      data: {
        contractId: companyContractId,
        name: 'Serviço de Interesse',
        code: 'interest-service',
      },
    });
    const contractService = await prisma.serviceOption.create({
      data: {
        contractId: companyContractId,
        name: 'Oferta Financeira do Contrato',
        code: 'contract-service',
      },
    });
    const template = await prisma.contractTemplate.create({
      data: {
        contractId: companyContractId,
        name: 'Modelo Financeiro',
        version: 1,
        status: 'ACTIVE',
        headerHtml: '',
        footerHtml: '',
      },
    });
    const generatedContract = await prisma.contract.create({
      data: {
        companyContractId,
        templateId: template.id,
        templateVersion: 1,
        alunoId: aluno.id,
        professorId: professor.id,
        serviceId: contractService.id,
        status: ContractStatus.SIGNED,
        title: 'Contrato Financeiro',
        renderedHtml: '<p>Contrato Financeiro</p>',
        dataSnapshot: {},
        signedAt: new Date('2026-07-01T12:00:00.000Z'),
      },
    });

    const link = await prisma.studentContract.create({
      data: {
        alunoId: aluno.id,
        contractId: generatedContract.id,
        serviceId: interestService.id,
        status: 'active',
        startDate: new Date('2026-07-01T12:00:00.000Z'),
        signedAt: new Date('2026-07-01T12:00:00.000Z'),
      },
    });
    await prisma.aluno.update({
      where: { id: aluno.id },
      data: { currentStudentContractId: link.id },
    });

    expect(
      (
        await prisma.studentContract.findUniqueOrThrow({
          where: { id: link.id },
        })
      ).serviceId
    ).toBe(contractService.id);

    await prisma.studentContract.update({
      where: { id: link.id },
      data: { serviceId: interestService.id },
    });
    expect(
      (
        await prisma.studentContract.findUniqueOrThrow({
          where: { id: link.id },
        })
      ).serviceId
    ).toBe(contractService.id);

    await prisma.contract.update({
      where: { id: generatedContract.id },
      data: { serviceId: interestService.id },
    });

    expect(
      (
        await prisma.studentContract.findUniqueOrThrow({
          where: { id: link.id },
        })
      ).serviceId
    ).toBe(interestService.id);
    expect(await prisma.alunoIntakeForm.findUnique({ where: { alunoId: aluno.id } })).toBeNull();
  });
});
