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

const companyContractId = 'terminal-current-service-company';
const emailPrefix = 'terminal-current-service-';

describeDatabase('student contract terminal current service with PostgreSQL', () => {
  beforeEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: companyContractId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await prisma.companyContract.create({
      data: {
        id: companyContractId,
        type: ContractType.academy,
        document: '34455666000177',
        name: 'Contrato Serviço Terminal',
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

  it('moves currentService to the prepared replacement and clears it after the last terminal transition', async () => {
    const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
      data: {
        contractId: companyContractId,
        name: 'Professor',
        code: 'terminal-current-service-professor',
      },
    });
    const professorUser = await prisma.user.create({
      data: {
        email: `${emailPrefix}professor@example.com`,
        passwordHash: 'test-hash',
        type: UserType.professor,
        profile: { create: { name: 'Professor Terminal' } },
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
        profile: { create: { name: 'Aluno Terminal' } },
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

    const [activeService, replacementService] = await Promise.all([
      prisma.serviceOption.create({
        data: {
          contractId: companyContractId,
          name: 'Serviço Vigente',
          code: 'terminal-active-service',
        },
      }),
      prisma.serviceOption.create({
        data: {
          contractId: companyContractId,
          name: 'Serviço Substituto',
          code: 'terminal-replacement-service',
        },
      }),
    ]);
    const template = await prisma.contractTemplate.create({
      data: {
        contractId: companyContractId,
        name: 'Modelo Terminal',
        version: 1,
        status: 'ACTIVE',
        headerHtml: '',
        footerHtml: '',
      },
    });
    const [activeDocument, replacementDocument] = await Promise.all([
      prisma.contract.create({
        data: {
          companyContractId,
          templateId: template.id,
          templateVersion: 1,
          alunoId: aluno.id,
          professorId: professor.id,
          serviceId: activeService.id,
          status: ContractStatus.SIGNED,
          title: 'Contrato vigente',
          renderedHtml: '<p>Contrato vigente</p>',
          dataSnapshot: {},
          signedAt: new Date('2026-07-01T12:00:00.000Z'),
        },
      }),
      prisma.contract.create({
        data: {
          companyContractId,
          templateId: template.id,
          templateVersion: 1,
          alunoId: aluno.id,
          professorId: professor.id,
          serviceId: replacementService.id,
          status: ContractStatus.SENT,
          title: 'Contrato substituto',
          renderedHtml: '<p>Contrato substituto</p>',
          dataSnapshot: {},
        },
      }),
    ]);

    const activeLink = await prisma.studentContract.create({
      data: {
        alunoId: aluno.id,
        contractId: activeDocument.id,
        serviceId: activeService.id,
        status: 'active',
        startDate: new Date('2026-07-01T12:00:00.000Z'),
        signedAt: new Date('2026-07-01T12:00:00.000Z'),
      },
    });
    await prisma.aluno.update({
      where: { id: aluno.id },
      data: { currentStudentContractId: activeLink.id },
    });
    const replacementLink = await prisma.studentContract.create({
      data: {
        alunoId: aluno.id,
        contractId: replacementDocument.id,
        serviceId: replacementService.id,
        status: 'pending_signature',
        startDate: new Date('2026-08-01T12:00:00.000Z'),
      },
    });

    const intakeWhileActive = await prisma.alunoIntakeForm.findUniqueOrThrow({
      where: { alunoId: aluno.id },
    });
    expect(intakeWhileActive.formResponses).toEqual(
      expect.objectContaining({
        financial: expect.objectContaining({
          currentService: activeService.name,
          paymentDay: '10',
        }),
      })
    );

    await prisma.studentContract.update({
      where: { id: activeLink.id },
      data: { status: 'canceled' },
    });

    const intakeAfterActiveCancellation =
      await prisma.alunoIntakeForm.findUniqueOrThrow({
        where: { alunoId: aluno.id },
      });
    expect(intakeAfterActiveCancellation.formResponses).toEqual(
      expect.objectContaining({
        financial: expect.objectContaining({
          currentService: replacementService.name,
          paymentDay: '10',
        }),
      })
    );

    await prisma.studentContract.update({
      where: { id: replacementLink.id },
      data: { status: 'canceled' },
    });

    const intakeAfterLastCancellation =
      await prisma.alunoIntakeForm.findUniqueOrThrow({
        where: { alunoId: aluno.id },
      });
    expect(intakeAfterLastCancellation.formResponses).toEqual(
      expect.objectContaining({
        financial: expect.objectContaining({
          currentService: '',
          paymentDay: '10',
        }),
      })
    );
  });
});
