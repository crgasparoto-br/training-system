import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import { contractAuthoritativeGenerationService } from '../src/modules/contracts/contract-authoritative-generation.service.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const companyContractId = 'authoritative-generation-company';
const emailPrefix = 'authoritative-generation-';

async function seedBase() {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: companyContractId,
      name: 'Professor',
      code: 'authoritative-generation-professor',
    },
  });
  const professorUser = await prisma.user.create({
    data: {
      email: `${emailPrefix}professor@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: 'Professor Geração Autoritativa' } },
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
          name: 'Aluno Geração Autoritativa',
          cpf: '12345678901',
        },
      },
    },
  });
  const [templateService, interestService, injectedService] = await Promise.all([
    prisma.serviceOption.create({
      data: {
        contractId: companyContractId,
        name: 'Serviço do Modelo',
        code: 'authoritative-template-service',
        monthlyPrice: 300,
      },
    }),
    prisma.serviceOption.create({
      data: {
        contractId: companyContractId,
        name: 'Serviço de Interesse',
        code: 'authoritative-interest-service',
        monthlyPrice: 200,
      },
    }),
    prisma.serviceOption.create({
      data: {
        contractId: companyContractId,
        name: 'Serviço Injetado',
        code: 'authoritative-injected-service',
        monthlyPrice: 100,
      },
    }),
  ]);
  const aluno = await prisma.aluno.create({
    data: {
      userId: alunoUser.id,
      professorId: professor.id,
      serviceId: interestService.id,
      schedulePlan: 'free',
      age: 29,
    },
  });
  const template = await prisma.contractTemplate.create({
    data: {
      contractId: companyContractId,
      name: 'Modelo Geração Autoritativa',
      version: 1,
      status: 'ACTIVE',
      serviceId: templateService.id,
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

  return {
    professor,
    aluno,
    template,
    templateService,
    interestService,
    injectedService,
  };
}

describeDatabase('authoritative direct contract generation with PostgreSQL', () => {
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS "test_fail_authoritative_generation" ON "StudentContract"'
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS "test_fail_authoritative_generation_insert"()'
    );
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await prisma.companyContract.create({
      data: {
        id: companyContractId,
        type: ContractType.academy,
        document: '66778899000122',
        name: 'Contrato Geração Autoritativa',
      },
    });
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS "test_fail_authoritative_generation" ON "StudentContract"'
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS "test_fail_authoritative_generation_insert"()'
    );
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ignores payload service and atomically persists the template service in document, link and audit', async () => {
    const fixture = await seedBase();

    const generated = await contractAuthoritativeGenerationService.generate(
      companyContractId,
      {
        templateId: fixture.template.id,
        alunoId: fixture.aluno.id,
        professorId: fixture.professor.id,
        serviceId: fixture.injectedService.id,
        dataInicio: new Date('2026-08-01T12:00:00.000Z'),
      },
      { userId: professorUserId(fixture.professor.userId) }
    );

    const [document, link, audits] = await Promise.all([
      prisma.contract.findUniqueOrThrow({ where: { id: generated.id } }),
      prisma.studentContract.findUniqueOrThrow({ where: { contractId: generated.id } }),
      prisma.contractAuditLog.findMany({ where: { contractId: generated.id } }),
    ]);

    expect(document.serviceId).toBe(fixture.templateService.id);
    expect(document.serviceId).not.toBe(fixture.injectedService.id);
    expect(link.serviceId).toBe(fixture.templateService.id);
    expect(link.status).toBe('draft');
    expect(audits).toEqual([
      expect.objectContaining({ action: 'GENERATED' }),
    ]);
  });

  it('rolls back the generated document and audit when StudentContract persistence fails', async () => {
    const fixture = await seedBase();

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "test_fail_authoritative_generation_insert"()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."alunoId" = '${fixture.aluno.id}' THEN
          RAISE EXCEPTION 'injected student contract generation failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "test_fail_authoritative_generation"
      BEFORE INSERT ON "StudentContract"
      FOR EACH ROW EXECUTE FUNCTION "test_fail_authoritative_generation_insert"()
    `);

    await expect(
      contractAuthoritativeGenerationService.generate(companyContractId, {
        templateId: fixture.template.id,
        alunoId: fixture.aluno.id,
        professorId: fixture.professor.id,
      })
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

function professorUserId(value: string) {
  return value;
}
