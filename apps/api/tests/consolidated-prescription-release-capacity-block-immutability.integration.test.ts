import { randomUUID } from 'node:crypto';
import { ContractType, PrismaClient, ProfessorRole, UserType } from '@prisma/client';

const runDatabaseIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
if (runDatabaseIntegrationTests) jest.setTimeout(30_000);

const prisma = new PrismaClient();

async function createCapacityVersion(input: {
  contractId: string;
  alunoId: string;
  professorId: string;
  capacity: 'flexibility' | 'balance';
}) {
  const root = await prisma.capacityPrescription.create({
    data: {
      contractId: input.contractId,
      alunoId: input.alunoId,
      capacity: input.capacity,
      status: 'active',
      currentVersion: 1,
      createdByProfessorId: input.professorId,
      updatedByProfessorId: input.professorId,
    },
  });

  const parameters =
    input.capacity === 'flexibility'
      ? {
          type: 'flexibility',
          flexibility: {
            articulations: [{ name: 'Ombro', suggestedPrescription: '3 x 30 s' }],
          },
        }
      : {
          type: 'balance',
          balance: {
            focus: 'estabilidade unipodal',
            supports: ['unipodal'],
          },
        };

  return prisma.capacityPrescriptionVersion.create({
    data: {
      prescriptionId: root.id,
      contractId: input.contractId,
      alunoId: input.alunoId,
      responsibleProfessorId: input.professorId,
      capacity: input.capacity,
      status: 'active',
      version: 1,
      technicalJustification: `Justificativa ${input.capacity}`,
      professorSummary: `Resumo ${input.capacity}`,
      studentMessage: null,
      parameters,
    },
  });
}

async function insertOperationalBlock(input: {
  workoutDayId: string;
  capacityPrescriptionVersionId: string;
  capacity: 'flexibility' | 'balance';
  parameters: Record<string, unknown>;
}) {
  return prisma.$executeRaw`
    INSERT INTO "WorkoutDayCapacityOperationalBlock" (
      "id", "workoutDayId", "capacityPrescriptionVersionId", "capacity",
      "contractVersion", "parameters", "createdAt"
    ) VALUES (
      ${randomUUID()}, ${input.workoutDayId}, ${input.capacityPrescriptionVersionId}, ${input.capacity},
      1, CAST(${JSON.stringify(input.parameters)} AS jsonb), CURRENT_TIMESTAMP
    )
  `;
}

