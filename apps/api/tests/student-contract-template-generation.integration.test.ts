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

const companyContractId = 'template-link-generation-company';
const emailPrefix = 'template-link-generation-';

async function seedBase() {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: companyContractId,
      name: 'Professor',
      code: 'template-link-generation-professor',
    },
  });
  const professorUser = await prisma.user.create({
    data: {
      email: `${emailPrefix}professor@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: 'Professor Vínculo por Modelo' } },
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
          name: 'Aluno Vínculo por Modelo',
          cpf: '12345678901',
        },
      },
    },
  });
  const service = await prisma.serviceOption.create({
    data: {
      contractId: companyContractId,
      name: 'Serviço do Modelo',
      code: 'template-link-generation-service',
      monthlyPrice: 350,
    },
  });
  const aluno = await prisma.aluno.create({
    data: {
      userId: alunoUser.id,
      professorId: professor.id,
      schedulePlan: 'free',
      age: 30,
    },
  });
  const template = await prisma.contractTemplate.create({
    data: {
      contractId: companyContractId,
      name: 'Modelo para Vínculo Atômico',
      version: 1,
      status: 'ACTIVE',
      serviceId: service.id,
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

  return { aluno, template, service };
}

describeDatabase('student contract generation from active template with PostgreSQL', () => {
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS "test_fail_template_link_generation" ON "StudentContract"'
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS "test_fail_template_link_generation_insert"()'
    );
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await prisma.companyContract.create({
      data: {
        id: companyContractId,
        type: ContractType.academy,
        document: '33445566000199',
        name: 'Contrato Vínculo por Modelo',
      },
    });
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS "test_fail_template_link_generation" ON "StudentContract"'
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS "test_fail_template_link_generation_insert"()'
    );
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists document, link and audit through the authoritative transaction', async () => {
    const fixture = await seedBase();

    const link = await studentContractService.linkExistingContract(
      {
        alunoId: fixture.aluno.id,
        contractId: `template:${fixture.template.id}`,
        serviceId: 'untrusted-service-id',
        startDate: new Date('2026-08-01T12:00:00.000Z'),
        amount: 350,
        paymentDay: 10,
      },
      { companyContractId }
    );

    const [document, audits] = await Promise.all([
      prisma.contract.findUniqueOrThrow({ where: { id: link.contractId } }),
      prisma.contractAuditLog.findMany({ where: { contractId: link.contractId } }),
    ]);

    expect(document.serviceId).toBe(fixture.service.id);
    expect(link.serviceId).toBe(fixture.service.id);
    expect(link.status).toBe('draft');
    expect(audits).toEqual([
      expect.objectContaining({ action: 'GENERATED' }),
    ]);
  });

  it('rolls back document and audit when the template link cannot be persisted', async () => {
    const fixture = await seedBase();

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "test_fail_template_link_generation_insert"()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."alunoId" = '${fixture.aluno.id}' THEN
          RAISE EXCEPTION 'injected template link generation failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "test_fail_template_link_generation"
      BEFORE INSERT ON "StudentContract"
      FOR EACH ROW EXECUTE FUNCTION "test_fail_template_link_generation_insert"()
    `);

    await expect(
      studentContractService.linkExistingContract(
        {
          alunoId: fixture.aluno.id,
          contractId: `template:${fixture.template.id}`,
        },
        { companyContractId }
      )
    ).rejects.toThrow();

    expect(
      await prisma.contract.count({
        where: {
          companyContractId,
          alunoId: fixture.aluno.id,
          title: fixture.template.name,
        },
      })
    ).toBe(0);
    expect(
      await prisma.studentContract.count({ where: { alunoId: fixture.aluno.id } })
    ).toBe(0);
    expect(
      await prisma.contractAuditLog.count({
        where: { contract: { companyContractId } },
      })
    ).toBe(0);
  });
});
