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
  WorkoutSessionExecutionInputError,
  WorkoutSessionExecutionNotFoundError,
} from '../src/modules/workout/workout-session-execution.service.js';
import { workoutService } from '../src/modules/workout/workout.service.js';
import {
  createPostWorkoutFeedbackPersistenceService,
  PostWorkoutFeedbackConflictError,
  PostWorkoutFeedbackInputError,
  PostWorkoutFeedbackNotFoundError,
} from '../src/modules/post-workout-feedback/post-workout-feedback-persistence.service.js';

const runDatabaseIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
if (runDatabaseIntegrationTests) jest.setTimeout(30_000);

const prisma = new PrismaClient();
const concurrentPrisma = new PrismaClient();
const service = createWorkoutSessionExecutionService(prisma);
const concurrentService = createWorkoutSessionExecutionService(concurrentPrisma);
const feedbackService = createPostWorkoutFeedbackPersistenceService(prisma);
const concurrentFeedbackService = createPostWorkoutFeedbackPersistenceService(concurrentPrisma);

type Fixture = {
  contractId: string;
  alunoId: string;
  alunoUserId: string;
  professorUserId: string;
  dayId: string;
  exerciseIds: [string, string];
};

async function seedReleasedWorkout(
  label: string,
  options: { publish?: boolean; seedResistance?: boolean; seedGuidedResistance?: boolean; seedGuidedGroup?: boolean } = {},
): Promise<Fixture> {
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

  if (options.seedResistance) {
    await prisma.workoutExerciseBlock.create({
      data: {
        workoutExerciseId: exerciseA.id,
        position: 1,
        kind: 'principal',
        plannedSets: {
          create: { position: 1, repsMin: 8, repsMax: 12, loadKg: 32.5 },
        },
      },
    });
  }

  if (options.seedGuidedResistance || options.seedGuidedGroup) {
    await prisma.workoutExerciseBlock.create({
      data: {
        workoutExerciseId: exerciseA.id, position: 1, kind: 'principal',
        plannedSets: { create: [
          { position: 1, repsMin: 8, repsMax: 12, loadKg: 32.5, restSec: 60 },
          { position: 2, repsMin: 6, repsMax: 10, loadKg: 35, restSec: 90 },
        ] },
      },
    });
    await prisma.workoutExerciseBlock.create({
      data: {
        workoutExerciseId: exerciseB.id, position: 1, kind: 'principal',
        plannedSets: { create: options.seedGuidedGroup ? [
          { position: 1, repsMin: 10, repsMax: 12, loadKg: null, restSec: 45 },
          { position: 2, repsMin: 8, repsMax: 10, loadKg: null, restSec: 75 },
        ] : [{ position: 1, repsMin: 10, repsMax: 12, loadKg: null, restSec: 45 }] },
      },
    });
  }

  if (options.seedGuidedGroup) {
    await prisma.workoutResistanceGroup.create({
      data: {
        workoutDayId: day.id, position: 1, kind: 'bi_set', rounds: 2,
        restBetweenExercisesSec: null, restBetweenRoundsSec: 75,
        members: { create: [
          { position: 1, workoutExerciseId: exerciseA.id },
          { position: 2, workoutExerciseId: exerciseB.id },
        ] },
      },
    });
  }

  if (options.publish !== false) {
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
  }

  return {
    contractId,
    alunoId: aluno.id,
    alunoUserId: alunoUser.id,
    professorUserId: professorUser.id,
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


describeDatabase('post-workout feedback persistence - issue 390', () => {
  async function completeSession(fixture: Fixture, prefix: string) {
    await transition(fixture, `${prefix}-start`, 0, 'in_progress');
    await transition(fixture, `${prefix}-complete`, 1, 'completed');
  }

  it('persiste um único feedback confirmado e torna retry idempotente', async () => {
    const fixture = await seedReleasedWorkout('feedback-idempotency');
    await completeSession(fixture, 'issue390-idem');

    const payload = {
      operationKey: 'issue390-feedback-idempotent',
      values: { pse: 7, psr: 6, painDuring: 3, fatigueLevel: 'medium' as const },
    };
    const first = await feedbackService.createForStudent({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload,
    });
    const replay = await createPostWorkoutFeedbackPersistenceService(prisma).createForStudent({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload,
    });

    expect(replay.id).toBe(first.id);
    expect(replay.values.painDuring).toBe(3);
    expect(replay.signals.map((signal) => signal.code)).toContain('pain_attention');
    expect(await prisma.postWorkoutFeedbackRevision.count({ where: { workoutDayId: fixture.dayId } })).toBe(1);
    expect(await prisma.postWorkoutFeedbackOperation.count({ where: { workoutDayId: fixture.dayId } })).toBe(1);
    expect(await prisma.studentLifecycleEvent.count({
      where: {
        alunoId: fixture.alunoId,
        metadata: { path: ['domain'], equals: 'post_workout_feedback' },
      },
    })).toBe(1);
  });

  it('serializa duas confirmações concorrentes e mantém apenas uma revisão corrente', async () => {
    const fixture = await seedReleasedWorkout('feedback-create-race');
    await completeSession(fixture, 'issue390-create-race');

    const request = (runner: typeof feedbackService, operationKey: string) =>
      runner.createForStudent({
        sessionId: fixture.dayId,
        alunoId: fixture.alunoId,
        contractId: fixture.contractId,
        actorUserId: fixture.alunoUserId,
        payload: {
          operationKey,
          values: { pse: 8, painAfter: 2, energyLevel: 'good' },
        },
      });

    const results = await Promise.allSettled([
      request(feedbackService, 'issue390-create-race-a'),
      request(concurrentFeedbackService, 'issue390-create-race-b'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejection = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(rejection?.reason).toBeInstanceOf(PostWorkoutFeedbackConflictError);
    expect(rejection?.reason.code).toBe('POST_WORKOUT_FEEDBACK_ALREADY_CONFIRMED');
    expect(await prisma.postWorkoutFeedbackRevision.count({ where: { workoutDayId: fixture.dayId } })).toBe(1);
  });

  it('preserva histórico e rejeita duas correções concorrentes sobre a mesma revisão-base', async () => {
    const fixture = await seedReleasedWorkout('feedback-correction-race');
    await completeSession(fixture, 'issue390-correction-race');
    const base = await feedbackService.createForStudent({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload: {
        operationKey: 'issue390-correction-base',
        values: { pse: 6, painDuring: 5, observations: 'Percepção original do aluno.' },
      },
    });

    const correct = (runner: typeof feedbackService, operationKey: string, difficulty: number) =>
      runner.correctForProfessor({
        sessionId: fixture.dayId,
        alunoId: fixture.alunoId,
        contractId: fixture.contractId,
        actorUserId: fixture.professorUserId,
        payload: {
          operationKey,
          baseRevisionId: base.id,
          reason: 'Correção técnica auditável',
          values: { difficulty, professorTechnicalNotes: `Complemento técnico ${difficulty}` },
        },
      });

    const results = await Promise.allSettled([
      correct(feedbackService, 'issue390-correction-a', 7),
      correct(concurrentFeedbackService, 'issue390-correction-b', 8),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejection = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(rejection?.reason).toBeInstanceOf(PostWorkoutFeedbackConflictError);
    expect(rejection?.reason.code).toBe('POST_WORKOUT_FEEDBACK_REVISION_CONFLICT');

    const history = await feedbackService.getForSession({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      audience: 'professor',
      includeHistory: true,
    });
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      revisionNumber: 2,
      previousRevisionId: base.id,
      correctionReason: 'Correção técnica auditável',
      perceptionAuthor: 'student',
      revisedBy: 'professor',
      current: true,
    });
    expect(history[1]).toMatchObject({ id: base.id, revisionNumber: 1, current: false });
    expect(history[1].values.observations).toBe('Percepção original do aluno.');
    expect(history[0].technical).toMatchObject({ originTrainingPlanId: expect.any(String) });
    const studentView = await feedbackService.getForSession({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      audience: 'student',
    });
    expect(studentView[0]).not.toHaveProperty('technical');
    expect(studentView[0].values.professorTechnicalNotes).toBeNull();

    const replayedCreate = await feedbackService.createForStudent({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload: {
        operationKey: 'issue390-correction-base',
        values: { pse: 6, painDuring: 5, observations: 'Percepção original do aluno.' },
      },
    });
    expect(replayedCreate).toMatchObject({ id: base.id, current: false });
    expect(replayedCreate.values.professorTechnicalNotes).toBeNull();

    const winningIndex = results.findIndex((result) => result.status === 'fulfilled');
    const winningRevision = (results[winningIndex] as PromiseFulfilledResult<Awaited<ReturnType<typeof feedbackService.correctForProfessor>>>).value;
    const winningOperationKey = winningIndex === 0 ? 'issue390-correction-a' : 'issue390-correction-b';
    const winningDifficulty = winningIndex === 0 ? 7 : 8;

    const laterRevision = await feedbackService.correctForProfessor({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.professorUserId,
      payload: {
        operationKey: 'issue390-correction-later',
        baseRevisionId: winningRevision.id,
        reason: 'Segunda correção técnica auditável',
        values: { pse: 7 },
      },
    });
    expect(laterRevision.current).toBe(true);

    const replayedCorrection = await feedbackService.correctForProfessor({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.professorUserId,
      payload: {
        operationKey: winningOperationKey,
        baseRevisionId: base.id,
        reason: 'Correção técnica auditável',
        values: { difficulty: winningDifficulty, professorTechnicalNotes: `Complemento técnico ${winningDifficulty}` },
      },
    });
    expect(replayedCorrection).toMatchObject({ id: winningRevision.id, current: false });
  });

  it('rejeita correções sem mudança material e audita somente campos alterados', async () => {
    const fixture = await seedReleasedWorkout('feedback-material-correction');
    await completeSession(fixture, 'issue390-material-correction');
    const base = await feedbackService.createForStudent({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload: {
        operationKey: 'issue390-material-base',
        values: { pse: 6, painDuring: 4, observations: 'Original' },
      },
    });

    const correction = (operationKey: string, values: Record<string, unknown>) =>
      feedbackService.correctForProfessor({
        sessionId: fixture.dayId,
        alunoId: fixture.alunoId,
        contractId: fixture.contractId,
        actorUserId: fixture.professorUserId,
        payload: {
          operationKey,
          baseRevisionId: base.id,
          reason: 'Correção material auditável',
          values,
        },
      } as Parameters<typeof feedbackService.correctForProfessor>[0]);

    await expect(correction('issue390-empty-correction', {})).rejects.toBeInstanceOf(PostWorkoutFeedbackInputError);
    await expect(correction('issue390-same-correction', { pse: 6 })).rejects.toBeInstanceOf(PostWorkoutFeedbackInputError);

    expect(await prisma.postWorkoutFeedbackRevision.count({ where: { workoutDayId: fixture.dayId } })).toBe(1);
    expect(await prisma.postWorkoutFeedbackOperation.count({ where: { workoutDayId: fixture.dayId } })).toBe(1);
    expect(await prisma.studentLifecycleEvent.count({
      where: {
        alunoId: fixture.alunoId,
        metadata: { path: ['domain'], equals: 'post_workout_feedback' },
      },
    })).toBe(1);

    const payload = {
      operationKey: 'issue390-material-change',
      baseRevisionId: base.id,
      reason: 'Correção material auditável',
      values: { pse: 6, painDuring: 5, observations: 'Original' },
    };
    const corrected = await feedbackService.correctForProfessor({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.professorUserId,
      payload,
    });
    expect(corrected.values).toMatchObject({ pse: 6, painDuring: 5, observations: 'Original' });

    const event = await prisma.studentLifecycleEvent.findFirst({
      where: {
        alunoId: fixture.alunoId,
        metadata: { path: ['revisionId'], equals: corrected.id },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect((event?.metadata as { changedFields?: string[] } | null)?.changedFields).toEqual(['painDuring']);

    const replay = await feedbackService.correctForProfessor({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.professorUserId,
      payload,
    });
    expect(replay.id).toBe(corrected.id);
    expect(await prisma.postWorkoutFeedbackRevision.count({ where: { workoutDayId: fixture.dayId } })).toBe(2);
    expect(await prisma.postWorkoutFeedbackOperation.count({ where: { workoutDayId: fixture.dayId } })).toBe(2);
    expect(await prisma.studentLifecycleEvent.count({
      where: {
        alunoId: fixture.alunoId,
        metadata: { path: ['domain'], equals: 'post_workout_feedback' },
      },
    })).toBe(2);
  });

  it('rejeita sessão não iniciada, aceita execução parcial e isola outro contrato', async () => {
    const fixture = await seedReleasedWorkout('feedback-boundary');

    await expect(feedbackService.createForStudent({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload: { operationKey: 'issue390-not-started', values: { pse: 5 } },
    })).rejects.toBeInstanceOf(PostWorkoutFeedbackNotFoundError);

    await transition(fixture, 'issue390-boundary-start', 0, 'in_progress');
    await transition(fixture, 'issue390-boundary-partial', 1, 'partial', 'Sessão encerrada antes do fim');

    const partial = await feedbackService.createForStudent({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload: { operationKey: 'issue390-partial-feedback', values: { pse: 5, fatigueLevel: 'high' } },
    });
    expect(partial.executionStatus).toBe('partial');
    expect(partial.signals.map((signal) => signal.code)).toContain('fatigue_high');

    await expect(feedbackService.getForSession({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: 'contract-wrong',
      audience: 'student',
    })).rejects.toBeInstanceOf(PostWorkoutFeedbackNotFoundError);
  });
});

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

  it('serializa início concorrente com atualização do template e rejeita o write tardio', async () => {
    const fixture = await seedReleasedWorkout('template-planning-race');
    const templateId = (await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId },
      select: { templateId: true },
    })).templateId;
    const removeTrigger = await installLifecycleEventTrigger(fixture.alunoId, 'delay');

    try {
      const starting = transition(fixture, 'issue399-race-template-start', 0, 'in_progress');
      await new Promise((resolve) => setTimeout(resolve, 30));
      const updatingTemplate = workoutService.updateTemplate(templateId, {
        observation1: 'não pode vencer o início concorrente',
      });

      await expect(starting).resolves.toMatchObject({ status: 'in_progress' });
      await expect(updatingTemplate).rejects.toMatchObject({
        code: 'WORKOUT_PLANNING_LOCKED_AFTER_EXECUTION_START',
      });
    } finally {
      await removeTrigger();
    }

    expect((await prisma.workoutTemplate.findUniqueOrThrow({
      where: { id: templateId },
      select: { observation1: true },
    })).observation1).not.toBe('não pode vencer o início concorrente');
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

  it('issue #487: persists ordered steps, replays without advancing twice, and resumes on another client', async () => {
    const fixture = await seedReleasedWorkout('487-guided-ordered', { seedGuidedResistance: true });
    const scope = { sessionId: fixture.dayId, alunoId: fixture.alunoId, contractId: fixture.contractId };
    const initial = await service.getGuidedForSession(scope);
    expect(initial).toMatchObject({ availability: 'available', status: 'not_started', total: 3, completed: 0 });
    await transition(fixture, 'issue487-start-ordered', 0, 'in_progress');
    const first = await service.getGuidedForSession(scope);
    expect(first.current).toMatchObject({ plannedUnitId: fixture.exerciseIds[0], setNumber: 1, repsMin: 8, repsMax: 12, loadKg: 32.5 });
    const payload = {
      operationKey: 'issue487-ordered-confirm-1', expectedVersion: 1,
      plannedUnitId: first.current!.plannedUnitId, plannedSetId: first.current!.plannedSetId,
      setNumber: first.current!.setNumber, repetitions: 7, loadKg: 30.5,
    };
    const completed = await service.completeGuided({ ...scope, actorUserId: fixture.alunoUserId, payload });
    expect(completed).toMatchObject({ availability: 'available', version: 2, completed: 1, total: 3 });
    expect(completed.current).toMatchObject({ plannedUnitId: fixture.exerciseIds[0], setNumber: 2 });
    await expect(service.saveValues({
      ...scope, actorUserId: fixture.alunoUserId,
      payload: {
        operationKey: 'issue487-different-ordinal-after-completion',
        expectedVersion: 2,
        items: [{
          plannedUnitId: payload.plannedUnitId, plannedSetId: payload.plannedSetId,
          setNumber: 99, repetitions: 10,
        }],
      },
    })).rejects.toBeInstanceOf(WorkoutSessionExecutionInputError);
    const replay = await concurrentService.completeGuided({ ...scope, actorUserId: fixture.alunoUserId, payload });
    expect(replay).toMatchObject({ version: 2, completed: 1 });
    expect(replay.current?.plannedSetId).toBe(completed.current?.plannedSetId);
    const reconstructed = await concurrentService.getGuidedForSession(scope);
    expect(reconstructed.current?.plannedSetId).toBe(completed.current?.plannedSetId);
    const execution = await prisma.workoutSessionExecution.findUniqueOrThrow({
      where: { workoutDayId: fixture.dayId }, include: { items: true, operations: true },
    });
    expect(execution.operations).toHaveLength(2);
    expect(execution.items).toHaveLength(1);
    expect(execution.items[0]).toMatchObject({
      plannedSetId: payload.plannedSetId, plannedUnitId: payload.plannedUnitId,
      setNumber: 1, loadKg: 30.5, repetitions: 7,
    });
    expect(execution.items[0].completedAt).not.toBeNull();
    expect(execution.items[0].completedByOperationId).toBe(
      execution.operations.find((item) => item.action === 'complete_resistance_set')?.id,
    );
    const unchanged = await prisma.workoutExercisePlannedSet.findUniqueOrThrow({
      where: { id: payload.plannedSetId }, select: { loadKg: true, repsMin: true },
    });
    expect(unchanged).toEqual({ loadKg: 32.5, repsMin: 8 });
  });

  it('issues #400/#487: persists grouped rounds and advances participant before the next round', async () => {
    const fixture = await seedReleasedWorkout('487-guided-biset', { seedGuidedGroup: true });
    const scope = { sessionId: fixture.dayId, alunoId: fixture.alunoId, contractId: fixture.contractId };
    const before = await service.getGuidedForSession(scope);
    expect(before).toMatchObject({ availability: 'available', total: 4, completed: 0 });
    expect(before.current).toMatchObject({
      plannedUnitId: fixture.exerciseIds[0],
      groupType: 'bi_set', groupPosition: 1, groupSize: 2, roundNumber: 1, roundTotal: 2,
    });

    await transition(fixture, 'issue487-biset-start', 0, 'in_progress');
    const first = (await service.getGuidedForSession(scope)).current!;
    const afterFirst = await service.completeGuided({
      ...scope, actorUserId: fixture.alunoUserId,
      payload: {
        operationKey: 'issue487-biset-round1-a', expectedVersion: 1,
        plannedUnitId: first.plannedUnitId, plannedSetId: first.plannedSetId,
        setNumber: first.setNumber, repetitions: 8, loadKg: 30,
      },
    });
    expect(afterFirst.current).toMatchObject({
      plannedUnitId: fixture.exerciseIds[1],
      groupPosition: 2, roundNumber: 1, roundTotal: 2,
    });

    const second = afterFirst.current!;
    const afterRound = await service.completeGuided({
      ...scope, actorUserId: fixture.alunoUserId,
      payload: {
        operationKey: 'issue487-biset-round1-b', expectedVersion: 2,
        plannedUnitId: second.plannedUnitId, plannedSetId: second.plannedSetId,
        setNumber: second.setNumber, repetitions: 10, loadKg: null,
      },
    });
    expect(afterRound).toMatchObject({ completed: 2, version: 3 });
    expect(afterRound.current).toMatchObject({
      plannedUnitId: fixture.exerciseIds[0],
      groupPosition: 1, roundNumber: 2, roundTotal: 2,
    });

    const reconstructed = await concurrentService.getGuidedForSession(scope);
    expect(reconstructed.current?.plannedSetId).toBe(afterRound.current?.plannedSetId);
    await expect(prisma.workoutExercise.update({
      where: { id: fixture.exerciseIds[0] },
      data: { groupType: 'circuit' },
    })).rejects.toThrow();
    const persisted = await prisma.workoutResistanceGroup.findFirstOrThrow({
      where: { workoutDayId: fixture.dayId },
      include: { members: { orderBy: { position: 'asc' } } },
    });
    expect(persisted).toMatchObject({ kind: 'bi_set', rounds: 2 });
    expect(persisted.members.map((member) => member.workoutExerciseId)).toEqual(fixture.exerciseIds);
  });

  it('issue #487: rejects skipped series, foreign tenants and completion during pause without writes', async () => {
    const fixture = await seedReleasedWorkout('487-boundary', { seedGuidedResistance: true });
    const foreign = await seedReleasedWorkout('487-foreign');
    const scope = { sessionId: fixture.dayId, alunoId: fixture.alunoId, contractId: fixture.contractId };
    await transition(fixture, 'issue487-start-boundary', 0, 'in_progress');
    const first = await service.getGuidedForSession(scope);
    const second = (await prisma.workoutExercisePlannedSet.findMany({
      where: { block: { workoutExerciseId: fixture.exerciseIds[0] } },
      orderBy: { position: 'asc' },
    }))[1];
    const payload = {
      operationKey: 'issue487-wrong-set', expectedVersion: 1,
      plannedUnitId: fixture.exerciseIds[0], plannedSetId: second.id,
      setNumber: 2, repetitions: 8, loadKg: 40,
    };
    await expect(service.completeGuided({ ...scope, actorUserId: fixture.alunoUserId, payload }))
      .rejects.toBeInstanceOf(WorkoutSessionExecutionConflictError);
    await expect(service.getGuidedForSession({
      sessionId: fixture.dayId, alunoId: foreign.alunoId, contractId: foreign.contractId,
    })).rejects.toBeInstanceOf(WorkoutSessionExecutionNotFoundError);
    await expect(service.completeGuided({
      sessionId: fixture.dayId, alunoId: foreign.alunoId, contractId: foreign.contractId,
      actorUserId: foreign.alunoUserId, payload: { ...payload, operationKey: 'issue487-cross-tenant' },
    })).rejects.toBeInstanceOf(WorkoutSessionExecutionNotFoundError);
    expect((await service.getGuidedForSession(scope)).current?.plannedSetId).toBe(first.current?.plannedSetId);
    await transition(fixture, 'issue487-pause-boundary', 1, 'paused');
    await expect(service.completeGuided({
      ...scope, actorUserId: fixture.alunoUserId,
      payload: { ...payload, operationKey: 'issue487-while-paused', expectedVersion: 2, plannedSetId: first.current!.plannedSetId, setNumber: 1 },
    })).rejects.toBeInstanceOf(WorkoutSessionExecutionConflictError);
    expect((await service.getGuidedForSession(scope)).status).toBe('paused');
    expect((await service.getGuidedForSession(scope)).current?.plannedSetId).toBe(first.current?.plannedSetId);
    await transition(fixture, 'issue487-resume-boundary', 2, 'in_progress');
    const res = await service.completeGuided({
      ...scope, actorUserId: fixture.alunoUserId,
      payload: { ...payload, operationKey: 'issue487-after-resume', expectedVersion: 3, plannedSetId: first.current!.plannedSetId, setNumber: 1 },
    });
    expect(res.completed).toBe(1);
  });

  it('issue #487: raw value entry never implies guided completion and rollback preserves progress', async () => {
    const fixture = await seedReleasedWorkout('487-raw-and-rollback', { seedGuidedResistance: true });
    const scope = { sessionId: fixture.dayId, alunoId: fixture.alunoId, contractId: fixture.contractId };
    await transition(fixture, 'issue487-start-raw', 0, 'in_progress');
    const initial = await service.getGuidedForSession(scope);
    const first = initial.current!;
    await service.saveValues({
      ...scope, actorUserId: fixture.alunoUserId,
      payload: {
        operationKey: 'issue487-save-raw', expectedVersion: 1,
        items: [{ plannedUnitId: first.plannedUnitId, plannedSetId: first.plannedSetId, setNumber: 1, repetitions: 8 }],
      },
    });
    expect((await service.getGuidedForSession(scope)).current?.plannedSetId).toBe(first.plannedSetId);
    expect((await service.getGuidedForSession(scope)).completed).toBe(0);
    const removeTrigger = await installLifecycleEventTrigger(fixture.alunoId, 'fail');
    try {
      await expect(service.completeGuided({
        ...scope, actorUserId: fixture.alunoUserId,
        payload: {
          operationKey: 'issue487-forced-rollback', expectedVersion: 2,
          plannedUnitId: first.plannedUnitId, plannedSetId: first.plannedSetId,
          setNumber: 1, repetitions: 9, loadKg: 40,
        },
      })).rejects.toThrow('issue389 forced lifecycle event failure');
    } finally {
      await removeTrigger();
    }
    expect((await service.getGuidedForSession(scope)).completed).toBe(0);
    const row = await prisma.workoutSessionExecution.findUniqueOrThrow({
      where: { workoutDayId: fixture.dayId }, include: { items: true, operations: true },
    });
    expect(row.version).toBe(2);
    expect(row.operations).toHaveLength(2);
    expect(row.items[0].completedAt).toBeNull();
    expect(row.items[0].repetitions).toBe(8);
  });

  it('issue #487: serializes two simultaneous confirmations of the same planned set', async () => {
    const fixture = await seedReleasedWorkout('487-concurrency', { seedGuidedResistance: true });
    const scope = { sessionId: fixture.dayId, alunoId: fixture.alunoId, contractId: fixture.contractId };
    await transition(fixture, 'issue487-start-concurrent', 0, 'in_progress');
    const first = (await service.getGuidedForSession(scope)).current!;
    const confirm = (client: typeof service, key: string) => client.completeGuided({
      ...scope, actorUserId: fixture.alunoUserId,
      payload: {
        operationKey: key, expectedVersion: 1, plannedUnitId: first.plannedUnitId,
        plannedSetId: first.plannedSetId, setNumber: first.setNumber,
        repetitions: 8, loadKg: 32.5,
      },
    });
    const results = await Promise.allSettled([
      confirm(service, 'issue487-first-confirm'),
      confirm(concurrentService, 'issue487-second-confirm'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failures = results.filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBeInstanceOf(WorkoutSessionExecutionConflictError);
    expect((await service.getGuidedForSession(scope)).completed).toBe(1);
    const row = await prisma.workoutSessionExecution.findUniqueOrThrow({
      where: { workoutDayId: fixture.dayId }, include: { items: true },
    });
    expect(row.items).toHaveLength(1);
  });

  it('issue #487: um ledger válido não autoriza forjar outra série com o mesmo operationId', async () => {
    const fixture = await seedReleasedWorkout('487-unique-ledger', { seedGuidedResistance: true });
    const scope = { sessionId: fixture.dayId, alunoId: fixture.alunoId, contractId: fixture.contractId };
    await transition(fixture, 'issue487-unique-ledger-start', 0, 'in_progress');
    const first = (await service.getGuidedForSession(scope)).current!;
    await service.completeGuided({
      ...scope, actorUserId: fixture.alunoUserId,
      payload: { operationKey: 'issue487-first-valid-ledger', expectedVersion: 1,
        plannedUnitId: first.plannedUnitId, plannedSetId: first.plannedSetId,
        setNumber: first.setNumber, repetitions: 8, loadKg: 32.5 },
    });
    const second = (await service.getGuidedForSession(scope)).current!;
    const execution = await prisma.workoutSessionExecution.findUniqueOrThrow({
      where: { workoutDayId: fixture.dayId }, include: { operations: true, items: true },
    });
    const completion = execution.operations.find((item) => item.action === 'complete_resistance_set')!;
    expect(execution.items[0].completedByOperationId).toBe(completion.id);
    await expect(prisma.$executeRaw`
      INSERT INTO "WorkoutSessionExecutionItem" (
        "id", "executionId", "plannedUnitId", "plannedSetId", "setNumber", "completedAt",
        "completedByOperationId", "updatedAt"
      ) VALUES (
        ${randomUUID()}, ${execution.id}, ${second.plannedUnitId}, ${second.plannedSetId},
        ${second.setNumber}, CURRENT_TIMESTAMP, ${completion.id}, CURRENT_TIMESTAMP
      )
    `).rejects.toThrow();
    expect((await service.getGuidedForSession(scope)).completed).toBe(1);
    expect((await service.getGuidedForSession(scope)).current?.plannedSetId).toBe(second.plannedSetId);
    expect(await prisma.workoutSessionExecutionItem.count({
      where: { executionId: execution.id, completedAt: { not: null } },
    })).toBe(1);
  });

  it('issue #487: direct SQL cannot forge a completion without its canonical operation', async () => {
    const fixture = await seedReleasedWorkout('487-direct-completion', { seedGuidedResistance: true });
    const scope = { sessionId: fixture.dayId, alunoId: fixture.alunoId, contractId: fixture.contractId };
    await transition(fixture, 'issue487-start-direct-sql', 0, 'in_progress');
    const current = (await service.getGuidedForSession(scope)).current!;
    const execution = await prisma.workoutSessionExecution.findUniqueOrThrow({
      where: { workoutDayId: fixture.dayId },
    });
    await expect(prisma.$executeRaw`
      INSERT INTO "WorkoutSessionExecutionItem" (
        "id", "executionId", "plannedUnitId", "plannedSetId", "setNumber", "completedAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}, ${execution.id}, ${current.plannedUnitId},
        ${current.plannedSetId}, ${current.setNumber}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).rejects.toThrow(/guided completion marker requires its operation/);
    expect((await service.getGuidedForSession(scope)).completed).toBe(0);
    expect(await prisma.workoutSessionExecutionItem.count({
      where: { executionId: execution.id },
    })).toBe(0);
  });

});


describeDatabase('AUD-399-16/17: canonical planned-set execution link', () => {
  it('persists and projects plannedSetId while rejecting a cross-unit reference', async () => {
    const fixture = await seedReleasedWorkout('issue399-planned-set-link', { seedResistance: true });
    const plannedSet = await prisma.workoutExercisePlannedSet.findFirstOrThrow({
      where: { block: { workoutExerciseId: fixture.exerciseIds[0] } },
    });
    const started = await service.transition({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload: {
        operationKey: 'issue399-planned-set-start',
        expectedVersion: 0,
        targetStatus: 'in_progress',
        items: [{ plannedUnitId: fixture.exerciseIds[0], plannedSetId: plannedSet.id, loadKg: 35.5 }],
      },
    });
    expect(started.items[0]).toMatchObject({
      plannedUnitId: fixture.exerciseIds[0], plannedSetId: plannedSet.id, loadKg: 35.5,
    });
    const legacyUpdate = await service.saveValues({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload: {
        operationKey: 'issue399-planned-set-legacy-update',
        expectedVersion: 1,
        items: [{ plannedUnitId: fixture.exerciseIds[0], loadKg: 36.5 }],
      },
    });
    expect(legacyUpdate.items[0]).toMatchObject({
      plannedUnitId: fixture.exerciseIds[0], plannedSetId: plannedSet.id, loadKg: 36.5,
    });
    await expect(service.saveValues({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload: {
        operationKey: 'issue399-planned-set-cross-unit',
        expectedVersion: 2,
        items: [{ plannedUnitId: fixture.exerciseIds[1], plannedSetId: plannedSet.id, loadKg: 20 }],
      },
    })).rejects.toMatchObject({ code: 'WORKOUT_SESSION_EXECUTION_INVALID' });

    const execution = await prisma.workoutSessionExecution.findUniqueOrThrow({
      where: { workoutDayId: fixture.dayId }, select: { id: true },
    });
    await expect(prisma.$executeRaw`
      INSERT INTO "WorkoutSessionExecutionItem" ("id", "executionId", "plannedUnitId", "plannedSetId")
      VALUES (${randomUUID()}, ${execution.id}, ${fixture.exerciseIds[1]}, ${plannedSet.id})
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      UPDATE "WorkoutSessionExecution" SET "status" = 'not_started' WHERE "id" = ${execution.id}
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      UPDATE "WorkoutSessionExecution" SET "workoutDayId" = ${randomUUID()} WHERE "id" = ${execution.id}
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      DELETE FROM "WorkoutSessionExecution" WHERE "id" = ${execution.id}
    `).rejects.toThrow();
    const executionItem = await prisma.workoutSessionExecutionItem.findFirstOrThrow({
      where: { executionId: execution.id },
      select: { id: true },
    });
    await expect(prisma.$executeRaw`
      DELETE FROM "WorkoutSessionExecutionItem" WHERE "id" = ${executionItem.id}
    `).rejects.toThrow();
  });

  it('requires a planned set for a structured unit and rejects explicit unlinking', async () => {
    const fixture = await seedReleasedWorkout('issue399-planned-set-required', { seedResistance: true });
    const plannedSet = await prisma.workoutExercisePlannedSet.findFirstOrThrow({
      where: { block: { workoutExerciseId: fixture.exerciseIds[0] } },
    });

    await expect(service.transition({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload: {
        operationKey: 'issue399-planned-set-required-missing',
        expectedVersion: 0,
        targetStatus: 'in_progress',
        items: [{ plannedUnitId: fixture.exerciseIds[0], loadKg: 30 }],
      },
    })).rejects.toMatchObject({ code: 'WORKOUT_SESSION_EXECUTION_INVALID' });

    const started = await service.transition({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload: {
        operationKey: 'issue399-planned-set-required-start',
        expectedVersion: 0,
        targetStatus: 'in_progress',
        items: [{ plannedUnitId: fixture.exerciseIds[0], plannedSetId: plannedSet.id, loadKg: 30 }],
      },
    });

    await expect(service.saveValues({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload: {
        operationKey: 'issue399-planned-set-required-unlink',
        expectedVersion: started.version,
        items: [{ plannedUnitId: fixture.exerciseIds[0], plannedSetId: null, loadKg: 31 }],
      },
    })).rejects.toMatchObject({ code: 'WORKOUT_SESSION_EXECUTION_INVALID' });
  });

  it('blocks direct SQL mutation of terminal execution values and child ledger rows', async () => {
    const fixture = await seedReleasedWorkout('issue399-terminal-ledger', { seedResistance: true });
    const plannedSet = await prisma.workoutExercisePlannedSet.findFirstOrThrow({
      where: { block: { workoutExerciseId: fixture.exerciseIds[0] } },
    });
    const started = await service.transition({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload: {
        operationKey: 'issue399-terminal-start',
        expectedVersion: 0,
        targetStatus: 'in_progress',
        items: [{ plannedUnitId: fixture.exerciseIds[0], plannedSetId: plannedSet.id, loadKg: 30 }],
      },
    });
    const completed = await service.transition({
      sessionId: fixture.dayId,
      alunoId: fixture.alunoId,
      contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload: {
        operationKey: 'issue399-terminal-complete',
        expectedVersion: started.version,
        targetStatus: 'completed',
      },
    });
    const execution = await prisma.workoutSessionExecution.findUniqueOrThrow({
      where: { workoutDayId: completed.sessionId },
      include: { items: true, operations: true },
    });
    const item = execution.items[0];
    const operation = execution.operations[0];

    await expect(prisma.$executeRaw`
      UPDATE "WorkoutSessionExecution" SET "sessionValues" = '{"durationSec":999}'::jsonb WHERE "id" = ${execution.id}
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      UPDATE "WorkoutSessionExecutionItem" SET "loadKg" = 999 WHERE "id" = ${item.id}
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      INSERT INTO "WorkoutSessionExecutionOperation" (
        "id", "executionId", "operationKey", "payloadFingerprint", "action",
        "targetStatus", "expectedVersion", "resultingVersion"
      ) VALUES (
        ${randomUUID()}, ${execution.id}, 'issue399-direct-terminal-operation', 'fingerprint',
        'transition', 'completed', ${completed.version}, ${completed.version + 1}
      )
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      INSERT INTO "WorkoutSessionPauseInterval" ("id", "executionId", "startedAt")
      VALUES (${randomUUID()}, ${execution.id}, ${new Date('2026-10-27T10:00:00.000Z')})
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      INSERT INTO "WorkoutSessionExecutionItem" (
        "id", "executionId", "plannedUnitId", "setNumber", "loadKg"
      ) VALUES (
        ${randomUUID()}, ${execution.id}, ${fixture.exerciseIds[0]}, 99, 1
      )
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      DELETE FROM "WorkoutSessionExecutionOperation" WHERE "id" = ${operation.id}
    `).rejects.toThrow();
  });

  it('rejects a direct root execution INSERT that skips the not_started shell', async () => {
    const fixture = await seedReleasedWorkout('issue399-invalid-root-insert');
    const day = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId },
      include: { template: { include: { plan: true } } },
    });
    const releaseRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "ConsolidatedPrescriptionOperationalRelease"
      WHERE "workoutTemplateId" = ${day.templateId}
      LIMIT 1
    `;
    const release = releaseRows[0];
    if (!release) throw new Error('fixture release missing');

    await expect(prisma.$executeRaw`
      INSERT INTO "WorkoutSessionExecution" (
        "id", "workoutDayId", "alunoId", "contractId", "originReleaseId",
        "originWorkoutTemplateId", "originTrainingPlanId", "status", "version",
        "startedAt", "finishedAt"
      ) VALUES (
        ${randomUUID()}, ${fixture.dayId}, ${fixture.alunoId}, ${fixture.contractId},
        ${release.id}, ${day.templateId}, ${day.template.planId}, 'completed', 1,
        ${new Date('2026-10-27T10:00:00.000Z')}, ${new Date('2026-10-27T11:00:00.000Z')}
      )
    `).rejects.toThrow();
  });

  it('rejects status updates that omit the lifecycle fields required by each state', async () => {
    const expectInvalidUpdate = async (status: string, fields: string) => {
      const fixture = await seedReleasedWorkout(`issue399-invalid-state-${status}`);
      const day = await prisma.workoutDay.findUniqueOrThrow({
        where: { id: fixture.dayId },
        include: { template: true },
      });
      const releaseRows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "ConsolidatedPrescriptionOperationalRelease"
        WHERE "workoutTemplateId" = ${day.templateId} LIMIT 1
      `;
      const release = releaseRows[0];
      if (!release) throw new Error('fixture release missing');
      const executionId = randomUUID();
      await prisma.$executeRaw`
        INSERT INTO "WorkoutSessionExecution" (
          "id", "workoutDayId", "alunoId", "contractId", "originReleaseId",
          "originWorkoutTemplateId", "originTrainingPlanId", "status", "version", "updatedAt"
        ) VALUES (
          ${executionId}, ${fixture.dayId}, ${fixture.alunoId}, ${fixture.contractId},
          ${release.id}, ${day.templateId}, ${day.template.planId}, 'not_started', 0, CURRENT_TIMESTAMP
        )
      `;
      await expect(prisma.$executeRawUnsafe(`
        UPDATE "WorkoutSessionExecution"
        SET "status" = '${status}', "version" = 1, ${fields}
        WHERE "id" = '${executionId}'
      `)).rejects.toThrow();
    };

    await expectInvalidUpdate('in_progress', '"startedAt" = NULL');
    await expectInvalidUpdate('paused', '"startedAt" = TIMESTAMP \'2026-10-27 10:00:00+00\', "currentPauseStartedAt" = NULL');
    await expectInvalidUpdate('completed', '"startedAt" = TIMESTAMP \'2026-10-27 10:00:00+00\', "finishedAt" = NULL');
    await expectInvalidUpdate('partial', '"startedAt" = TIMESTAMP \'2026-10-27 10:00:00+00\', "finishedAt" = TIMESTAMP \'2026-10-27 11:00:00+00\', "interruptionReason" = \'  \'');
    await expectInvalidUpdate('not_performed', '"finishedAt" = NULL, "interruptionReason" = \'sem motivo\'');
  });
});

describeDatabase('resistance blocks - historical identity and transactional persistence (#399)', () => {
  async function editableFixture(label: string) {
    // Exercise persistence must start in a genuine draft. Published templates
    // are immutable; tests must not attempt to unpublish operational releases.
    const fixture = await seedReleasedWorkout(label, { publish: false });
    const rows = await prisma.workoutExercise.findMany({
      where: { id: { in: fixture.exerciseIds } },
      orderBy: { exerciseOrder: 'asc' },
    });
    const input = rows.map((row, index) => ({
      workoutDayId: fixture.dayId,
      workoutExerciseId: row.id,
      exerciseId: row.exerciseId,
      section: 'sessao',
      exerciseOrder: index + 1,
      sets: row.sets ?? undefined,
      reps: row.reps ?? undefined,
      resistanceBlocks: index === 0
        ? [{
          position: 1,
          kind: 'principal' as const,
          plannedSets: [{ position: 1, repsMin: 8, repsMax: 12, loadKg: 32.5, rir: 2 }],
        }]
        : [],
    }));
    return { fixture, input };
  }

  it('salvamentos repetidos preservam ids de exercícios, blocos e séries', async () => {
    const { fixture, input } = await editableFixture('issue399-replay');
    const first = await workoutService.replaceDayResistanceExercises(fixture.dayId, input);
    expect(first.map((row) => row.id)).toEqual(fixture.exerciseIds);
    expect(first[0].resistanceBlocks[0].plannedSets[0].repsMin).toBe(8);
    const blockId = first[0].resistanceBlocks[0].id;
    const setId = first[0].resistanceBlocks[0].plannedSets[0].id;
    const second = await workoutService.replaceDayResistanceExercises(fixture.dayId, input);
    expect(second.map((row) => row.id)).toEqual(fixture.exerciseIds);
    expect(second[0].resistanceBlocks[0].id).toBe(blockId);
    expect(second[0].resistanceBlocks[0].plannedSets[0].id).toBe(setId);
  });

  it('salva template, dias e resistência atomicamente e reverte metadados quando a estrutura falha', async () => {
    const { fixture, input } = await editableFixture('issue399-week-save-atomic');
    const day = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId },
      include: { template: true },
    });
    const before = await prisma.workoutTemplate.findUniqueOrThrow({ where: { id: day.templateId } });
    const invalidPayload = {
      template: { trainingMethod: 'must-rollback' },
      workoutDays: [{ dayOfWeek: 2, workoutDate: '2026-10-19T12:00:00.000Z' }],
      resistedExercises: {
        2: {
          sessao: [{ ...input[0], exerciseId: 'exercise-from-another-contract' }],
        },
      },
    };
    await expect(workoutService.saveTemplateWeek(day.templateId, invalidPayload, fixture.contractId))
      .rejects.toMatchObject({ code: 'INVALID_RESISTANCE_STRUCTURE' });
    expect((await prisma.workoutTemplate.findUniqueOrThrow({ where: { id: day.templateId } })).trainingMethod)
      .toBe(before.trainingMethod);

    const validPayload = {
      baseUpdatedAt: before.updatedAt.toISOString(),
      template: { trainingMethod: 'saved-atomically' },
      workoutDays: [{ dayOfWeek: 2, workoutDate: '2026-10-19T12:00:00.000Z', detailNotes: 'nota semanal' }],
      resistedExercises: {
        2: {
          sessao: input.map((exercise) => ({ ...exercise, section: 'sessao' })),
        },
      },
    };
    await workoutService.saveTemplateWeek(day.templateId, validPayload, fixture.contractId);
    const saved = await prisma.workoutTemplate.findUniqueOrThrow({
      where: { id: day.templateId },
      include: { workoutDays: { include: { exercises: true } } },
    });
    expect(saved.trainingMethod).toBe('saved-atomically');
    expect(saved.workoutDays.find((candidate) => candidate.dayOfWeek === 2)?.workoutDate.toISOString())
      .toBe('2026-10-06T00:00:00.000Z');
    expect(saved.workoutDays.find((candidate) => candidate.dayOfWeek === 2)?.detailNotes).toBe('nota semanal');
    expect(saved.workoutDays.find((candidate) => candidate.dayOfWeek === 2)?.exercises).toHaveLength(2);
    await expect(workoutService.saveTemplateWeek(day.templateId, {
      baseUpdatedAt: before.updatedAt.toISOString(),
      template: { trainingMethod: 'stale-write-must-not-win' },
    }, fixture.contractId)).rejects.toMatchObject({ code: 'WORKOUT_PLANNING_VERSION_CONFLICT' });
    expect((await prisma.workoutTemplate.findUniqueOrThrow({ where: { id: day.templateId } })).trainingMethod)
      .toBe('saved-atomically');
  });

  it('avança a revisão e rejeita concorrência quando só um bloco/série muda', async () => {
    const { fixture, input } = await editableFixture('issue399-child-only-version');
    await workoutService.replaceDayResistanceExercises(fixture.dayId, input, fixture.contractId);
    const day = await prisma.workoutDay.findUniqueOrThrow({ where: { id: fixture.dayId } });
    const before = await prisma.workoutTemplate.findUniqueOrThrow({ where: { id: day.templateId } });
    const childOnlyPayload = {
      baseUpdatedAt: before.updatedAt.toISOString(),
      resistedExercises: {
        2: {
          sessao: input.map((exercise, index) => ({
            ...exercise,
            section: 'sessao',
            resistanceBlocks: index === 0
              ? [{ ...exercise.resistanceBlocks![0], plannedSets: [{ ...exercise.resistanceBlocks![0].plannedSets[0], loadKg: 33.5 }] }]
              : [],
          })),
        },
      },
    };
    await workoutService.saveTemplateWeek(day.templateId, childOnlyPayload, fixture.contractId);
    const after = await prisma.workoutTemplate.findUniqueOrThrow({ where: { id: day.templateId } });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());

    await expect(workoutService.saveTemplateWeek(day.templateId, {
      ...childOnlyPayload,
      resistedExercises: {
        2: {
          sessao: childOnlyPayload.resistedExercises[2].sessao.map((exercise, index) => ({
            ...exercise,
            resistanceBlocks: index === 0
              ? [{ ...exercise.resistanceBlocks![0], plannedSets: [{ ...exercise.resistanceBlocks![0].plannedSets[0], loadKg: 34.5 }] }]
              : [],
          })),
        },
      },
    }, fixture.contractId)).rejects.toMatchObject({ code: 'WORKOUT_PLANNING_VERSION_CONFLICT' });
    const persisted = await prisma.workoutExerciseBlock.findFirstOrThrow({
      where: { workoutExerciseId: fixture.exerciseIds[0] },
      include: { plannedSets: true },
    });
    expect(persisted.plannedSets[0].loadKg).toBe(33.5);
  });

  it('usa a nova âncora do snapshot e rejeita dias duplicados', async () => {
    const { fixture } = await editableFixture('issue399-week-anchor');
    const templateId = (await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId },
      select: { templateId: true },
    })).templateId;
    const before = await prisma.workoutTemplate.findUniqueOrThrow({
      where: { id: templateId },
      include: { workoutDays: true },
    });
    const nextAnchor = new Date(before.weekStartDate);
    nextAnchor.setUTCDate(nextAnchor.getUTCDate() + 7);

    await expect(workoutService.saveTemplateWeek(templateId, {
      template: { weekStartDate: nextAnchor.toISOString() },
      workoutDays: [{ dayOfWeek: 1 }, { dayOfWeek: 1 }],
    })).rejects.toMatchObject({ code: 'INVALID_RESISTANCE_STRUCTURE' });

    await workoutService.saveTemplateWeek(templateId, {
      template: { weekStartDate: nextAnchor.toISOString() },
    });
    const saved = await prisma.workoutTemplate.findUniqueOrThrow({
      where: { id: templateId },
      include: { workoutDays: true },
    });
    for (const day of saved.workoutDays) {
      const expected = new Date(nextAnchor);
      const anchorWeekday = expected.getUTCDay() || 7;
      expected.setUTCDate(expected.getUTCDate() + day.dayOfWeek - anchorWeekday);
      expect(day.workoutDate.toISOString()).toBe(expected.toISOString());
    }
  });

  it('protege execução histórica contra exclusão e garante rollback do dia', async () => {
    const { fixture, input } = await editableFixture('issue399-historical');
    await workoutService.replaceDayResistanceExercises(fixture.dayId, input);
    await prisma.workoutExecution.create({
      data: {
        workoutExerciseId: fixture.exerciseIds[0],
        alunoId: fixture.alunoId,
        executionDate: new Date('2026-10-07T09:00:00.000Z'),
      },
    });
    const before = await prisma.workoutExercise.findMany({
      where: { workoutDayId: fixture.dayId },
      orderBy: { exerciseOrder: 'asc' },
    });
    await expect(workoutService.replaceDayResistanceExercises(fixture.dayId, [{ ...input[1], exerciseOrder: 1 }]))
      .rejects.toMatchObject({ code: 'WORKOUT_PLANNING_LOCKED_AFTER_EXECUTION_START' });
    const after = await prisma.workoutExercise.findMany({
      where: { workoutDayId: fixture.dayId },
      orderBy: { exerciseOrder: 'asc' },
    });
    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
    expect(await prisma.workoutExecution.count({
      where: { workoutExerciseId: fixture.exerciseIds[0] },
    })).toBe(1);
    await expect(workoutService.deleteExercise(fixture.exerciseIds[0]))
      .rejects.toMatchObject({ code: 'WORKOUT_PLANNING_LOCKED_AFTER_EXECUTION_START' });
    await expect(workoutService.updateExercise(fixture.exerciseIds[0], { reps: 6 }))
      .rejects.toMatchObject({ code: 'WORKOUT_PLANNING_LOCKED_AFTER_EXECUTION_START' });
  });

  it('reverte a atualização anterior quando a segunda gravação falha dentro da transação', async () => {
    const { fixture, input } = await editableFixture('issue399-atomic-rollback');
    const before = await prisma.workoutExercise.findMany({
      where: { workoutDayId: fixture.dayId },
      orderBy: { exerciseOrder: 'asc' },
    });
    await expect(workoutService.replaceDayResistanceExercises(fixture.dayId, [
      { ...input[0], reps: 7 },
      { ...input[1], reps: 'invalid' as unknown as number },
    ])).rejects.toThrow();
    const after = await prisma.workoutExercise.findMany({
      where: { workoutDayId: fixture.dayId },
      orderBy: { exerciseOrder: 'asc' },
    });
    expect(after.map((row) => [row.id, row.section, row.reps])).toEqual(
      before.map((row) => [row.id, row.section, row.reps]));
  });

  it('impede operações cruzando contratos e catálogo de exercícios', async () => {
    const own = await editableFixture('issue399-own-contract');
    const foreign = await seedReleasedWorkout('issue399-foreign-contract');
    await expect(workoutService.replaceDayResistanceExercises(
      own.fixture.dayId, own.input, foreign.contractId,
    )).rejects.toMatchObject({ code: 'RESISTANCE_DAY_NOT_FOUND' });
    const foreignExercise = await prisma.workoutExercise.findUniqueOrThrow({
      where: { id: foreign.exerciseIds[0] },
      select: { exerciseId: true },
    });
    await expect(workoutService.replaceDayResistanceExercises(
      own.fixture.dayId,
      [{ workoutDayId: own.fixture.dayId, exerciseId: foreignExercise.exerciseId,
        section: 'sessao', exerciseOrder: 1, resistanceBlocks: [] }, own.input[1]],
      own.fixture.contractId,
    )).rejects.toMatchObject({ code: 'INVALID_RESISTANCE_STRUCTURE' });
    const unchanged = await prisma.workoutExercise.findMany({
      where: { workoutDayId: own.fixture.dayId },
    });
    expect(unchanged).toHaveLength(2);
  });

  it('deriva a data civil do dia a partir da âncora do template em criação e cópia legadas', async () => {
    const { fixture } = await editableFixture('issue399-canonical-day-date');
    const source = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId },
      select: { templateId: true },
    });
    const canonical = await workoutService.getOrCreateDay({
      templateId: source.templateId,
      dayOfWeek: 3,
      workoutDate: new Date('2026-10-18T12:00:00.000Z'),
    } as never);
    expect(canonical.workoutDate.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    const copied = await workoutService.copyDay(
      fixture.dayId,
      4,
      new Date('2026-10-18T12:00:00.000Z'),
    );
    expect(copied).not.toBeNull();
    if (!copied) throw new Error('copyDay did not return the copied day');
    expect(copied.workoutDate.toISOString()).toBe('2026-10-08T00:00:00.000Z');
  });

  it('rejeita reparenting de exercício entre dias do mesmo contrato', async () => {
    const { fixture } = await editableFixture('issue399-exercise-reparenting');
    const source = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId },
      select: { templateId: true },
    });
    const target = await workoutService.getOrCreateDay({
      templateId: source.templateId,
      dayOfWeek: 3,
      workoutDate: new Date('2026-10-07T12:00:00.000Z'),
    } as never);
    await expect(workoutService.updateExercise(fixture.exerciseIds[0], {
      workoutDayId: target.id,
      reps: 6,
    }, fixture.contractId)).rejects.toMatchObject({ code: 'INVALID_RESISTANCE_STRUCTURE' });
    const unchanged = await prisma.workoutExercise.findUniqueOrThrow({
      where: { id: fixture.exerciseIds[0] },
      select: { workoutDayId: true, reps: true },
    });
    expect(unchanged).toEqual({ workoutDayId: fixture.dayId, reps: 10 });
  });


  it.each([
    {
      caseName: 'âncora na quinta-feira',
      anchor: '2026-10-15T12:00:00.000Z',
      dates: ['2026-10-12T12:00:00.000Z', '2026-10-13T12:00:00.000Z', '2026-10-18T12:00:00.000Z'],
    },
    {
      caseName: 'âncora no domingo com mudança de mês',
      anchor: '2026-11-01T12:00:00.000Z',
      dates: ['2026-10-26T12:00:00.000Z', '2026-10-27T12:00:00.000Z', '2026-11-01T12:00:00.000Z'],
    },
    {
      caseName: 'âncora na virada de ano',
      anchor: '2026-12-31T12:00:00.000Z',
      dates: ['2026-12-28T12:00:00.000Z', '2026-12-29T12:00:00.000Z', '2027-01-03T12:00:00.000Z'],
    },
  ])('AUD-399-15: recalcula dias em UTC com $caseName sem perder séries e identidades', async ({ anchor, dates }) => {
    const { fixture, input } = await editableFixture('issue399-weekday-rebase');
    const day = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId }, include: { template: true },
    });
    await prisma.workoutDay.createMany({
      data: [
        { templateId: day.templateId, dayOfWeek: 1, workoutDate: new Date('2026-10-05T00:00:00.000Z') },
        { templateId: day.templateId, dayOfWeek: 7, workoutDate: new Date('2026-10-11T00:00:00.000Z') },
      ],
    });
    await workoutService.replaceDayResistanceExercises(fixture.dayId, input);
    const include = { exercises: { include: { resistanceBlocks: { include: { plannedSets: true } } } } } as const;
    const before = await prisma.workoutDay.findMany({
      where: { templateId: day.templateId }, orderBy: { dayOfWeek: 'asc' }, include,
    });
    expect(before.map((row) => row.dayOfWeek)).toEqual([1, 2, 7]);
    const originalIdentity = before.map((row) => ({
      dayId: row.id,
      exerciseIds: row.exercises.map((exercise) => exercise.id),
      blockIds: row.exercises.flatMap((exercise) => exercise.resistanceBlocks.map((block) => block.id)),
      plannedSetIds: row.exercises.flatMap((exercise) =>
        exercise.resistanceBlocks.flatMap((block) => block.plannedSets.map((set) => set.id))),
    }));

    const changed = await workoutService.getOrCreateTemplate({
      planId: day.template.planId,
      mesocycleNumber: day.template.mesocycleNumber,
      weekNumber: day.template.weekNumber,
      weekStartDate: new Date(anchor),
    });
    expect(changed?.weekStartDate).toEqual(new Date(anchor));
    expect(changed?.workoutDays.map((row) => row.workoutDate.toISOString())).toEqual(dates);

    const after = await prisma.workoutDay.findMany({
      where: { templateId: day.templateId }, orderBy: { dayOfWeek: 'asc' }, include,
    });
    expect(after.map((row) => row.workoutDate.toISOString())).toEqual(dates);
    expect(after.map((row) => ({
      dayId: row.id,
      exerciseIds: row.exercises.map((exercise) => exercise.id),
      blockIds: row.exercises.flatMap((exercise) => exercise.resistanceBlocks.map((block) => block.id)),
      plannedSetIds: row.exercises.flatMap((exercise) =>
        exercise.resistanceBlocks.flatMap((block) => block.plannedSets.map((set) => set.id))),
    }))).toEqual(originalIdentity);
    expect(after[1].exercises[0].resistanceBlocks[0].plannedSets[0]).toMatchObject({
      repsMin: 8, repsMax: 12, loadKg: 32.5, rir: 2,
    });
    expect(after[1].id).toBe(fixture.dayId);
  });

  it('resolve chamadas concorrentes ao criar o mesmo template semanal', async () => {
    const { fixture } = await editableFixture('issue399-template-create-race');
    const day = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId },
      select: { template: { select: { planId: true, mesocycleNumber: true } } },
    });
    const input = {
      planId: day.template.planId,
      mesocycleNumber: day.template.mesocycleNumber,
      weekNumber: 2,
      weekStartDate: new Date('2026-10-12T12:00:00.000Z'),
    };
    const suffix = randomUUID().replace(/-/g, '');
    const triggerName = `issue399_template_create_race_trigger_${suffix}`;
    const functionName = `issue399_template_create_race_fn_${suffix}`;
    const planId = input.planId.replace(/'/g, "''");

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
      BEGIN
        IF NEW."planId" = '${planId}'
          AND NEW."mesocycleNumber" = ${input.mesocycleNumber}
          AND NEW."weekNumber" = ${input.weekNumber} THEN
          PERFORM pg_sleep(0.2);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "WorkoutTemplate"
        FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
      `);
      const [first, second] = await Promise.all([
        workoutService.getOrCreateTemplate(input),
        workoutService.getOrCreateTemplate(input),
      ]);
      expect(first?.id).toBe(second?.id);
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${triggerName}" ON "WorkoutTemplate"`
      );
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    }

    expect(await prisma.workoutTemplate.count({
      where: {
        planId: input.planId,
        mesocycleNumber: input.mesocycleNumber,
        weekNumber: input.weekNumber,
      },
    })).toBe(1);
  });

  it('repete atualizações concorrentes após conflito serializável do template', async () => {
    const { fixture } = await editableFixture('issue399-template-update-race');
    const day = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId },
      select: { template: { select: { id: true } } },
    });
    const suffix = randomUUID().replace(/-/g, '');
    const triggerName = `issue399_template_update_race_trigger_${suffix}`;
    const functionName = `issue399_template_update_race_fn_${suffix}`;

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
      BEGIN
        IF NEW."id" = '${day.template.id}' THEN
          PERFORM pg_sleep(0.2);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER "${triggerName}" BEFORE UPDATE ON "WorkoutTemplate"
        FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
      `);
      const results = await Promise.all([
        workoutService.updateTemplate(day.template.id, { cyclicFrequency: 0 }),
        workoutService.updateTemplate(day.template.id, { cyclicFrequency: 0 }),
      ]);
      expect(results).toHaveLength(2);
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${triggerName}" ON "WorkoutTemplate"`
      );
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    }

    expect((await prisma.workoutTemplate.findUniqueOrThrow({
      where: { id: day.template.id },
    })).cyclicFrequency).toBe(0);
  });

  it('reabre exercício legado de treino liberado sem alterar as datas planejadas', async () => {
    const fixture = await seedReleasedWorkout('issue399-reopen-released-legacy');
    const before = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId },
      include: {
        template: true,
        exercises: {
          orderBy: { exerciseOrder: 'asc' },
          include: { resistanceBlocks: { include: { plannedSets: true } } },
        },
      },
    });

    const result = await workoutService.getOrCreateTemplate({
      planId: before.template.planId,
      mesocycleNumber: before.template.mesocycleNumber,
      weekNumber: before.template.weekNumber,
      weekStartDate: new Date(before.template.weekStartDate.getTime() + 604800000),
    });

    const returnedDay = result?.workoutDays.find((day) => day.id === fixture.dayId);
    expect(result?.id).toBe(before.templateId);
    expect(result?.released).toBe(true);
    expect(result?.weekStartDate).toEqual(before.template.weekStartDate);
    expect(returnedDay?.workoutDate).toEqual(before.workoutDate);
    expect(returnedDay?.exercises.map((exercise) => exercise.id)).toEqual(fixture.exerciseIds);
    expect(returnedDay?.exercises[0].resistanceBlocks).toEqual([]);

    const after = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId },
      include: { template: true },
    });
    expect(after.template.weekStartDate).toEqual(before.template.weekStartDate);
    expect(after.workoutDate).toEqual(before.workoutDate);
  });

  it('nega operações de edição legada envolvendo contrato de outro aluno', async () => {
    const own = await editableFixture('issue399-own-contract-legacy');
    const foreign = await editableFixture('issue399-foreign-contract-legacy');
    await expect(workoutService.addExercise({
      workoutDayId: own.fixture.dayId,
      exerciseId: own.input[0].exerciseId,
      section: 'sessao', exerciseOrder: 3,
    }, foreign.fixture.contractId)).rejects.toMatchObject({ code: 'RESISTANCE_DAY_NOT_FOUND' });
    await expect(workoutService.updateExercise(own.fixture.exerciseIds[0], {
      reps: 7,
    }, foreign.fixture.contractId)).rejects.toMatchObject({ code: 'RESISTANCE_DAY_NOT_FOUND' });
    await expect(workoutService.deleteExercise(own.fixture.exerciseIds[0],
      foreign.fixture.contractId)).rejects.toMatchObject({ code: 'RESISTANCE_DAY_NOT_FOUND' });
    expect(await prisma.workoutExercise.count({
      where: { workoutDayId: own.fixture.dayId },
    })).toBe(2);
  });


  it('impede movimentar blocos ou séries de um treino liberado para outro', async () => {
    const source = await editableFixture('issue399-frozen-source');
    const target = await editableFixture('issue399-editable-target');
    const origin = await workoutService.replaceDayResistanceExercises(source.fixture.dayId, source.input);
    await workoutService.replaceDayResistanceExercises(target.fixture.dayId, [
      { ...target.input[0], resistanceBlocks: [{ position: 1, kind: 'principal' as const,
        plannedSets: [{ position: 1, repsMin: 6 }] }] },
      target.input[1],
    ]);
    const day = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: source.fixture.dayId }, select: { templateId: true },
    });
    await prisma.workoutTemplate.update({
      where: { id: day.templateId }, data: { released: true, releasedAt: new Date() },
    });
    const block = origin[0].resistanceBlocks[0];
    const plannedSet = block.plannedSets[0];
    // A free destination position distinguishes the freeze trigger from unique constraints.
    const targetBlock = await prisma.workoutExerciseBlock.create({
      data: { workoutExerciseId: target.fixture.exerciseIds[0], position: 2, kind: 'principal' },
    });

    await expect(prisma.workoutExerciseBlock.update({
      where: { id: block.id },
      data: { workoutExercise: { connect: { id: target.fixture.exerciseIds[1] } } },
    })).rejects.toThrow();
    await expect(prisma.workoutExercisePlannedSet.update({
      where: { id: plannedSet.id },
      data: { block: { connect: { id: targetBlock.id } } },
    })).rejects.toThrow();
    const savedBlock = await prisma.workoutExerciseBlock.findUniqueOrThrow({
      where: { id: block.id },
    });
    const savedSet = await prisma.workoutExercisePlannedSet.findUniqueOrThrow({
      where: { id: plannedSet.id },
    });
    expect(savedBlock.workoutExerciseId).toBe(source.fixture.exerciseIds[0]);
    expect(savedSet.blockId).toBe(block.id);
  });

  it('rejeita reparenting SQL de blocos e séries entre alunos/contratos ainda em draft', async () => {
    const own = await editableFixture('issue399-draft-owner-source');
    const foreign = await editableFixture('issue399-draft-owner-target');
    const ownRows = await workoutService.replaceDayResistanceExercises(own.fixture.dayId, own.input);
    const foreignRows = await workoutService.replaceDayResistanceExercises(foreign.fixture.dayId, foreign.input);
    const ownBlock = ownRows[0].resistanceBlocks[0];
    const ownSet = ownBlock.plannedSets[0];
    const foreignBlock = foreignRows[0].resistanceBlocks[0];

    await expect(prisma.$executeRaw`
      UPDATE "WorkoutExerciseBlock"
      SET "workoutExerciseId" = ${foreign.fixture.exerciseIds[0]}
      WHERE "id" = ${ownBlock.id}
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      UPDATE "WorkoutExercisePlannedSet"
      SET "blockId" = ${foreignBlock.id}
      WHERE "id" = ${ownSet.id}
    `).rejects.toThrow();

    await expect(prisma.workoutExerciseBlock.findUniqueOrThrow({ where: { id: ownBlock.id } }))
      .resolves.toMatchObject({ workoutExerciseId: own.fixture.exerciseIds[0] });
    await expect(prisma.workoutExercisePlannedSet.findUniqueOrThrow({ where: { id: ownSet.id } }))
      .resolves.toMatchObject({ blockId: ownBlock.id });
  });

  it('serializa início de execução antes de aceitar inserção SQL estrutural', async () => {
    const fixture = await editableFixture('issue399-structure-start-race');
    await workoutService.replaceDayResistanceExercises(fixture.fixture.dayId, fixture.input);
    const day = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.fixture.dayId },
      include: { template: { include: { plan: true } } },
    });
    const assembly = await prisma.consolidatedPrescription.findFirstOrThrow({
      where: { alunoId: fixture.fixture.alunoId },
    });
    const approved = await prisma.consolidatedPrescriptionVersion.findFirstOrThrow({
      where: { assemblyId: assembly.id, status: 'approved' },
    });
    const released = await prisma.consolidatedPrescriptionVersion.findFirstOrThrow({
      where: { assemblyId: assembly.id, status: 'released' },
    });
    const releaseDate = new Date('2026-10-05T12:00:00.000Z');
    const releaseId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "ConsolidatedPrescriptionOperationalRelease" (
        "id", "assemblyId", "sourceAssemblyVersionId", "sourceAssemblyVersion",
        "releasedAssemblyVersionId", "releasedAssemblyVersion", "contractId", "alunoId",
        "trainingPlanId", "workoutTemplateId", "requestFingerprint",
        "releasedByProfessorId", "releasedAt", "createdAt"
      ) VALUES (
        ${releaseId}, ${assembly.id}, ${approved.id}, 1, ${released.id}, 2,
        ${fixture.fixture.contractId}, ${fixture.fixture.alunoId}, ${day.template.plan.id},
        ${day.template.id}, ${randomUUID()}, ${day.template.plan.professorId}, ${releaseDate}, ${releaseDate}
      )
    `;
    const executionId = randomUUID();
    const starting = concurrentPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT "id" FROM "WorkoutDay" WHERE "id" = ${fixture.fixture.dayId} FOR UPDATE
      `;
      await tx.$executeRaw`
        INSERT INTO "WorkoutSessionExecution" (
          "id", "workoutDayId", "alunoId", "contractId", "originReleaseId",
          "originWorkoutTemplateId", "originTrainingPlanId", "status", "version", "updatedAt"
        ) VALUES (
          ${executionId}, ${fixture.fixture.dayId}, ${fixture.fixture.alunoId},
          ${fixture.fixture.contractId}, ${releaseId}, ${day.template.id},
          ${day.template.plan.id}, 'not_started', 0, ${releaseDate}
        )
      `;
      await tx.$executeRaw`
        UPDATE "WorkoutSessionExecution"
        SET "status" = 'in_progress', "version" = 1, "startedAt" = ${releaseDate}
        WHERE "id" = ${executionId}
      `;
      await tx.$executeRaw`SELECT pg_sleep(0.25)`;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const blockInsert = prisma.$executeRaw`
      INSERT INTO "WorkoutExerciseBlock" ("id", "workoutExerciseId", "position", "kind")
      VALUES (${randomUUID()}, ${fixture.fixture.exerciseIds[0]}, 2, 'complementar')
    `;

    await expect(starting).resolves.toBeUndefined();
    await expect(blockInsert).rejects.toThrow();
  });

  it('AUD-399-27: rejeita posições fora da faixa e gaps por bypass SQL', async () => {
    const { fixture, input } = await editableFixture('issue399-position-negative-controls');
    await workoutService.replaceDayResistanceExercises(fixture.dayId, input);
    const block = await prisma.workoutExerciseBlock.findFirstOrThrow({
      where: { workoutExerciseId: fixture.exerciseIds[0] },
    });

    await expect(prisma.$executeRaw`
      INSERT INTO "WorkoutExerciseBlock" ("id", "workoutExerciseId", "position", "kind")
      VALUES (${randomUUID()}, ${fixture.exerciseIds[0]}, 13, 'principal')
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      INSERT INTO "WorkoutExercisePlannedSet" ("id", "blockId", "position")
      VALUES (${randomUUID()}, ${block.id}, 31)
    `).rejects.toThrow();

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "WorkoutExerciseBlock" ("id", "workoutExerciseId", "position", "kind")
        VALUES (${randomUUID()}, ${fixture.exerciseIds[0]}, 3, 'principal')
      `;
    })).rejects.toThrow();
  });

  it('AUD-399-17/18: rejeita execução legada estrangeira e congela seu grafo por SQL', async () => {
    const own = await seedReleasedWorkout('issue399-legacy-execution-own');
    const foreign = await seedReleasedWorkout('issue399-legacy-execution-foreign');
    const ownExecutionData = {
      id: randomUUID(),
      workoutExerciseId: own.exerciseIds[0],
      alunoId: own.alunoId,
      executionDate: new Date('2026-10-06T12:00:00.000Z'),
    };

    await expect(prisma.$executeRaw`
      INSERT INTO "WorkoutExecution" ("id", "workoutExerciseId", "alunoId", "executionDate")
      VALUES (${randomUUID()}, ${foreign.exerciseIds[0]}, ${own.alunoId}, ${ownExecutionData.executionDate})
    `).rejects.toThrow();

    await prisma.$executeRaw`
      INSERT INTO "WorkoutExecution" ("id", "workoutExerciseId", "alunoId", "executionDate")
      VALUES (${ownExecutionData.id}, ${ownExecutionData.workoutExerciseId}, ${ownExecutionData.alunoId}, ${ownExecutionData.executionDate})
    `;

    await expect(prisma.$executeRaw`
      UPDATE "WorkoutExercise"
      SET "reps" = 11
      WHERE "id" = ${own.exerciseIds[0]}
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      UPDATE "WorkoutTemplate"
      SET "weekStartDate" = '2026-10-12T12:00:00.000Z'
      WHERE "id" = (SELECT "templateId" FROM "WorkoutDay" WHERE "id" = ${own.dayId})
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      DELETE FROM "WorkoutExecution" WHERE "id" = ${ownExecutionData.id}
    `).rejects.toThrow();
  });

  it('não aceita id de linha estrangeira e não provoca escrita parcial', async () => {
    const { fixture, input } = await editableFixture('issue399-invalid');
    await expect(workoutService.replaceDayResistanceExercises(fixture.dayId, [
      { ...input[0], workoutExerciseId: 'foreign-row' },
      input[1],
    ])).rejects.toMatchObject({ code: 'INVALID_RESISTANCE_STRUCTURE' });
    expect(await prisma.workoutExercise.count({ where: { workoutDayId: fixture.dayId } })).toBe(2);
  });

  it('copyTemplate keeps destination dates, planned series and new identities at the target week', async () => {
    const { fixture, input } = await editableFixture('issue399-copy-dates');
    await workoutService.replaceDayResistanceExercises(fixture.dayId, input);
    const sourceDay = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId }, select: { templateId: true, workoutDate: true },
    });
    const targetAnchor = new Date('2026-10-12T12:00:00.000Z');
    const copied = await workoutService.copyTemplate(sourceDay.templateId, 2, targetAnchor);
    const destination = copied?.workoutDays.find((day) => day.dayOfWeek === 2);
    expect(copied?.weekStartDate).toEqual(targetAnchor);
    expect(destination?.workoutDate).toEqual(new Date('2026-10-13T12:00:00.000Z'));
    expect(destination?.workoutDate).not.toEqual(sourceDay.workoutDate);
    expect(destination?.id).not.toBe(fixture.dayId);
    expect(destination?.exercises.map((exercise) => exercise.id)).not.toEqual(fixture.exerciseIds);
    expect(destination?.exercises[0].resistanceBlocks[0].plannedSets[0]).toMatchObject({
      repsMin: 8, repsMax: 12, loadKg: 32.5, rir: 2,
    });
    expect((await prisma.workoutDay.findUniqueOrThrow({ where: { id: fixture.dayId } })).workoutDate)
      .toEqual(sourceDay.workoutDate);
  });

  it('copyTemplate rolls back destination deletion when a later exercise insert fails', async () => {
    const { fixture, input } = await editableFixture('issue399-copy-rollback');
    await workoutService.replaceDayResistanceExercises(fixture.dayId, input);
    const source = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId }, select: { template: { select: { id: true, planId: true } } },
    });
    const originalTarget = await workoutService.copyTemplate(
      source.template.id, 2, new Date('2026-10-12T12:00:00.000Z'),
    );
    const suffix = randomUUID().replace(/-/g, '');
    const triggerName = `issue399_copy_rollback_trigger_${suffix}`;
    const functionName = `issue399_copy_rollback_fn_${suffix}`;
    const planId = source.template.planId.replace(/'/g, "''");
    // Scope the fault injection to this fixture's plan and target week.
    // An exception after destination deletion must restore the old template,
    // its canonical days and all planned series.
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "WorkoutDay" d
          JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
          WHERE d."id" = NEW."workoutDayId"
            AND t."planId" = '${planId}' AND t."weekNumber" = 2
        ) THEN
          RAISE EXCEPTION 'issue399 forced copy failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "WorkoutExercise"
        FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
      `);
      await expect(workoutService.copyTemplate(
        source.template.id, 2, new Date('2026-10-12T12:00:00.000Z'),
      )).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "WorkoutExercise"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    }
    const restored = await prisma.workoutTemplate.findUniqueOrThrow({
      where: { id: originalTarget!.id },
      include: { workoutDays: { include: { exercises: { include: {
        resistanceBlocks: { include: { plannedSets: true } },
      } } } } },
    });
    expect(restored.workoutDays).toHaveLength(1);
    expect(restored.workoutDays[0].exercises).toHaveLength(2);
    expect(restored.workoutDays[0].exercises[0].resistanceBlocks[0].plannedSets[0].loadKg)
      .toBe(32.5);
    expect(await prisma.workoutTemplate.count({ where: {
      planId: source.template.planId, mesocycleNumber: 1, weekNumber: 2,
    } })).toBe(1);
  });

  it('copyTemplateSections rolls back the entire partial copy on a later insert failure', async () => {
    const { fixture, input } = await editableFixture('issue399-partial-copy-rollback');
    await workoutService.replaceDayResistanceExercises(fixture.dayId, input);
    const source = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId }, select: { templateId: true, template: { select: { planId: true } } },
    });
    const suffix = randomUUID().replace(/-/g, '');
    const triggerName = `issue399_partial_copy_trigger_${suffix}`;
    const functionName = `issue399_partial_copy_fn_${suffix}`;
    const planId = source.template.planId.replace(/'/g, "''");
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "WorkoutDay" d
          JOIN "WorkoutTemplate" t ON t."id" = d."templateId"
          WHERE d."id" = NEW."workoutDayId" AND t."planId" = '${planId}' AND t."weekNumber" = 2
        ) THEN RAISE EXCEPTION 'issue399 forced partial copy failure'; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "WorkoutExercise"
        FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
      `);
      await expect(workoutService.copyTemplateSections(
        source.templateId, 2, new Date('2026-10-12T12:00:00.000Z'), 'resistance',
      )).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "WorkoutExercise"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    }
    expect(await prisma.workoutTemplate.count({
      where: { planId: source.template.planId, mesocycleNumber: 1, weekNumber: 2 },
    })).toBe(0);
  });

  it('copyTemplateSections persists the destination anchor when replacing an existing week', async () => {
    const { fixture, input } = await editableFixture('issue399-partial-copy-anchor');
    await workoutService.replaceDayResistanceExercises(fixture.dayId, input);
    const source = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId }, select: { templateId: true, template: { select: { planId: true } } },
    });
    await workoutService.copyTemplate(source.templateId, 2, new Date('2026-10-12T12:00:00.000Z'));
    await workoutService.copyTemplateSections(
      source.templateId, 2, new Date('2026-10-15T12:00:00.000Z'), 'resistance',
    );
    const target = await prisma.workoutTemplate.findFirstOrThrow({
      where: { planId: source.template.planId, mesocycleNumber: 1, weekNumber: 2 },
      include: { workoutDays: true },
    });
    expect(target.weekStartDate).toEqual(new Date('2026-10-15T12:00:00.000Z'));
    expect(target.workoutDays[0].workoutDate).toEqual(new Date('2026-10-13T12:00:00.000Z'));
  });

  it('copyTemplateSections preserves sparse source day labels with canonical target dates', async () => {
    const { fixture, input } = await editableFixture('issue399-partial-copy-sparse-day');
    await workoutService.replaceDayResistanceExercises(fixture.dayId, input);
    await prisma.workoutDay.update({
      where: { id: fixture.dayId },
      data: { dayOfWeek: 5, workoutDate: new Date('2026-10-09T12:00:00.000Z') },
    });
    const source = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId }, select: { templateId: true },
    });

    const copied = await workoutService.copyTemplateSections(
      source.templateId, 2, new Date('2026-10-12T12:00:00.000Z'), 'resistance',
    );
    const destination = copied?.workoutDays.find((day) => day.dayOfWeek === 5);
    expect(destination?.workoutDate).toEqual(new Date('2026-10-16T12:00:00.000Z'));
  });

  it('rebases destination-only days when a partial copy changes the anchor', async () => {
    const { fixture, input } = await editableFixture('issue399-partial-copy-extra-day');
    await workoutService.replaceDayResistanceExercises(fixture.dayId, input);
    const source = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId }, select: { templateId: true },
    });
    await workoutService.copyTemplate(source.templateId, 2, new Date('2026-10-12T12:00:00.000Z'));
    const target = await prisma.workoutTemplate.findFirstOrThrow({
      where: { planId: (await prisma.workoutTemplate.findUniqueOrThrow({ where: { id: source.templateId } })).planId,
        mesocycleNumber: 1, weekNumber: 2 },
      include: { workoutDays: true },
    });
    const extraDay = await prisma.workoutDay.create({
      data: { templateId: target.id, dayOfWeek: 3, workoutDate: new Date('2026-10-14T12:00:00.000Z') },
    });
    await prisma.$executeRaw`
      UPDATE "WorkoutDay" SET "workoutDate" = '2026-10-14T12:00:00.000Z' WHERE "id" = ${extraDay.id}
    `;

    await workoutService.copyTemplateSections(
      source.templateId, 2, new Date('2026-10-19T12:00:00.000Z'), 'resistance',
    );
    const rebased = await prisma.workoutDay.findUniqueOrThrow({ where: { id: extraDay.id } });
    expect(rebased.workoutDate).toEqual(new Date('2026-10-21T12:00:00.000Z'));
  });

  it('AUD-399-12: rejects moving draft template/day across contracts without changing persisted ownership', async () => {
    const own = await editableFixture('issue399-parent-own');
    const foreign = await editableFixture('issue399-parent-foreign');
    const [ownDay, foreignDay] = await Promise.all([
      prisma.workoutDay.findUniqueOrThrow({
        where: { id: own.fixture.dayId },
        select: { templateId: true, template: { select: { planId: true } } },
      }),
      prisma.workoutDay.findUniqueOrThrow({
        where: { id: foreign.fixture.dayId },
        select: { templateId: true, template: { select: { planId: true } } },
      }),
    ]);
    expect(own.fixture.contractId).not.toBe(foreign.fixture.contractId);

    await expect(workoutService.updateTemplate(ownDay.templateId, {
      planId: foreignDay.template.planId,
    })).rejects.toMatchObject({ code: 'INVALID_RESISTANCE_STRUCTURE' });
    await expect(workoutService.updateDay(own.fixture.dayId, {
      templateId: foreignDay.templateId,
    })).rejects.toMatchObject({ code: 'INVALID_RESISTANCE_STRUCTURE' });
    await expect(workoutService.updateTemplate(ownDay.templateId, {
      plan: { connect: { id: foreignDay.template.planId } },
    } as never)).rejects.toMatchObject({ code: 'INVALID_RESISTANCE_STRUCTURE' });
    await expect(workoutService.updateDay(own.fixture.dayId, {
      template: { connect: { id: foreignDay.templateId } },
    } as never)).rejects.toMatchObject({ code: 'INVALID_RESISTANCE_STRUCTURE' });

    const [persistedDay, persistedTemplate] = await Promise.all([
      prisma.workoutDay.findUniqueOrThrow({ where: { id: own.fixture.dayId } }),
      prisma.workoutTemplate.findUniqueOrThrow({ where: { id: ownDay.templateId } }),
    ]);
    expect(persistedDay.templateId).toBe(ownDay.templateId);
    expect(persistedTemplate.planId).toBe(ownDay.template.planId);

    await workoutService.updateTemplate(ownDay.templateId, { observation1: 'Edição permitida' });
    await workoutService.updateDay(own.fixture.dayId, { detailNotes: 'Edição permitida' });
    expect((await prisma.workoutDay.findUniqueOrThrow({ where: { id: own.fixture.dayId } })).detailNotes)
      .toBe('Edição permitida');
  });


  it('AUD-399-14: blocks cross-contract nested Prisma writes with zero partial persistence', async () => {
    const own = await editableFixture('issue399-nested-own');
    const foreign = await editableFixture('issue399-nested-other-contract');
    const ownDay = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: own.fixture.dayId }, select: { templateId: true, detailNotes: true },
    });
    const foreignExercise = await prisma.workoutExercise.findUniqueOrThrow({
      where: { id: foreign.fixture.exerciseIds[0] }, select: { exerciseId: true },
    });
    const foreignDay = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: foreign.fixture.dayId }, select: { templateId: true, template: { select: { planId: true } } },
    });
    expect(own.fixture.contractId).not.toBe(foreign.fixture.contractId);
    const beforeCount = await prisma.workoutExercise.count({ where: { workoutDayId: own.fixture.dayId } });

    await expect(prisma.$executeRaw`
      UPDATE "WorkoutExercise" SET "exerciseId" = ${foreignExercise.exerciseId}
      WHERE "id" = ${own.fixture.exerciseIds[0]}
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      UPDATE "WorkoutDay" SET "templateId" = ${foreignDay.templateId}
      WHERE "id" = ${own.fixture.dayId}
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      UPDATE "WorkoutTemplate" SET "planId" = ${foreignDay.template.planId}
      WHERE "id" = ${ownDay.templateId}
    `).rejects.toThrow();

    const attempts: Array<() => Promise<unknown>> = [
      () => workoutService.updateDay(own.fixture.dayId, {
        exercises: { create: [{ exerciseId: foreignExercise.exerciseId, section: 'sessao' }] },
      } as never),
      () => workoutService.updateTemplate(ownDay.templateId, {
        workoutDays: { create: [{ dayOfWeek: 7 }] },
      } as never),
      () => workoutService.createWorkoutDay({
        templateId: ownDay.templateId, dayOfWeek: 7, workoutDate: new Date(),
        exercises: { create: [{ exerciseId: foreignExercise.exerciseId }] },
      } as never),
      () => workoutService.addExercise({
        ...own.input[0], exercise: { connect: { id: foreignExercise.exerciseId } },
      } as never, own.fixture.contractId),
      () => workoutService.updateExercise(own.fixture.exerciseIds[0], {
        executions: { create: [{ loadUsed: 500 }] },
      } as never, own.fixture.contractId),
      () => workoutService.replaceDayResistanceExercises(own.fixture.dayId, [
        { ...own.input[0], executionItems: { create: [{}] } },
      ] as never, own.fixture.contractId),
      () => workoutService.addExercise({
        ...own.input[0], exerciseId: foreignExercise.exerciseId,
      }, own.fixture.contractId),
    ];
    for (const action of attempts) {
      await expect(action()).rejects.toMatchObject({ code: 'INVALID_RESISTANCE_STRUCTURE' });
    }

    expect(await prisma.workoutExercise.count({
      where: { workoutDayId: own.fixture.dayId },
    })).toBe(beforeCount);
    expect(await prisma.workoutDay.findUniqueOrThrow({
      where: { id: own.fixture.dayId }, select: { templateId: true, detailNotes: true },
    })).toEqual(ownDay);
    await workoutService.updateDay(own.fixture.dayId, { detailNotes: 'edição legítima' });
    await workoutService.replaceDayResistanceExercises(own.fixture.dayId, own.input, own.fixture.contractId);
    expect((await prisma.workoutDay.findUniqueOrThrow({
      where: { id: own.fixture.dayId },
    })).detailNotes).toBe('edição legítima');
  });

  it('AUD-399-13: SQL rejects direct transfers INTO and OUT OF released templates even at free weekday positions', async () => {
    const editable = await editableFixture('issue399-transfer-editable');
    const released = await seedReleasedWorkout('issue399-transfer-released');
    const legacy = await seedReleasedWorkout('issue399-transfer-legacy', { publish: false });
    const [editableDay, releasedDay, legacyDay] = await Promise.all([
      prisma.workoutDay.findUniqueOrThrow({ where: { id: editable.fixture.dayId } }),
      prisma.workoutDay.findUniqueOrThrow({ where: { id: released.dayId } }),
      prisma.workoutDay.findUniqueOrThrow({ where: { id: legacy.dayId } }),
    ]);
    await prisma.workoutTemplate.update({
      where: { id: legacyDay.templateId },
      data: { released: true, releasedAt: new Date() },
    });

    const expectReleaseGuard = async (write: Promise<unknown>) => {
      try {
        await write;
        throw new Error('Expected SQLSTATE 23514: released planning must be immutable');
      } catch (error) {
        expect((error as { meta?: { code?: string } }).meta?.code).toBe('23514');
      }
    };

    // dayOfWeek=7 is intentionally unused in either target to refute
    // accidental protection by the [templateId,dayOfWeek] unique index.
    await expectReleaseGuard(prisma.$executeRaw`
      UPDATE "WorkoutDay" SET "templateId" = ${releasedDay.templateId}, "dayOfWeek" = 7
      WHERE "id" = ${editable.fixture.dayId}
    `);
    await expectReleaseGuard(prisma.$executeRaw`
      UPDATE "WorkoutDay" SET "templateId" = ${editableDay.templateId}, "dayOfWeek" = 7
      WHERE "id" = ${released.dayId}
    `);
    await expectReleaseGuard(prisma.$executeRaw`
      UPDATE "WorkoutDay" SET "templateId" = ${legacyDay.templateId}, "dayOfWeek" = 7
      WHERE "id" = ${editable.fixture.dayId}
    `);
    await expectReleaseGuard(prisma.$executeRaw`
      UPDATE "WorkoutDay" SET "templateId" = ${editableDay.templateId}, "dayOfWeek" = 7
      WHERE "id" = ${legacy.dayId}
    `);

    for (const [id, original] of [
      [editable.fixture.dayId, editableDay],
      [released.dayId, releasedDay],
      [legacy.dayId, legacyDay],
    ] as const) {
      const persisted = await prisma.workoutDay.findUniqueOrThrow({ where: { id } });
      expect(persisted.templateId).toBe(original.templateId);
      expect(persisted.dayOfWeek).toBe(original.dayOfWeek);
    }
  });

  it('copyTemplate refuses to replace a released destination and preserves its identifiers', async () => {
    const { fixture, input } = await editableFixture('issue399-copy-released');
    await workoutService.replaceDayResistanceExercises(fixture.dayId, input);
    const source = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId }, select: { templateId: true },
    });
    const destination = await workoutService.copyTemplate(
      source.templateId, 2, new Date('2026-10-12T12:00:00.000Z'),
    );
    await prisma.workoutTemplate.update({
      where: { id: destination!.id }, data: { released: true, releasedAt: new Date() },
    });
    await expect(workoutService.copyTemplate(
      source.templateId, 2, new Date('2026-10-12T12:00:00.000Z'),
    )).rejects.toMatchObject({ code: 'WORKOUT_PLANNING_LOCKED_AFTER_EXECUTION_START' });
    const persisted = await prisma.workoutTemplate.findUniqueOrThrow({
      where: { id: destination!.id },
      include: { workoutDays: { include: { exercises: true } } },
    });
    expect(persisted.released).toBe(true);
    expect(persisted.workoutDays[0].exercises).toHaveLength(2);
  });

});

describeDatabase('Issue #400 - canonical resistance exercise groups', () => {
  async function setup(label: string) {
    const fixture = await seedReleasedWorkout(label, { publish: false, seedResistance: true });
    const existing = await prisma.workoutExercise.findMany({
      where: { workoutDayId: fixture.dayId }, orderBy: { exerciseOrder: 'asc' },
    });
    await workoutService.replaceDayResistanceExercises(fixture.dayId, existing.map((exercise) => ({
      workoutDayId: fixture.dayId, workoutExerciseId: exercise.id,
      exerciseId: exercise.exerciseId, section: 'sessao',
      exerciseOrder: exercise.exerciseOrder, sets: exercise.sets ?? undefined,
      reps: exercise.reps ?? undefined,
    })));
    const day = await prisma.workoutDay.findUniqueOrThrow({
      where: { id: fixture.dayId }, select: { templateId: true },
    });
    const groups = [{
      position: 1, kind: 'bi_set' as const, rounds: 3,
      restBetweenExercisesSec: 12, restBetweenRoundsSec: 90, notes: 'Alternância',
      members: [
        { position: 1, section: 'sessao', exerciseOrder: 2 },
        { position: 2, section: 'sessao', exerciseOrder: 1 },
      ],
    }];
    return { fixture, templateId: day.templateId, groups };
  }

  it('cria e relê membros sem duplicar séries; replay preserva IDs, cópia reatribui corretamente', async () => {
    const { fixture, templateId, groups } = await setup('issue400-copy-and-replay');
    const beforeBlock = await prisma.workoutExerciseBlock.findFirstOrThrow({
      where: { workoutExerciseId: fixture.exerciseIds[0] }, include: { plannedSets: true },
    });
    const first = await workoutService.replaceDayResistanceGroups(fixture.dayId, groups, fixture.contractId);
    expect(first).toHaveLength(1);
    expect(first[0].members.map((item) => item.workoutExerciseId)).toEqual([
      fixture.exerciseIds[1], fixture.exerciseIds[0],
    ]);
    const replay = await workoutService.replaceDayResistanceGroups(fixture.dayId, groups, fixture.contractId);
    expect(replay[0].id).toBe(first[0].id);
    expect(replay[0].members.map((item) => item.id)).toEqual(first[0].members.map((item) => item.id));
    expect(await prisma.workoutExercise.count({ where: { workoutDayId: fixture.dayId } })).toBe(2);
    expect((await prisma.workoutExerciseBlock.findUniqueOrThrow({
      where: { id: beforeBlock.id }, include: { plannedSets: true },
    })).plannedSets[0].id).toBe(beforeBlock.plannedSets[0].id);

    const copy = await workoutService.copyTemplate(templateId, 2, new Date('2026-10-12T12:00:00.000Z'));
    if (!copy) throw new Error('A cópia da semana não retornou um treino.');
    const copiedDay = copy.workoutDays.find((day) => day.dayOfWeek === 2)!;
    expect(copiedDay.resistanceGroups).toHaveLength(1);
    const copiedGroup = copiedDay.resistanceGroups[0];
    expect(copiedGroup.id).not.toBe(first[0].id);
    expect(copiedGroup.kind).toBe('bi_set');
    expect(copiedGroup.rounds).toBe(3);
    expect(copiedGroup.members.map((member) => member.workoutExerciseId)).toEqual([
      copiedDay.exercises.find((row) => row.exerciseOrder === 2)?.id,
      copiedDay.exercises.find((row) => row.exerciseOrder === 1)?.id,
    ]);
    expect(copiedDay.exercises.map((row) => row.id)).not.toEqual(fixture.exerciseIds);
    expect(copiedDay.exercises[0].resistanceBlocks[0].plannedSets[0].repsMin).toBe(8);

    const afterCyclicOnly = await workoutService.copyTemplateSections(
      templateId, 2, new Date('2026-10-12T12:00:00.000Z'), 'cyclic',
    );
    if (!afterCyclicOnly) throw new Error('A cópia cíclica não retornou um treino.');
    const cyclicDay = afterCyclicOnly.workoutDays.find((day) => day.dayOfWeek === 2)!;
    expect(cyclicDay.resistanceGroups[0].id).toBe(copiedGroup.id);
    const afterResistance = await workoutService.copyTemplateSections(
      templateId, 2, new Date('2026-10-12T12:00:00.000Z'), 'resistance',
    );
    if (!afterResistance) throw new Error('A cópia resistida não retornou um treino.');
    expect(afterResistance.workoutDays.find((day) => day.dayOfWeek === 2)?.resistanceGroups[0].members).toHaveLength(2);
  });

  it('valida contrato, rollback e membros do dia, suporta edição/exclusão no rascunho e bloqueia após liberação', async () => {
    const { fixture, templateId, groups } = await setup('issue400-locks');
    await expect(workoutService.replaceDayResistanceGroups(fixture.dayId, groups, 'foreign-contract'))
      .rejects.toMatchObject({ code: 'RESISTANCE_DAY_NOT_FOUND' });
    await expect(workoutService.replaceDayResistanceGroups(fixture.dayId, [
      { ...groups[0], members: [
        groups[0].members[0], { position: 2, section: 'sessao', exerciseOrder: 99 },
      ] },
    ], fixture.contractId)).rejects.toMatchObject({ code: 'INVALID_RESISTANCE_STRUCTURE' });
    expect(await prisma.workoutResistanceGroup.count({ where: { workoutDayId: fixture.dayId } })).toBe(0);

    const persisted = await workoutService.saveTemplateWeek(templateId, {
      resistanceGroups: { 2: groups }, template: { observation1: 'valid' },
    }, fixture.contractId);
    if (!persisted) throw new Error('O salvamento semanal não retornou o treino.');
    expect(persisted.workoutDays.find((day) => day.dayOfWeek === 2)?.resistanceGroups[0]).toMatchObject({
      kind: 'bi_set', rounds: 3, restBetweenRoundsSec: 90,
    });
    await expect(workoutService.saveTemplateWeek(templateId, {
      resistanceGroups: { 2: [{ ...groups[0], members: [
        groups[0].members[0], { position: 2, section: 'sessao', exerciseOrder: 99 },
      ] }] }, template: { observation1: 'rollback-marker' },
    }, fixture.contractId)).rejects.toMatchObject({ code: 'INVALID_RESISTANCE_STRUCTURE' });
    expect((await prisma.workoutTemplate.findUniqueOrThrow({ where: { id: templateId } })).observation1)
      .toBe('valid');

    await workoutService.replaceDayResistanceGroups(fixture.dayId, [
      { ...groups[0], kind: 'circuito', rounds: 4 },
    ], fixture.contractId);
    expect((await prisma.workoutResistanceGroup.findFirstOrThrow({ where: { workoutDayId: fixture.dayId } })).kind).toBe('circuito');
    await workoutService.replaceDayResistanceGroups(fixture.dayId, [], fixture.contractId);
    expect(await prisma.workoutResistanceGroup.count({ where: { workoutDayId: fixture.dayId } })).toBe(0);
    const [frozen] = await workoutService.replaceDayResistanceGroups(fixture.dayId, groups, fixture.contractId);
    await workoutService.releaseTemplate(templateId);
    await expect(workoutService.replaceDayResistanceGroups(fixture.dayId, [], fixture.contractId))
      .rejects.toMatchObject({ code: 'WORKOUT_PLANNING_LOCKED_AFTER_EXECUTION_START' });
    await expect(prisma.$executeRaw`
      UPDATE "WorkoutResistanceGroup" SET "rounds" = 7 WHERE "id" = ${frozen.id}
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      DELETE FROM "WorkoutResistanceGroupMember" WHERE "groupId" = ${frozen.id}
    `).rejects.toThrow();
    expect((await prisma.workoutResistanceGroup.findUniqueOrThrow({
      where: { id: frozen.id }, include: { members: true },
    })).members).toHaveLength(2);
  });

  it('permite excluir dias editáveis em cascata sem criar grupos órfãos', async () => {
    const { fixture, groups } = await setup('issue400-draft-delete');
    await workoutService.replaceDayResistanceGroups(fixture.dayId, groups, fixture.contractId);
    expect(await prisma.workoutResistanceGroup.count({ where: { workoutDayId: fixture.dayId } })).toBe(1);
    await prisma.workoutDay.delete({ where: { id: fixture.dayId } });
    expect(await prisma.workoutResistanceGroup.count({ where: { workoutDayId: fixture.dayId } })).toBe(0);
  });

  it('rejeita associação de outro dia no próprio PostgreSQL, incluindo escrita fora da API', async () => {
    const { fixture } = await setup('issue400-crossday');
    const second = await seedReleasedWorkout('issue400-foreign-day', { publish: false });
    await expect(prisma.$transaction(async (tx) => {
      const group = await tx.workoutResistanceGroup.create({
        data: { workoutDayId: fixture.dayId, kind: 'bloco_tecnico', position: 1 },
      });
      await tx.workoutResistanceGroupMember.create({
        data: { groupId: group.id, workoutExerciseId: second.exerciseIds[0], position: 1 },
      });
    })).rejects.toThrow();
    expect(await prisma.workoutResistanceGroup.count({ where: { workoutDayId: fixture.dayId } })).toBe(0);
  });

  it('A-400-01: exclusão individual desfaz bi-set insuficiente e compacta grupos restantes', async () => {
    const { fixture, groups } = await setup('issue400-delete-from-biset');
    const canonical = await prisma.workoutExercise.findUniqueOrThrow({
      where: { id: fixture.exerciseIds[0] },
    });
    const third = await prisma.workoutExercise.create({
      data: {
        workoutDayId: fixture.dayId, exerciseId: canonical.exerciseId,
        section: 'sessao', exerciseOrder: 3,
      },
    });
    const created = await workoutService.replaceDayResistanceGroups(fixture.dayId, [
      groups[0],
      {
        position: 2, kind: 'bloco_tecnico', members: [
          { position: 1, section: 'sessao', exerciseOrder: 3 },
        ],
      },
    ], fixture.contractId);
    const survivingGroupId = created[1].id;

    await workoutService.deleteExercise(fixture.exerciseIds[0], fixture.contractId);

    const after = await prisma.workoutResistanceGroup.findMany({
      where: { workoutDayId: fixture.dayId },
      orderBy: { position: 'asc' },
      include: { members: true },
    });
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: survivingGroupId, position: 1, kind: 'bloco_tecnico' });
    expect(after[0].members).toMatchObject([{ position: 1, workoutExerciseId: third.id }]);
    expect(await prisma.workoutExercise.count({ where: { workoutDayId: fixture.dayId } })).toBe(2);
    expect(await prisma.workoutExercise.findUnique({ where: { id: fixture.exerciseIds[1] } })).not.toBeNull();
  });

  it('A-400-01: exclusão mantém grupo ainda válido e compacta posições dos membros', async () => {
    const { fixture, groups } = await setup('issue400-delete-member-compaction');
    const [created] = await workoutService.replaceDayResistanceGroups(fixture.dayId, [
      { ...groups[0], kind: 'bloco_tecnico' },
    ], fixture.contractId);
    await workoutService.deleteExercise(fixture.exerciseIds[1], fixture.contractId);
    const persisted = await prisma.workoutResistanceGroup.findUniqueOrThrow({
      where: { id: created.id }, include: { members: true },
    });
    expect(persisted.members).toMatchObject([
      { position: 1, workoutExerciseId: fixture.exerciseIds[0] },
    ]);
  });

  it('A-400-01: snapshot semanal e substituição de exercícios conciliam grupos omitidos', async () => {
    const week = await setup('issue400-week-removes-exercise');
    await workoutService.replaceDayResistanceGroups(week.fixture.dayId, week.groups, week.fixture.contractId);
    const second = await prisma.workoutExercise.findUniqueOrThrow({
      where: { id: week.fixture.exerciseIds[1] },
    });
    await workoutService.saveTemplateWeek(week.templateId, {
      resistedExercises: {
        2: {
          sessao: [{
            workoutExerciseId: second.id, exerciseId: second.exerciseId,
            exerciseOrder: 1, sets: second.sets, reps: second.reps,
          }],
        },
      },
    }, week.fixture.contractId);
    expect(await prisma.workoutResistanceGroup.count({
      where: { workoutDayId: week.fixture.dayId },
    })).toBe(0);
    expect(await prisma.workoutExercise.count({ where: { workoutDayId: week.fixture.dayId } })).toBe(1);

    const direct = await setup('issue400-day-removes-exercise');
    await workoutService.replaceDayResistanceGroups(direct.fixture.dayId, direct.groups, direct.fixture.contractId);
    const remaining = await prisma.workoutExercise.findUniqueOrThrow({
      where: { id: direct.fixture.exerciseIds[1] },
    });
    await workoutService.replaceDayResistanceExercises(direct.fixture.dayId, [{
      workoutDayId: direct.fixture.dayId,
      workoutExerciseId: remaining.id,
      exerciseId: remaining.exerciseId, section: 'sessao', exerciseOrder: 1,
      sets: remaining.sets ?? undefined, reps: remaining.reps ?? undefined,
    }], direct.fixture.contractId);
    expect(await prisma.workoutResistanceGroup.count({
      where: { workoutDayId: direct.fixture.dayId },
    })).toBe(0);
    expect(await prisma.workoutExercise.count({ where: { workoutDayId: direct.fixture.dayId } })).toBe(1);
  });

  it('A-400-02: reordenação parcial normaliza posições e mapeia participantes reais', async () => {
    const { fixture, groups } = await setup('issue400-partial-reorder');
    await workoutService.reorderExercises(fixture.dayId, 'sessao', [
      fixture.exerciseIds[1],
    ], fixture.contractId);
    const afterReorder = await prisma.workoutExercise.findMany({
      where: { workoutDayId: fixture.dayId, section: 'sessao' },
      orderBy: { exerciseOrder: 'asc' },
      select: { id: true, exerciseOrder: true },
    });
    expect(afterReorder.map((row) => row.id)).toEqual([
      fixture.exerciseIds[1], fixture.exerciseIds[0],
    ]);
    expect(afterReorder.map((row) => row.exerciseOrder)).toEqual([1, 2]);
    const [created] = await workoutService.replaceDayResistanceGroups(
      fixture.dayId, groups, fixture.contractId,
    );
    expect(created.members.map((row) => row.workoutExerciseId)).toEqual([
      fixture.exerciseIds[0], fixture.exerciseIds[1],
    ]);
  });

  it('A-400-02: posições legadas duplicadas são rejeitadas sem associação arbitrária', async () => {
    const { fixture, groups } = await setup('issue400-ambiguous-slots');
    await prisma.workoutExercise.update({
      where: { id: fixture.exerciseIds[1] }, data: { exerciseOrder: 1 },
    });
    await expect(workoutService.replaceDayResistanceGroups(
      fixture.dayId, groups, fixture.contractId,
    )).rejects.toMatchObject({ code: 'INVALID_RESISTANCE_STRUCTURE' });
    expect(await prisma.workoutResistanceGroup.count({
      where: { workoutDayId: fixture.dayId },
    })).toBe(0);
  });

  it('REC-400: reenvio igual preserva revisão e IDs em rotas de dia e semana', async () => {
    const { fixture, templateId, groups } = await setup('issue400-identical-noop');
    const [first] = await workoutService.replaceDayResistanceGroups(
      fixture.dayId, groups, fixture.contractId,
    );
    const before = await prisma.workoutTemplate.findUniqueOrThrow({
      where: { id: templateId }, select: { updatedAt: true },
    });
    const [replayed] = await workoutService.replaceDayResistanceGroups(
      fixture.dayId, groups, fixture.contractId,
    );
    expect(replayed.id).toBe(first.id);
    expect(replayed.members.map((row) => row.id)).toEqual(first.members.map((row) => row.id));
    const afterDay = await prisma.workoutTemplate.findUniqueOrThrow({
      where: { id: templateId }, select: { updatedAt: true },
    });
    expect(afterDay.updatedAt.getTime()).toBe(before.updatedAt.getTime());

    const week = await workoutService.saveTemplateWeek(templateId, {
      resistanceGroups: { 2: groups }, baseUpdatedAt: before.updatedAt.toISOString(),
    }, fixture.contractId);
    if (!week) throw new Error('A semana regravada não foi encontrada.');
    expect(week.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    const persisted = await prisma.workoutResistanceGroup.findFirstOrThrow({
      where: { workoutDayId: fixture.dayId },
      include: { members: { orderBy: { position: 'asc' } } },
    });
    expect(persisted.id).toBe(first.id);
    expect(persisted.members.map((row) => row.id)).toEqual(first.members.map((row) => row.id));
  });

});