describeDatabase('issue 320 A-007 - structured capacity block historical immutability', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows pre-release publication but rejects late inserts and unrelated capacity contamination after release', async () => {
    const suffix = randomUUID();
    const contractId = `issue-320-a007-${suffix}`;

    await prisma.companyContract.create({
      data: {
        id: contractId,
        type: ContractType.academy,
        document: randomUUID().replace(/-/g, '').slice(0, 14),
        name: 'Issue 320 A-007',
      },
    });

    const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
      data: {
        contractId,
        name: 'Gestor A-007',
        code: `issue-320-a007-${suffix}`,
        isActive: true,
      },
    });

    const professorUser = await prisma.user.create({
      data: {
        email: `issue-320-a007-prof-${suffix}@example.com`,
        passwordHash: 'test-hash',
        type: UserType.professor,
        profile: { create: { name: 'Professor A-007' } },
      },
    });
    const professor = await prisma.professor.create({
      data: {
        userId: professorUser.id,
        contractId,
        collaboratorFunctionId: collaboratorFunction.id,
        role: ProfessorRole.master,
      },
    });

    const alunoUser = await prisma.user.create({
      data: {
        email: `issue-320-a007-aluno-${suffix}@example.com`,
        passwordHash: 'test-hash',
        type: UserType.aluno,
        profile: { create: { name: 'Aluno A-007' } },
      },
    });
    const aluno = await prisma.aluno.create({
      data: {
        userId: alunoUser.id,
        professorId: professor.id,
        contractId,
        schedulePlan: 'free',
        age: 35,
      },
    });

    const plan = await prisma.trainingPlan.create({
      data: {
        professorId: professor.id,
        alunoId: aluno.id,
        name: 'Plano A-007',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      },
    });

    const flexibility = await createCapacityVersion({
      contractId,
      alunoId: aluno.id,
      professorId: professor.id,
      capacity: 'flexibility',
    });
    const balance = await createCapacityVersion({
      contractId,
      alunoId: aluno.id,
      professorId: professor.id,
      capacity: 'balance',
    });

    const assembly = await prisma.consolidatedPrescription.create({
      data: {
        contractId,
        alunoId: aluno.id,
        currentVersion: 2,
        currentStatus: 'released',
        createdByProfessorId: professor.id,
        updatedByProfessorId: professor.id,
      },
    });
    const source = await prisma.consolidatedPrescriptionVersion.create({
      data: {
        assemblyId: assembly.id,
        contractId,
        alunoId: aluno.id,
        version: 1,
        status: 'approved',
        responsibleProfessorId: professor.id,
        professorJustification: 'Versão aprovada para A-007.',
        approvedByProfessorId: professor.id,
        approvedAt: new Date('2026-08-13T12:00:00.000Z'),
        createdByProfessorId: professor.id,
        conflicts: [],
      },
    });
    const released = await prisma.consolidatedPrescriptionVersion.create({
      data: {
        assemblyId: assembly.id,
        contractId,
        alunoId: aluno.id,
        version: 2,
        previousVersionId: source.id,
        status: 'released',
        responsibleProfessorId: professor.id,
        professorJustification: source.professorJustification,
        approvedByProfessorId: professor.id,
        approvedAt: source.approvedAt,
        createdByProfessorId: professor.id,
        conflicts: [],
      },
    });

    await prisma.consolidatedPrescriptionCapacityBlock.create({
      data: {
        assemblyVersionId: source.id,
        contractId,
        alunoId: aluno.id,
        capacityPrescriptionVersionId: flexibility.id,
        capacity: 'flexibility',
        capacityVersion: 1,
        capacityStatus: 'active',
        position: 0,
      },
    });

    const template = await prisma.workoutTemplate.create({
      data: {
        planId: plan.id,
        mesocycleNumber: 1,
        weekNumber: 1,
        weekStartDate: new Date('2026-08-17T00:00:00.000Z'),
        released: false,
      },
    });
    const dayOne = await prisma.workoutDay.create({
      data: {
        templateId: template.id,
        dayOfWeek: 1,
        workoutDate: new Date('2026-08-17T00:00:00.000Z'),
      },
    });
    const dayTwo = await prisma.workoutDay.create({
      data: {
        templateId: template.id,
        dayOfWeek: 2,
        workoutDate: new Date('2026-08-18T00:00:00.000Z'),
      },
    });

    const flexibilityParameters = {
      articulations: [{ name: 'Ombro', suggestedPrescription: '3 x 30 s' }],
    };
    const balanceParameters = {
      focus: 'estabilidade unipodal',
      supports: ['unipodal'],
    };

    await expect(
      insertOperationalBlock({
        workoutDayId: dayOne.id,
        capacityPrescriptionVersionId: flexibility.id,
        capacity: 'flexibility',
        parameters: flexibilityParameters,
      })
    ).resolves.toBe(1);

    const releasedAt = new Date('2026-08-13T19:50:00.000Z');
    await prisma.$executeRaw`
      INSERT INTO "ConsolidatedPrescriptionOperationalRelease" (
        "id", "assemblyId", "sourceAssemblyVersionId", "sourceAssemblyVersion",
        "releasedAssemblyVersionId", "releasedAssemblyVersion", "contractId", "alunoId",
        "trainingPlanId", "workoutTemplateId", "requestFingerprint",
        "releasedByProfessorId", "releasedAt", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${assembly.id}, ${source.id}, 1,
        ${released.id}, 2, ${contractId}, ${aluno.id},
        ${plan.id}, ${template.id}, ${randomUUID()},
        ${professor.id}, ${releasedAt}, ${releasedAt}
      )
    `;
    await prisma.workoutTemplate.update({
      where: { id: template.id },
      data: { released: true, releasedAt },
    });

    await expect(
      insertOperationalBlock({
        workoutDayId: dayTwo.id,
        capacityPrescriptionVersionId: flexibility.id,
        capacity: 'flexibility',
        parameters: flexibilityParameters,
      })
    ).rejects.toThrow('consolidated released workout cannot receive new structured capacity blocks');

    await expect(
      insertOperationalBlock({
        workoutDayId: dayTwo.id,
        capacityPrescriptionVersionId: balance.id,
        capacity: 'balance',
        parameters: balanceParameters,
      })
    ).rejects.toThrow('consolidated released workout cannot receive new structured capacity blocks');

    const blocks = await prisma.$queryRaw<Array<{ capacity: string; workoutDayId: string }>>`
      SELECT "capacity", "workoutDayId"
      FROM "WorkoutDayCapacityOperationalBlock"
      WHERE "workoutDayId" IN (${dayOne.id}, ${dayTwo.id})
      ORDER BY "workoutDayId", "capacity"
    `;
    expect(blocks).toEqual([{ capacity: 'flexibility', workoutDayId: dayOne.id }]);
  });
});
