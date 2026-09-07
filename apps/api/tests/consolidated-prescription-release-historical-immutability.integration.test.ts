import { randomUUID } from 'node:crypto';
import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
  WorkoutDayStatus,
} from '@prisma/client';

const runDatabaseIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
if (runDatabaseIntegrationTests) jest.setTimeout(30_000);

const prisma = new PrismaClient();

type ReleasedWorkoutFixture = {
  templateId: string;
  dayId: string;
  exerciseId: string;
  exerciseLibraryId: string;
};

async function seedReleasedWorkout(label: string): Promise<ReleasedWorkoutFixture> {
  const suffix = `${label}-${randomUUID()}`;
  const contractId = `issue-320-immutable-${suffix}`;

  await prisma.companyContract.create({
    data: {
      id: contractId,
      type: ContractType.academy,
      document: randomUUID().replace(/-/g, '').slice(0, 14),
      name: `Issue 320 immutability ${label}`,
    },
  });

  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Gestor de teste',
      code: `issue-320-immutable-manager-${randomUUID()}`,
      isActive: true,
    },
  });

  const professorUser = await prisma.user.create({
    data: {
      email: `issue-320-immutable-prof-${randomUUID()}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: `Professor ${label}` } },
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
      email: `issue-320-immutable-aluno-${randomUUID()}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.aluno,
      profile: { create: { name: `Aluno ${label}` } },
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
      name: `Plano ${label}`,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
    },
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
      professorJustification: 'Versão aprovada para teste de imutabilidade.',
      approvedByProfessorId: professor.id,
      approvedAt: new Date('2026-08-12T12:00:00.000Z'),
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

  const template = await prisma.workoutTemplate.create({
    data: {
      planId: plan.id,
      mesocycleNumber: 1,
      weekNumber: 1,
      weekStartDate: new Date('2026-08-17T00:00:00.000Z'),
      trainingMethod: 'combined',
      released: false,
    },
  });
  const day = await prisma.workoutDay.create({
    data: {
      templateId: template.id,
      dayOfWeek: 1,
      workoutDate: new Date('2026-08-17T00:00:00.000Z'),
      method: 'continuous',
      detailNotes: 'snapshot liberado',
    },
  });
  const exerciseLibrary = await prisma.exerciseLibrary.create({
    data: {
      contractId,
      name: `Agachamento ${label}`,
    },
  });
  const exercise = await prisma.workoutExercise.create({
    data: {
      workoutDayId: day.id,
      exerciseId: exerciseLibrary.id,
      section: 'principal',
      exerciseOrder: 1,
      sets: 3,
      reps: 10,
    },
  });

  const releasedAt = new Date('2026-08-13T00:30:00.000Z');
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

  // The definitive release path inserts the ledger before it flips these two fields.
  // The database guard must allow exactly this publication transition.
  await prisma.workoutTemplate.update({
    where: { id: template.id },
    data: { released: true, releasedAt },
  });

  return {
    templateId: template.id,
    dayId: day.id,
    exerciseId: exercise.id,
    exerciseLibraryId: exerciseLibrary.id,
  };
}

describeDatabase('consolidated released workout historical immutability - issue 320', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('bloqueia writers de template/dia após release e preserva apenas lifecycle/feedback de execução', async () => {
    const fixture = await seedReleasedWorkout('template-day');

    await expect(
      prisma.workoutTemplate.update({
        where: { id: fixture.templateId },
        data: { trainingMethod: 'tampered' },
      })
    ).rejects.toThrow();
    await expect(
      prisma.workoutTemplate.update({
        where: { id: fixture.templateId },
        data: { released: false, releasedAt: null },
      })
    ).rejects.toThrow();
    await expect(prisma.workoutTemplate.delete({ where: { id: fixture.templateId } })).rejects.toThrow();

    await expect(
      prisma.workoutDay.update({
        where: { id: fixture.dayId },
        data: { detailNotes: 'conteúdo alterado depois do release' },
      })
    ).rejects.toThrow();
    await expect(
      prisma.workoutDay.create({
        data: {
          templateId: fixture.templateId,
          dayOfWeek: 2,
          workoutDate: new Date('2026-08-18T00:00:00.000Z'),
        },
      })
    ).rejects.toThrow();
    await expect(prisma.workoutDay.delete({ where: { id: fixture.dayId } })).rejects.toThrow();

    const executionState = await prisma.workoutDay.update({
      where: { id: fixture.dayId },
      data: {
        status: WorkoutDayStatus.in_progress,
        startedAt: new Date('2026-08-17T10:00:00.000Z'),
        psrResponse: 4,
        pseResponse: 5,
      },
    });
    expect(executionState.status).toBe(WorkoutDayStatus.in_progress);
    expect(executionState.psrResponse).toBe(4);
    expect(executionState.pseResponse).toBe(5);

    const persisted = await prisma.workoutTemplate.findUnique({ where: { id: fixture.templateId } });
    const persistedDay = await prisma.workoutDay.findUnique({ where: { id: fixture.dayId } });
    expect(persisted?.trainingMethod).toBe('combined');
    expect(persisted?.released).toBe(true);
    expect(persistedDay?.detailNotes).toBe('snapshot liberado');
  });

  it('bloqueia add/update/delete/reorder de exercícios vinculados ao snapshot liberado', async () => {
    const fixture = await seedReleasedWorkout('exercise');

    await expect(
      prisma.workoutExercise.update({
        where: { id: fixture.exerciseId },
        data: { sets: 9 },
      })
    ).rejects.toThrow();
    await expect(
      prisma.workoutExercise.update({
        where: { id: fixture.exerciseId },
        data: { exerciseOrder: 2 },
      })
    ).rejects.toThrow();
    await expect(prisma.workoutExercise.delete({ where: { id: fixture.exerciseId } })).rejects.toThrow();

    const secondExercise = await prisma.exerciseLibrary.create({
      data: {
        contractId: (
          await prisma.exerciseLibrary.findUniqueOrThrow({
            where: { id: fixture.exerciseLibraryId },
            select: { contractId: true },
          })
        ).contractId,
        name: `Novo exercício bloqueado ${randomUUID()}`,
      },
    });
    await expect(
      prisma.workoutExercise.create({
        data: {
          workoutDayId: fixture.dayId,
          exerciseId: secondExercise.id,
          section: 'principal',
          exerciseOrder: 2,
          sets: 2,
          reps: 12,
        },
      })
    ).rejects.toThrow();

    const persisted = await prisma.workoutExercise.findUnique({ where: { id: fixture.exerciseId } });
    expect(persisted?.sets).toBe(3);
    expect(persisted?.exerciseOrder).toBe(1);
  });
});
