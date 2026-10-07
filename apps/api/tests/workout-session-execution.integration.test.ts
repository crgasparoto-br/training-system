import { randomUUID } from 'node:crypto';
import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import {
  createWorkoutSessionExecutionService,
  WorkoutSessionExecutionConflictError,
  WorkoutSessionExecutionNotFoundError,
} from '../src/modules/workout/workout-session-execution.service.js';
import { workoutService } from '../src/modules/workout/workout.service.js';

const runDatabaseIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
if (runDatabaseIntegrationTests) jest.setTimeout(30_000);

const prisma = new PrismaClient();
const concurrentPrisma = new PrismaClient();
const service = createWorkoutSessionExecutionService(prisma);
const concurrentService = createWorkoutSessionExecutionService(concurrentPrisma);

type Fixture = {
  contractId: string;
  alunoId: string;
  alunoUserId: string;
  dayId: string;
  exerciseIds: [string, string];
};

async function seedReleasedWorkout(label: string): Promise<Fixture> {
  const suffix = `${label}-${randomUUID()}`;
  const contractId = `issue-389-${suffix}`;

  await prisma.companyContract.create({
    data: {
      id: contractId,
      type: ContractType.academy,
      document: randomUUID().replace(/-/g, '').slice(0, 14),
      name: `Issue 389 ${label}`,
    },
  });

  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Professor',
      code: `issue-389-professor-${randomUUID()}`,
      isActive: true,
    },
  });

  const professorUser = await prisma.user.create({
    data: {
      email: `issue-389-prof-${randomUUID()}@example.com`,
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
      email: `issue-389-aluno-${randomUUID()}@example.com`,
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
      startDate: new Date('2026-10-01T00:00:00.000Z'),
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
  const approved = await prisma.consolidatedPrescriptionVersion.create({
    data: {
      assemblyId: assembly.id,
      contractId,
      alunoId: aluno.id,
      version: 1,
      status: 'approved',
      responsibleProfessorId: professor.id,
      professorJustification: 'Versão aprovada para teste da issue 389.',
      approvedByProfessorId: professor.id,
      approvedAt: new Date('2026-10-01T12:00:00.000Z'),
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
      previousVersionId: approved.id,
      status: 'released',
      responsibleProfessorId: professor.id,
      professorJustification: approved.professorJustification,
      approvedByProfessorId: professor.id,
      approvedAt: approved.approvedAt,
      createdByProfessorId: professor.id,
      conflicts: [],
    },
  });

  const template = await prisma.workoutTemplate.create({
    data: {
      planId: plan.id,
      mesocycleNumber: 1,
      weekNumber: 1,
      weekStartDate: new Date('2026-10-05T00:00:00.000Z'),
      trainingMethod: 'combined',
      released: false,
    },
  });
  const day = await prisma.workoutDay.create({
    data: {
      templateId: template.id,
      dayOfWeek: 2,
      workoutDate: new Date('2026-10-06T00:00:00.000Z'),
      method: 'continuous',
    },
  });

  const exerciseLibraryA = await prisma.exerciseLibrary.create({
    data: { contractId, name: `Agachamento ${label}` },
  });
  const exerciseLibraryB = await prisma.exerciseLibrary.create({
    data: { contractId, name: `Remada ${label}` },
  });
  const exerciseA = await prisma.workoutExercise.create({
    data: {
      workoutDayId: day.id,
      exerciseId: exerciseLibraryA.id,
      section: 'principal',
      exerciseOrder: 1,
      sets: 3,
      reps: 10,
    },
  });
  const exerciseB = await prisma.workoutExercise.create({
    data: {
      workoutDayId: day.id,
      exerciseId: exerciseLibraryB.id,
      section: 'principal',
      exerciseOrder: 2,
      sets: 3,
      reps: 10,
    },
  });

  const releasedAt = new Date('2026-10-05T12:00:00.000Z');
  await prisma.$executeRaw`
    INSERT INTO "ConsolidatedPrescriptionOperationalRelease" (
      "id", "assemblyId", "sourceAssemblyVersionId", "sourceAssemblyVersion",
      "releasedAssemblyVersionId", "releasedAssemblyVersion", "contractId", "alunoId",
      "trainingPlanId", "workoutTemplateId", "requestFingerprint",
      "releasedByProfessorId", "releasedAt", "createdAt"
    ) VALUES (
      ${randomUUID()}, ${assembly.id}, ${approved.id}, 1,
      ${released.id}, 2, ${contractId}, ${aluno.id},
      ${plan.id}, ${template.id}, ${randomUUID()},
      ${professor.id}, ${releasedAt}, ${releasedAt}
    )
  `;
  await prisma.workoutTemplate.update({
    where: { id: template.id },
    data: { released: true, releasedAt },
  });

  return {
    contractId,
    alunoId: aluno.id,
    alunoUserId: alunoUser.id,
    dayId: day.id,
    exerciseIds: [exerciseA.id, exerciseB.id],
  };
}

function transition(
  fixture: Fixture,
  operationKey: string,
  expectedVersion: number,
  targetStatus: 'not_started' | 'in_progress' | 'paused' | 'completed' | 'partial' | 'not_performed',
  reason?: string
) {
  return service.transition({
    sessionId: fixture.dayId,
    alunoId: fixture.alunoId,
    contractId: fixture.contractId,
    actorUserId: fixture.alunoUserId,
    payload: {
      operationKey,
      expectedVersion,
      targetStatus,
      ...(reason ? { reason } : {}),
    },
  });
}

async function installLifecycleEventTrigger(
  alunoId: string,
  mode: 'fail' | 'delay'
) {
  const token = randomUUID().replace(/-/g, '');
  const functionName = `test_issue389_${mode}_${token}`;
  const triggerName = `test_issue389_${mode}_trigger_${token}`;
  const escapedAlunoId = alunoId.replace(/'/g, "''");
  const body = mode === 'fail'
    ? "RAISE EXCEPTION 'issue389 forced lifecycle event failure';"
    : 'PERFORM pg_sleep(0.25); RETURN NEW;';

  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION "${functionName}"()
    RETURNS trigger AS $$
    BEGIN
      ${body}
      ${mode === 'fail' ? 'RETURN NEW;' : ''}
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "${triggerName}"
    BEFORE INSERT ON "StudentLifecycleEvent"
    FOR EACH ROW
    WHEN (NEW."alunoId" = '${escapedAlunoId}')
    EXECUTE FUNCTION "${functionName}"()
  `);

  return async () => {
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${triggerName}" ON "StudentLifecycleEvent"`
    );
    await prisma.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS "${functionName}"()`
    );
  };
}

describeDatabase('workout session execution persistence - issue 389', () => {
  afterAll(async () => {
    await Promise.all([prisma.$disconnect(), concurrentPrisma.$disconnect()]);
  });

  it('mantém idempotência após recriar o serviço, sem duplicar timestamp, operação ou evento', async () => {
    const fixture = await seedReleasedWorkout('idempotency');
    const operationKey = 'issue389-start-idempotent';

    const first = await transition(fixture, operationKey, 0, 'in_progress');
    const restartedService = createWorkoutSessionExecutionService(prisma);
    const replay = await restartedService.transition({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload: {
        operationKey,
        expectedVersion: 0,
        targetStatus: 'in_progress',
      },
    });

    expect(replay.version).toBe(1);
    expect(replay.startedAt).toBe(first.startedAt);
    const execution = await prisma.workoutSessionExecution.findUniqueOrThrow({
      where: { workoutDayId: fixture.dayId },
    });
    expect(await prisma.workoutSessionExecutionOperation.count({
      where: { executionId: execution.id },
    })).toBe(1);
    expect(await prisma.studentLifecycleEvent.count({
      where: {
        alunoId: fixture.alunoId,
        metadata: { path: ['domain'], equals: 'workout_session_execution' },
      },
    })).toBe(1);
  });

  it('persiste pausa/retomada e reconstrói o mesmo estado em outro cliente', async () => {
    const fixture = await seedReleasedWorkout('pause-resume');
    const started = await transition(fixture, 'issue389-pause-start', 0, 'in_progress');
    const paused = await transition(fixture, 'issue389-pause-stop', 1, 'paused');

    expect(paused.startedAt).toBe(started.startedAt);
    expect(paused.currentPauseStartedAt).not.toBeNull();

    const reconstructed = await concurrentService.getForSession({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
    });
    expect(reconstructed.status).toBe('paused');
    expect(reconstructed.currentPauseStartedAt).toBe(paused.currentPauseStartedAt);

    await new Promise((resolve) => setTimeout(resolve, 10));
    const resumed = await transition(fixture, 'issue389-pause-resume', 2, 'in_progress');
    expect(resumed.startedAt).toBe(started.startedAt);
    expect(resumed.currentPauseStartedAt).toBeNull();
    expect(resumed.pausedDurationMs).toBeGreaterThan(0);
  });

  it('resolve duas transições incompatíveis na mesma versão com um único vencedor', async () => {
    const fixture = await seedReleasedWorkout('concurrency');
    await transition(fixture, 'issue389-concurrent-start', 0, 'in_progress');

    const [pause, complete] = await Promise.allSettled([
      service.transition({
        sessionId: fixture.dayId,
        alunoId: fixture.alunoId,
        contractId: fixture.contractId,
        actorUserId: fixture.alunoUserId,
        payload: {
          operationKey: 'issue389-concurrent-pause',
          expectedVersion: 1,
          targetStatus: 'paused',
        },
      }),
      concurrentService.transition({
        sessionId: fixture.dayId,
        alunoId: fixture.alunoId,
        contractId: fixture.contractId,
        actorUserId: fixture.alunoUserId,
        payload: {
          operationKey: 'issue389-concurrent-complete',
          expectedVersion: 1,
          targetStatus: 'completed',
        },
      }),
    ]);

    const fulfilled = [pause, complete].filter((result) => result.status === 'fulfilled');
    const rejected = [pause, complete].filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(WorkoutSessionExecutionConflictError);
  });

  it('não permite acesso à sessão de outro aluno/contrato', async () => {
    const own = await seedReleasedWorkout('tenant-own');
    const foreign = await seedReleasedWorkout('tenant-foreign');

    await expect(
      service.getForSession({
        sessionId: own.dayId,
        alunoId: foreign.alunoId,
        contractId: foreign.contractId,
      })
    ).rejects.toBeInstanceOf(WorkoutSessionExecutionNotFoundError);
  });

  it('faz rollback completo quando o evento derivado falha', async () => {
    const fixture = await seedReleasedWorkout('event-rollback');
    const removeTrigger = await installLifecycleEventTrigger(fixture.alunoId, 'fail');

    try {
      await expect(
        transition(fixture, 'issue389-event-failure', 0, 'in_progress')
      ).rejects.toThrow('issue389 forced lifecycle event failure');
    } finally {
      await removeTrigger();
    }

    expect(await prisma.workoutSessionExecution.count({
      where: { workoutDayId: fixture.dayId },
    })).toBe(0);
    expect((await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId },
      select: { status: true, startedAt: true },
    }))).toMatchObject({ status: 'planned', startedAt: null });
    expect(await prisma.studentLifecycleEvent.count({
      where: {
        alunoId: fixture.alunoId,
        metadata: { path: ['domain'], equals: 'workout_session_execution' },
      },
    })).toBe(0);
  });

  it('serializa início concorrente com reordenação e impede alteração pós-início', async () => {
    const fixture = await seedReleasedWorkout('planning-race');
    const removeTrigger = await installLifecycleEventTrigger(fixture.alunoId, 'delay');

    try {
      const starting = transition(fixture, 'issue389-race-start', 0, 'in_progress');
      await new Promise((resolve) => setTimeout(resolve, 30));

      const reordering = workoutService.reorderExercises(
        fixture.dayId,
        'principal',
        [fixture.exerciseIds[1], fixture.exerciseIds[0]]
      );

      await expect(starting).resolves.toMatchObject({ status: 'in_progress' });
      await expect(reordering).rejects.toMatchObject({
        code: 'WORKOUT_PLANNING_LOCKED_AFTER_EXECUTION_START',
      });
    } finally {
      await removeTrigger();
    }

    const exercises = await prisma.workoutExercise.findMany({
      where: { id: { in: fixture.exerciseIds } },
      orderBy: { exerciseOrder: 'asc' },
      select: { id: true, exerciseOrder: true },
    });
    expect(exercises.map((item) => item.id)).toEqual(fixture.exerciseIds);
    expect(exercises.map((item) => item.exerciseOrder)).toEqual([1, 2]);
  });

  it('rejeita reordenação com exercício de outro dia mesmo antes do início', async () => {
    const own = await seedReleasedWorkout('reorder-own');
    const foreign = await seedReleasedWorkout('reorder-foreign');

    await expect(
      workoutService.reorderExercises(
        own.dayId,
        'principal',
        [own.exerciseIds[0], foreign.exerciseIds[0]]
      )
    ).rejects.toThrow('do not belong to the requested day/section');

    const ownExercises = await prisma.workoutExercise.findMany({
      where: { id: { in: own.exerciseIds } },
      orderBy: { exerciseOrder: 'asc' },
      select: { id: true },
    });
    expect(ownExercises.map((item) => item.id)).toEqual(own.exerciseIds);
  });
});
