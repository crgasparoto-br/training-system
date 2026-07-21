import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import { studentContractService } from '../src/modules/student-contracts/student-contract.service.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const companyContractId = 'template-consistency-company';
const emailPrefix = 'template-consistency-';

async function seedBase() {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: companyContractId,
      name: 'Professor',
      code: 'template-consistency-professor',
      isActive: true,
    },
  });
  const professorUser = await prisma.user.create({
    data: {
      email: `${emailPrefix}professor@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: 'Professor Consistência' } },
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
      profile: {
        create: {
          name: 'Aluno Consistência',
          cpf: '12345678901',
        },
      },
    },
  });
  const [interestService, replacementService] = await Promise.all([
    prisma.serviceOption.create({
      data: {
        contractId: companyContractId,
        name: 'Serviço de Interesse Inicial',
        code: 'template-consistency-interest',
        monthlyPrice: 200,
      },
    }),
    prisma.serviceOption.create({
      data: {
        contractId: companyContractId,
        name: 'Serviço de Interesse Atualizado',
        code: 'template-consistency-replacement',
        monthlyPrice: 250,
      },
    }),
  ]);
  const aluno = await prisma.aluno.create({
    data: {
      userId: alunoUser.id,
      professorId: professor.id,
      contractId: professor.contractId,
      serviceId: interestService.id,
      schedulePlan: 'free',
      age: 31,
    },
  });
  const template = await prisma.contractTemplate.create({
    data: {
      contractId: companyContractId,
      name: 'Modelo sem serviço próprio',
      version: 1,
      status: 'ACTIVE',
      serviceId: null,
      headerHtml: '<p>{{empresa.razaoSocial}}</p>',
      footerHtml: '',
      clauses: {
        create: {
          order: 1,
          title: 'Objeto',
          bodyHtml: '<p>{{aluno.nome}} - {{servico.nome}}</p>',
        },
      },
    },
  });

  return { aluno, template, interestService, replacementService };
}

describeDatabase('template contract consistency with PostgreSQL', () => {
  beforeEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await prisma.companyContract.create({
      data: {
        id: companyContractId,
        type: ContractType.academy,
        document: '55667788000144',
        name: 'Contrato Consistência de Modelo',
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

  it('preserves endDate and keeps the document service null while the link follows aluno service changes', async () => {
    const fixture = await seedBase();
    const endDate = new Date('2027-07-31T12:00:00.000Z');

    const link = await studentContractService.linkExistingContract(
      {
        alunoId: fixture.aluno.id,
        contractId: `template:${fixture.template.id}`,
        startDate: new Date('2026-08-01T12:00:00.000Z'),
        endDate,
        status: 'draft',
      },
      { companyContractId }
    );

    const document = await prisma.contract.findUniqueOrThrow({
      where: { id: link.contractId },
    });

    expect(document.serviceId).toBeNull();
    expect(link.serviceId).toBe(fixture.interestService.id);
    expect(link.endDate?.toISOString()).toBe(endDate.toISOString());

    await prisma.aluno.update({
      where: { id: fixture.aluno.id },
      data: { serviceId: fixture.replacementService.id },
    });

    const propagated = await prisma.studentContract.findUniqueOrThrow({
      where: { id: link.id },
    });
    expect(propagated.serviceId).toBe(fixture.replacementService.id);
  });

  it('rejects unsupported terminal or pending states instead of silently creating a draft', async () => {
    const fixture = await seedBase();

    await expect(
      studentContractService.linkExistingContract(
        {
          alunoId: fixture.aluno.id,
          contractId: `template:${fixture.template.id}`,
          status: 'pending_signature',
        },
        { companyContractId }
      )
    ).rejects.toThrow('Estado não suportado para geração de contrato por modelo');

    expect(
      await prisma.contract.count({
        where: {
          companyContractId,
          alunoId: fixture.aluno.id,
          templateId: fixture.template.id,
        },
      })
    ).toBe(0);
    expect(
      await prisma.studentContract.count({ where: { alunoId: fixture.aluno.id } })
    ).toBe(0);
  });
});