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

const companyContractId = 'financial-contract-fallback-company';
const emailPrefix = 'financial-contract-fallback-';

describeDatabase('student financial contract persisted interest fallback with PostgreSQL', () => {
  beforeEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await prisma.companyContract.create({
      data: {
        id: companyContractId,
        type: ContractType.academy,
        document: '32233444000188',
        name: 'Contrato Fallback Financeiro',
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

  it('ignores a supplied link service, follows Aluno.serviceId and repairs a simulated legacy divergence', async () => {
    const [interestService, nextInterestService, untrustedService] = await Promise.all([
      prisma.serviceOption.create({
        data: {
          contractId: companyContractId,
          name: 'Serviço de Interesse Persistido',
          code: 'persisted-interest-service',
        },
      }),
      prisma.serviceOption.create({
        data: {
          contractId: companyContractId,
          name: 'Novo Serviço de Interesse',
          code: 'next-interest-service',
        },
      }),
      prisma.serviceOption.create({
        data: {
          contractId: companyContractId,
          name: 'Serviço Não Confiável do Payload',
          code: 'untrusted-payload-service',
        },
      }),
    ]);

    const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
      data: {
        contractId: companyContractId,
        name: 'Professor',
        code: 'financial-fallback-professor',
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
        profile: { create: { name: 'Aluno Fallback' } },
      },
    });
    const aluno = await prisma.aluno.create({
      data: {
        userId: alunoUser.id,
        professorId: professor.id,
        contractId: professor.contractId,
        serviceId: interestService.id,
        schedulePlan: 'free',
        age: 30,
      },
    });
    await prisma.alunoIntakeForm.create({
      data: {
        alunoId: aluno.id,
        formResponses: {
          financial: {
            currentService: 'valor legado',
            paymentDay: '10',
          },
        },
      },
    });

    const template = await prisma.contractTemplate.create({
      data: {
        contractId: companyContractId,
        name: 'Modelo sem serviço próprio',
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
        serviceId: null,
        status: ContractStatus.SIGNED,
        title: 'Contrato sem serviço próprio',
        renderedHtml: '<p>Contrato sem serviço próprio</p>',
        dataSnapshot: {},
        signedAt: new Date('2026-07-01T12:00:00.000Z'),
      },
    });

    const link = await prisma.studentContract.create({
      data: {
        alunoId: aluno.id,
        contractId: generatedContract.id,
        serviceId: untrustedService.id,
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
    ).toBe(interestService.id);

    await prisma.aluno.update({
      where: { id: aluno.id },
      data: { serviceId: nextInterestService.id },
    });

    const [afterInterestChange, intakeAfterInterestChange] = await Promise.all([
      prisma.studentContract.findUniqueOrThrow({ where: { id: link.id } }),
      prisma.alunoIntakeForm.findUniqueOrThrow({ where: { alunoId: aluno.id } }),
    ]);
    expect(afterInterestChange.serviceId).toBe(nextInterestService.id);
    expect(intakeAfterInterestChange.formResponses).toEqual(
      expect.objectContaining({
        financial: expect.objectContaining({
          currentService: nextInterestService.name,
          paymentDay: '10',
        }),
      })
    );

    await prisma.$executeRawUnsafe(
      'ALTER TABLE "StudentContract" DISABLE TRIGGER "StudentContract_enforce_contract_service_update"'
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "StudentContract" DISABLE TRIGGER "StudentContract_sync_financial_service_update"'
    );
    try {
      await prisma.studentContract.update({
        where: { id: link.id },
        data: { serviceId: untrustedService.id },
      });
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "StudentContract" ENABLE TRIGGER "StudentContract_enforce_contract_service_update"'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "StudentContract" ENABLE TRIGGER "StudentContract_sync_financial_service_update"'
      );
    }
    await prisma.alunoIntakeForm.update({
      where: { alunoId: aluno.id },
      data: {
        formResponses: {
          financial: {
            currentService: 'valor divergente pré-migration',
            paymentDay: '10',
          },
        },
      },
    });

    await prisma.$executeRawUnsafe('SELECT repair_student_contract_service_authority_data()');

    const [afterRepair, intakeAfterRepair] = await Promise.all([
      prisma.studentContract.findUniqueOrThrow({ where: { id: link.id } }),
      prisma.alunoIntakeForm.findUniqueOrThrow({ where: { alunoId: aluno.id } }),
    ]);
    expect(afterRepair.serviceId).toBe(nextInterestService.id);
    expect(intakeAfterRepair.formResponses).toEqual(
      expect.objectContaining({
        financial: expect.objectContaining({
          currentService: nextInterestService.name,
          paymentDay: '10',
        }),
      })
    );

    await prisma.aluno.update({
      where: { id: aluno.id },
      data: { serviceId: null },
    });

    const [afterClear, intakeAfterClear] = await Promise.all([
      prisma.studentContract.findUniqueOrThrow({ where: { id: link.id } }),
      prisma.alunoIntakeForm.findUniqueOrThrow({ where: { alunoId: aluno.id } }),
    ]);
    expect(afterClear.serviceId).toBeNull();
    expect(intakeAfterClear.formResponses).toEqual(
      expect.objectContaining({
        financial: expect.objectContaining({
          currentService: '',
          paymentDay: '10',
        }),
      })
    );
  });
});
