import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { createCombinedConflictSourceService } from '../src/modules/consolidated-prescriptions/combined-training-conflicts.service.js';
import { createWorkoutSessionExecutionService } from '../src/modules/workout/workout-session-execution.service.js';
import { createPostWorkoutFeedbackPersistenceService } from '../src/modules/post-workout-feedback/post-workout-feedback-persistence.service.js';
import { consolidatedPrescriptionRoutes } from '../src/modules/consolidated-prescriptions/index.js';
const request = require('supertest');
import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  UserType,
} from '@prisma/client';
import { createConsolidatedPrescriptionReleaseService } from '../src/modules/consolidated-prescriptions/consolidated-prescription-release.service.js';
import { createConsolidatedPrescriptionTraceabilityService } from '../src/modules/consolidated-prescriptions/consolidated-prescription-traceability.service.js';
import { CONSOLIDATED_OPERATIONAL_PROJECTION_ORIGIN } from '../src/modules/consolidated-prescriptions/consolidated-prescription-operational-integrity.js';

const runDatabaseIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
if (runDatabaseIntegrationTests) jest.setTimeout(30_000);

const prisma = new PrismaClient();
const concurrentPrisma = new PrismaClient();
const service = createConsolidatedPrescriptionReleaseService(prisma);
const concurrentService = createConsolidatedPrescriptionReleaseService(concurrentPrisma);
const traceabilityService = createConsolidatedPrescriptionTraceabilityService(prisma);

const CAPACITIES = ['resisted', 'flexibility', 'cyclic', 'balance'] as const;
const RELEASE_NOW = new Date('2026-08-16T12:00:00.000Z');

const FLEXIBILITY_PARAMETERS = {
  articulations: [
    {
      name: 'Ombro',
      angle: 120,
      deficit: '10°',
      priority: 'high',
      suggestedPrescription: '3 x 30 s',
    },
  ],
  expectedPse: 3,
} as const;
const BALANCE_PARAMETERS = {
  focus: 'estabilidade unipodal',
  supports: ['bipodal', 'unipodal'],
  progressionNotes: 'reduzir apoio progressivamente',
  expectedPse: 2,
} as const;
const CYCLIC_PARAMETERS = { category: 'continuous', time: '30 min' } as const;
const CYCLIC_DISTANCE_ONLY_PARAMETERS = { distance: '5 km' } as const;
const FLEXIBILITY_NOTE =
  'Flexibilidade — Ombro (prescrição: 3 x 30 s, ângulo: 120°, déficit: 10°, prioridade: alta). PSE esperada: 3.';
const BALANCE_NOTE =
  'Equilíbrio — Foco: estabilidade unipodal. Apoios: bipodal, unipodal. Progressão: reduzir apoio progressivamente. PSE esperada: 2.';

type Fixture = {
  contractId: string;
  professorId: string;
  professorUserId: string;
  professorEmail: string;
  alunoId: string;
  alunoUserId: string;
  planId: string;
  assemblyId: string;
  sourceVersionId: string;
  capacityVersionIds: Record<(typeof CAPACITIES)[number], string>;
};

function contextFor(fixture: Fixture) {
  return {
    contractId: fixture.contractId,
    alunoId: fixture.alunoId,
    actorProfessorId: fixture.professorId,
  };
}

function commandFor(fixture: Fixture, includeResisted = false, resistedOnNextDay = false) {
  return {
    expectedCurrentVersion: 1,
    target: {
      trainingPlanId: fixture.planId,
      mesocycleNumber: 1,
      weekNumber: 1,
      weekStartDate: '2026-08-17T00:00:00.000Z',
      placements: [
        {
          projectionKey: 'flexibility:release-test',
          dayOfWeek: 1,
          workoutDate: '2026-08-17T00:00:00.000Z',
        },
        {
          projectionKey: 'cyclic:release-test',
          dayOfWeek: 1,
          workoutDate: '2026-08-17T00:00:00.000Z',
        },
        {
          projectionKey: 'balance:release-test',
          dayOfWeek: 1,
          workoutDate: '2026-08-17T00:00:00.000Z',
        },
        ...(includeResisted ? [{
          projectionKey: 'resisted:release-test', dayOfWeek: resistedOnNextDay ? 2 : 1,
          workoutDate: resistedOnNextDay ? '2026-08-18T00:00:00.000Z' : '2026-08-17T00:00:00.000Z',
          section: 'principal', exerciseOrder: 1,
        }] : []),
      ],
    },
  };
}

function capacityParameters(capacity: (typeof CAPACITIES)[number]) {
  if (capacity === 'flexibility') {
    return { type: 'flexibility', flexibility: FLEXIBILITY_PARAMETERS };
  }
  if (capacity === 'balance') {
    return { type: 'balance', balance: BALANCE_PARAMETERS };
  }
  if (capacity === 'cyclic') {
    return { type: 'cyclic', cyclic: CYCLIC_PARAMETERS };
  }
  return { type: 'resisted', resisted: {} };
}

async function seedFixture(label: string, includeResisted = false, cyclicDistanceOnly = false): Promise<Fixture> {
  const suffix = `${label}-${randomUUID()}`;
  const contractId = `issue-320-${suffix}`;

  await prisma.companyContract.create({
    data: {
      id: contractId,
      type: ContractType.academy,
      document: randomUUID().replace(/-/g, '').slice(0, 14),
      name: `Issue 320 ${label}`,
    },
  });

  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId,
      name: 'Gestor de teste',
      code: `issue-320-manager-${randomUUID()}`,
      isActive: true,
    },
  });

  const professorUser = await prisma.user.create({
    data: {
      email: `issue-320-${randomUUID()}@example.com`,
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
      email: `issue-320-aluno-${randomUUID()}@example.com`,
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

  const capacityVersionIds = {} as Fixture['capacityVersionIds'];
  for (const capacity of CAPACITIES) {
    const root = await prisma.capacityPrescription.create({
      data: {
        contractId,
        alunoId: aluno.id,
        capacity,
        status: 'active',
        currentVersion: 1,
        createdByProfessorId: professor.id,
        updatedByProfessorId: professor.id,
      },
    });
    const version = await prisma.capacityPrescriptionVersion.create({
      data: {
        prescriptionId: root.id,
        contractId,
        alunoId: aluno.id,
        responsibleProfessorId: professor.id,
        capacity,
        status: 'active',
        version: 1,
        technicalJustification: `Justificativa ${capacity}`,
        professorSummary: `Resumo ${capacity}`,
        studentMessage: `Orientação ${capacity}`,
        parameters: capacity === 'cyclic' && cyclicDistanceOnly
          ? { type: 'cyclic', cyclic: CYCLIC_DISTANCE_ONLY_PARAMETERS }
          : capacityParameters(capacity),
      },
    });
    capacityVersionIds[capacity] = version.id;
  }

  const assembly = await prisma.consolidatedPrescription.create({
    data: {
      contractId,
      alunoId: aluno.id,
      currentVersion: 1,
      currentStatus: 'approved',
      createdByProfessorId: professor.id,
      updatedByProfessorId: professor.id,
    },
  });
  const approvedAt = new Date('2026-08-12T12:00:00.000Z');
  const source = await prisma.consolidatedPrescriptionVersion.create({
    data: {
      assemblyId: assembly.id,
      contractId,
      alunoId: aluno.id,
      version: 1,
      status: 'approved',
      responsibleProfessorId: professor.id,
      professorJustification: 'Montagem aprovada para teste de liberação.',
      approvedByProfessorId: professor.id,
      approvedAt,
      createdByProfessorId: professor.id,
      conflicts: [],
    },
  });

  for (const [position, capacity] of CAPACITIES.entries()) {
    await prisma.consolidatedPrescriptionCapacityBlock.create({
      data: {
        assemblyVersionId: source.id,
        contractId,
        alunoId: aluno.id,
        capacityPrescriptionVersionId: capacityVersionIds[capacity],
        capacity,
        capacityVersion: 1,
        capacityStatus: 'active',
        position,
      },
    });
  }

  const resistanceExercise = includeResisted ? await prisma.exerciseLibrary.create({
    data: { contractId, name: 'Resistido da montagem consolidada' },
  }) : null;

  const projections = [
    {
      key: 'resisted:release-test',
      capacity: 'resisted',
      target: includeResisted ? 'WorkoutExercise' : 'WorkoutTemplate',
      proposedFields: includeResisted
        ? { WorkoutExercise: { sets: 3, reps: 10 } }
        : { WorkoutTemplate: { trainingMethod: 'combined' } },
      sourceParameters: {},
      ...(resistanceExercise ? { effectiveExerciseLibraryId: resistanceExercise.id } : {}),
    },
    {
      key: 'flexibility:release-test',
      capacity: 'flexibility',
      target: 'WorkoutDay',
      proposedFields: {
        WorkoutDay: { detailNotes: FLEXIBILITY_NOTE },
        WorkoutDayCapacityOperationalBlock: {
          contractVersion: 1,
          capacity: 'flexibility',
          capacityPrescriptionVersionId: capacityVersionIds.flexibility,
          parameters: FLEXIBILITY_PARAMETERS,
        },
      },
      sourceParameters: FLEXIBILITY_PARAMETERS,
    },
    {
      key: 'cyclic:release-test',
      capacity: 'cyclic',
      target: 'WorkoutDay',
      proposedFields: cyclicDistanceOnly
        ? { WorkoutTemplate: { totalVolumeKm: 5 } }
        : { WorkoutDay: { method: 'continuous', stimulusDurationMin: 30 } },
      sourceParameters: cyclicDistanceOnly ? CYCLIC_DISTANCE_ONLY_PARAMETERS : CYCLIC_PARAMETERS,
    },
    {
      key: 'balance:release-test',
      capacity: 'balance',
      target: 'WorkoutDay',
      proposedFields: {
        WorkoutDay: { complementNotes: BALANCE_NOTE },
        WorkoutDayCapacityOperationalBlock: {
          contractVersion: 1,
          capacity: 'balance',
          capacityPrescriptionVersionId: capacityVersionIds.balance,
          parameters: BALANCE_PARAMETERS,
        },
      },
      sourceParameters: BALANCE_PARAMETERS,
    },
  ] as const;

  for (const projection of projections) {
    await prisma.consolidatedPrescriptionDataRef.create({
      data: {
        assemblyVersionId: source.id,
        role: 'manual_observation',
        sourceType: 'operational_projection',
        sourceId: projection.key,
        label: `Projection ${projection.capacity}`,
        origin: CONSOLIDATED_OPERATIONAL_PROJECTION_ORIGIN,
        sourceVersion: '1',
        responsibleProfessorId: professor.id,
        context: {
          kind: 'operational_projection_v1',
          key: projection.key,
          capacity: projection.capacity,
          capacityPrescriptionVersionId: capacityVersionIds[projection.capacity],
          target: projection.target,
          compatibility: 'mapped',
          proposedFields: projection.proposedFields,
          unsupportedParameters: [],
          sourceParameters: projection.sourceParameters,
          preparedForAssemblyVersion: 1,
          ...('effectiveExerciseLibraryId' in projection ? {
            effectiveExerciseLibraryId: projection.effectiveExerciseLibraryId,
          } : {}),
        },
      },
    });
  }

  return {
    contractId,
    professorId: professor.id,
    professorUserId: professorUser.id,
    professorEmail: professorUser.email,
    alunoId: aluno.id,
    alunoUserId: alunoUser.id,
    planId: plan.id,
    assemblyId: assembly.id,
    sourceVersionId: source.id,
    capacityVersionIds,
  };
}

async function ledgerCount(sourceVersionId: string) {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS "count"
    FROM "ConsolidatedPrescriptionOperationalRelease"
    WHERE "sourceAssemblyVersionId" = ${sourceVersionId}
  `;
  return Number(rows[0]?.count ?? 0n);
}

async function dropFailureInjection() {
  await prisma.$executeRawUnsafe(
    'DROP TRIGGER IF EXISTS "test_issue320_fail_release_insert" ON "ConsolidatedPrescriptionOperationalRelease"'
  );
  await prisma.$executeRawUnsafe(
    'DROP FUNCTION IF EXISTS "test_issue320_fail_release_insert"()'
  );
}

async function installFailureInjection() {
  await dropFailureInjection();
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION "test_issue320_fail_release_insert"()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'issue 320 injected release failure';
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "test_issue320_fail_release_insert"
    BEFORE INSERT ON "ConsolidatedPrescriptionOperationalRelease"
    FOR EACH ROW EXECUTE FUNCTION "test_issue320_fail_release_insert"()
  `);
}

describeDatabase('consolidated prescription operational release - issue 320', () => {
  afterEach(async () => {
    await dropFailureInjection();
  });

  afterAll(async () => {
    await dropFailureInjection();
    await Promise.all([prisma.$disconnect(), concurrentPrisma.$disconnect()]);
  });

  it('libera as quatro capacidades uma vez, responde retry idempotente e expõe a cadeia por ID de dia', async () => {
    const fixture = await seedFixture('idempotency');
    const command = commandFor(fixture);

    const first = await service.release(contextFor(fixture), command, RELEASE_NOW);
    const repeated = await service.release(contextFor(fixture), command, RELEASE_NOW);

    expect(first.idempotent).toBe(false);
    expect(repeated.idempotent).toBe(true);
    expect(repeated.releaseId).toBe(first.releaseId);
    expect(await ledgerCount(fixture.sourceVersionId)).toBe(1);

    const template = await prisma.workoutTemplate.findUnique({
      where: { id: first.workoutTemplateId },
      include: { workoutDays: true },
    });
    expect(template?.released).toBe(true);
    expect(template?.releasedAt).not.toBeNull();
    expect(template?.workoutDays).toHaveLength(1);
    expect(template?.workoutDays[0]?.detailNotes).toBe(FLEXIBILITY_NOTE);
    expect(template?.workoutDays[0]?.complementNotes).toBe(BALANCE_NOTE);
    expect(template?.workoutDays[0]?.method).toBe('continuous');
    expect(template?.workoutDays[0]?.stimulusDurationMin).toBe(30);

    const assembly = await prisma.consolidatedPrescription.findUnique({
      where: { id: fixture.assemblyId },
    });
    expect(assembly?.currentStatus).toBe('released');
    expect(assembly?.currentVersion).toBe(2);

    const dayId = template?.workoutDays[0]?.id;
    if (!dayId) throw new Error('WorkoutDay não criado no teste da issue 320');
    const operationalBlocks = await prisma.$queryRaw<
      Array<{
        capacity: string;
        contractVersion: number;
        capacityPrescriptionVersionId: string;
        parameters: unknown;
      }>
    >`
      SELECT "capacity", "contractVersion", "capacityPrescriptionVersionId", "parameters"
      FROM "WorkoutDayCapacityOperationalBlock"
      WHERE "workoutDayId" = ${dayId}
      ORDER BY "capacity" ASC
    `;
    expect(operationalBlocks).toHaveLength(2);
    expect(operationalBlocks).toEqual(
      expect.arrayContaining([
        {
          capacity: 'flexibility',
          contractVersion: 1,
          capacityPrescriptionVersionId: fixture.capacityVersionIds.flexibility,
          parameters: FLEXIBILITY_PARAMETERS,
        },
        {
          capacity: 'balance',
          contractVersion: 1,
          capacityPrescriptionVersionId: fixture.capacityVersionIds.balance,
          parameters: BALANCE_PARAMETERS,
        },
      ])
    );

    const trace = await traceabilityService.getTraceability(contextFor(fixture), {
      workoutDayId: dayId,
    });
    expect(trace.release.releaseId).toBe(first.releaseId);
    expect(trace.consolidatedPrescription.sourceVersion.id).toBe(fixture.sourceVersionId);
    expect(trace.capacities).toHaveLength(4);
    expect(trace.sourceRefs).toHaveLength(4);
  });

  it('preserva capacidade cíclica de distância isolada na sessão correta com PostgreSQL real', async () => {
    const fixture = await seedFixture('cyclic-distance-only', true, true);
    const released = await service.release(contextFor(fixture), commandFor(fixture, true, true), RELEASE_NOW);
    const days = await prisma.workoutDay.findMany({
      where: { templateId: released.workoutTemplateId },
      orderBy: { dayOfWeek: 'asc' },
    });
    expect(days).toHaveLength(2);
    const [cyclicDay, resistedDay] = days;
    expect(cyclicDay.method).toBeNull();
    expect(cyclicDay.stimulusDurationMin).toBeNull();
    expect(cyclicDay.cyclicTimeMin).toBeNull();
    const template = await prisma.workoutTemplate.findUniqueOrThrow({
      where: { id: released.workoutTemplateId }, select: { totalVolumeKm: true },
    });
    expect(template.totalVolumeKm).toBe(5);
    const markers = await prisma.$queryRaw<Array<{
      id: string; workoutDayId: string; capacityPrescriptionVersionId: string; parameters: unknown;
    }>>`
      SELECT "id", "workoutDayId", "capacityPrescriptionVersionId", "parameters"
      FROM "WorkoutDayCyclicOperationalBlock"
      WHERE "workoutDayId" = ${cyclicDay.id}
    `;
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      workoutDayId: cyclicDay.id,
      capacityPrescriptionVersionId: fixture.capacityVersionIds.cyclic,
      parameters: CYCLIC_DISTANCE_ONLY_PARAMETERS,
    });
    const report = await createCombinedConflictSourceService(prisma).getReport({
      alunoId: fixture.alunoId, contractId: fixture.contractId,
      start: '2026-08-17T00:00:00.000Z', end: '2026-08-19T00:00:00.000Z',
    });
    expect(report).toMatchObject({
      state: 'no_active_rules', coverage: 'partial', changesWorkoutAutomatically: false,
      releasedSessionCount: 2, observationCount: 4,
    });
    const cyclicCapacities = report!.observations
      .filter((row) => row.sessionId === cyclicDay.id).map((row) => row.capacity).sort();
    const resistedCapacities = report!.observations
      .filter((row) => row.sessionId === resistedDay.id).map((row) => row.capacity).sort();
    expect(cyclicCapacities).toEqual(['balance', 'cyclic', 'flexibility']);
    expect(resistedCapacities).toEqual(['resisted']);
    const cyclic = report!.observations.find((row) => row.capacity === 'cyclic')!;
    expect(cyclic.provenance.operational).toEqual({
      kind: 'workout_capacity_block', recordId: markers[0].id,
    });
    expect(cyclic.provenance.capacityPrescription.recordId).toBe(fixture.capacityVersionIds.cyclic);
  });

  it('reproduz HTTP e PostgreSQL com release real, quatro capacidades e proveniência', async () => {
    const fixture = await seedFixture('combined-conflict-source', true);
    const released = await service.release(contextFor(fixture), commandFor(fixture, true), RELEASE_NOW);
    const day = await prisma.workoutDay.findFirstOrThrow({
      where: { templateId: released.workoutTemplateId },
    });
    await prisma.preWorkoutCheckIn.create({
      data: {
        workoutDayId: day.id, alunoId: fixture.alunoId, contractId: fixture.contractId,
        painLevel: 4, psr: 6, ruleSetVersion: 'pre-workout-check-in-v1', ruleSnapshot: {},
      },
    });
    const report = await createCombinedConflictSourceService(prisma).getReport({
      alunoId: fixture.alunoId, contractId: fixture.contractId,
      start: '2026-08-17T00:00:00.000Z', end: '2026-08-18T00:00:00.000Z',
    });
    expect(report).toMatchObject({
      state: 'no_active_rules', coverage: 'partial',
      releasedSessionCount: 1, observationCount: 4, changesWorkoutAutomatically: false,
    });
    expect(report!.observations.map((row) => row.capacity)).toEqual([
      'balance', 'cyclic', 'flexibility', 'resisted',
    ]);
    for (const row of report!.observations) {
      expect(row.provenance.release).toMatchObject({
        recordId: released.releaseId,
        version: String(released.releasedAssemblyVersion),
        assemblyVersionId: released.releasedAssemblyVersionId,
      });
      expect(row.provenance.capacityPrescription).toMatchObject({
        recordId: fixture.capacityVersionIds[row.capacity],
        version: '1',
      });
    }
    expect(report!.observations.find((row) => row.capacity === 'cyclic')?.numeric?.painLevel?.value).toBe(4);
    expect(report!.observations.find((row) => row.capacity === 'resisted')?.numeric).toEqual({});
    expect(report!.sessionSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: expect.objectContaining({ kind: 'check_in' }) }),
    ]));

    const app = express();
    app.use(express.json());
    app.use('/consolidated-prescriptions', consolidatedPrescriptionRoutes);
    const token = jwt.sign({
      userId: fixture.professorUserId, email: fixture.professorEmail, type: UserType.professor,
    }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '1h' });
    const response = await request(app)
      .get('/consolidated-prescriptions/alunos/' + fixture.alunoId +
        '/combined-conflicts?start=2026-08-17T00:00:00.000Z&end=2026-08-18T00:00:00.000Z')
      .set('Authorization', 'Bearer ' + token);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      releasedSessionCount: 1, observationCount: 4, coverage: 'partial',
    });
    expect(response.body.data.observations.map((row: { capacity: string }) => row.capacity))
      .toEqual(['balance', 'cyclic', 'flexibility', 'resisted']);

    const lifecycle = createWorkoutSessionExecutionService(prisma);
    await lifecycle.transition({
      sessionId: day.id, alunoId: fixture.alunoId, contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload: { operationKey: '403-real-feedback-start', expectedVersion: 0, targetStatus: 'in_progress' },
    });
    await lifecycle.transition({
      sessionId: day.id, alunoId: fixture.alunoId, contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload: {
        operationKey: '403-real-feedback-partial', expectedVersion: 1,
        targetStatus: 'partial', reason: 'Treino parcial registrado para validar fontes',
      },
    });
    const feedbackStore = createPostWorkoutFeedbackPersistenceService(prisma);
    const firstFeedback = await feedbackStore.createForStudent({
      sessionId: day.id, alunoId: fixture.alunoId, contractId: fixture.contractId,
      actorUserId: fixture.alunoUserId,
      payload: {
        operationKey: '403-session-feedback-original',
        values: {
          painAfter: 6, dizziness: true, fatigueLevel: 'high', sleepQuality: 'poor',
          observations: 'Texto livre confidencial jamais deve ser retornado na prévia',
        },
      },
    });
    const corrected = await feedbackStore.correctForProfessor({
      sessionId: day.id, alunoId: fixture.alunoId, contractId: fixture.contractId,
      actorUserId: fixture.professorUserId,
      payload: {
        operationKey: '403-session-feedback-corrected',
        baseRevisionId: firstFeedback.id,
        reason: 'Correção documentada do sinal geral da sessão',
        values: { painAfter: 8, dizziness: false },
      },
    });
    const capacityCases = [
      { capacity: 'cyclic', painAfter: 3, psr: 7 },
      { capacity: 'resisted', painAfter: 8, psr: 3 },
      { capacity: 'flexibility', painAfter: 6, psr: 4 },
      { capacity: 'balance', painAfter: 2, psr: 9 },
    ] as const;
    const correctedCapacityIds = new Map<string, string>();
    const previousCapacityIds: string[] = [];
    for (const item of capacityCases) {
      const originalCapacity = await feedbackStore.createForStudent({
        sessionId: day.id, alunoId: fixture.alunoId, contractId: fixture.contractId,
        actorUserId: fixture.alunoUserId,
        payload: {
          operationKey: '403-' + item.capacity + '-feedback-original',
          capacity: item.capacity,
          values: {
            painAfter: 1, psr: 1, dizziness: true, fatigueLevel: 'high', sleepQuality: 'poor',
            observations: 'Texto livre confidencial da capacidade',
          },
        },
      });
      const correctedCapacity = await feedbackStore.correctForProfessor({
        sessionId: day.id, alunoId: fixture.alunoId, contractId: fixture.contractId,
        actorUserId: fixture.professorUserId,
        payload: {
          operationKey: '403-' + item.capacity + '-feedback-corrected',
          baseRevisionId: originalCapacity.id,
          reason: 'Correção documentada do feedback específico da capacidade',
          values: {
            painAfter: item.painAfter, psr: item.psr, dizziness: false,
            fatigueLevel: 'low', sleepQuality: 'good',
          },
        },
      });
      previousCapacityIds.push(originalCapacity.id);
      correctedCapacityIds.set(item.capacity, correctedCapacity.id);
    }
    const afterRevision = await createCombinedConflictSourceService(prisma).getReport({
      alunoId: fixture.alunoId, contractId: fixture.contractId,
      start: '2026-08-17T00:00:00.000Z', end: '2026-08-18T00:00:00.000Z',
    });
    expect(afterRevision).toMatchObject({
      releasedSessionCount: 1, observationCount: 4, sessionSignalCount: 2,
      state: 'no_active_rules', coverage: 'partial', changesWorkoutAutomatically: false,
    });
    expect(afterRevision!.sessionSignals.filter((signal) => signal.source.kind === 'feedback'))
      .toEqual([expect.objectContaining({
        scopeKey: 'session',
        source: { kind: 'feedback', recordId: corrected.id, version: '2' },
        flags: { dizziness: { value: false, source: expect.any(Object) } },
        numeric: { painLevel: { value: 8, source: expect.any(Object) } },
        categorical: {
          fatigueLevel: { value: 'high', source: expect.any(Object) },
          sleepQuality: { value: 'poor', source: expect.any(Object) },
        },
      })]);
    for (const item of capacityCases) {
      const row = afterRevision!.observations.find((observation) => observation.capacity === item.capacity)!;
      const source = {
        kind: 'feedback', recordId: correctedCapacityIds.get(item.capacity), version: '2',
      };
      expect(row.numeric?.painLevel).toEqual({ value: item.painAfter, source });
      expect(row.numeric?.psr).toEqual({ value: item.psr, source });
      expect(row.flags?.dizziness).toEqual({ value: false, source });
      expect(row.categorical.fatigueLevel).toEqual({ value: 'low', source });
      expect(row.categorical.sleepQuality).toEqual({ value: 'good', source });
      expect(row.provenance.release.recordId).toBe(released.releaseId);
    }
    expect(JSON.stringify(afterRevision)).not.toContain(firstFeedback.id);
    for (const id of previousCapacityIds) expect(JSON.stringify(afterRevision)).not.toContain(id);
    expect(JSON.stringify(afterRevision)).not.toContain('Texto livre confidencial');

    const rereadHttp = await request(app)
      .get('/consolidated-prescriptions/alunos/' + fixture.alunoId +
        '/combined-conflicts?start=2026-08-17T00:00:00.000Z&end=2026-08-18T00:00:00.000Z')
      .set('Authorization', 'Bearer ' + token);
    expect(rereadHttp.status).toBe(200);
    expect(rereadHttp.body.data.sessionSignalCount).toBe(2);
    expect(rereadHttp.body.data.sessionSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: { kind: 'feedback', recordId: corrected.id, version: '2' } }),
    ]));
    for (const item of capacityCases) {
      const row = rereadHttp.body.data.observations.find(
        (observation: { capacity: string }) => observation.capacity === item.capacity
      );
      expect(row.numeric.painLevel).toMatchObject({
        value: item.painAfter, source: { kind: 'feedback', recordId: correctedCapacityIds.get(item.capacity), version: '2' },
      });
      expect(row.categorical.fatigueLevel.value).toBe('low');
    }
    expect(JSON.stringify(rereadHttp.body)).not.toContain('Texto livre confidencial');
  });

  it('serializa duas liberações concorrentes sem duplicar template ou ledger', async () => {
    const fixture = await seedFixture('concurrency');
    const command = commandFor(fixture);

    const results = await Promise.allSettled([
      service.release(contextFor(fixture), command, RELEASE_NOW),
      concurrentService.release(contextFor(fixture), command, RELEASE_NOW),
    ]);

    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(await ledgerCount(fixture.sourceVersionId)).toBe(1);
    const templates = await prisma.workoutTemplate.findMany({
      where: {
        planId: fixture.planId,
        mesocycleNumber: 1,
        weekNumber: 1,
      },
    });
    expect(templates).toHaveLength(1);
    expect(templates[0].released).toBe(true);
  });

  it('reconcilia exatamente target futuro planejado e remove dias/exercícios residuais', async () => {
    const fixture = await seedFixture('reconcile');
    const staleExercise = await prisma.exerciseLibrary.create({
      data: {
        contractId: fixture.contractId,
        name: `Exercício residual ${randomUUID()}`,
      },
    });
    const template = await prisma.workoutTemplate.create({
      data: {
        planId: fixture.planId,
        mesocycleNumber: 1,
        weekNumber: 1,
        weekStartDate: new Date('2026-08-17T00:00:00.000Z'),
        trainingDivision: 'legacy',
        totalVolumeKm: 42,
      },
    });
    const retainedDay = await prisma.workoutDay.create({
      data: {
        templateId: template.id,
        dayOfWeek: 1,
        workoutDate: new Date('2026-08-17T00:00:00.000Z'),
        method: 'legacy',
        stimulusDurationMin: 99,
        vo2maxPct: 88,
        detailNotes: 'flexibilidade residual',
        complementNotes: 'equilíbrio residual',
      },
    });
    await prisma.workoutExercise.create({
      data: {
        workoutDayId: retainedDay.id,
        exerciseId: staleExercise.id,
        section: 'principal',
        exerciseOrder: 1,
        sets: 5,
        reps: 20,
      },
    });
    await prisma.workoutDay.create({
      data: {
        templateId: template.id,
        dayOfWeek: 2,
        workoutDate: new Date('2026-08-18T00:00:00.000Z'),
        detailNotes: 'dia residual',
      },
    });

    const released = await service.release(contextFor(fixture), commandFor(fixture), RELEASE_NOW);
    expect(released.workoutTemplateId).toBe(template.id);

    const reconciled = await prisma.workoutTemplate.findUnique({
      where: { id: template.id },
      include: { workoutDays: { include: { exercises: true } } },
    });
    expect(reconciled?.trainingMethod).toBe('combined');
    expect(reconciled?.trainingDivision).toBeNull();
    expect(reconciled?.totalVolumeKm).toBeNull();
    expect(reconciled?.workoutDays).toHaveLength(1);
    expect(reconciled?.workoutDays[0]?.dayOfWeek).toBe(1);
    expect(reconciled?.workoutDays[0]?.method).toBe('continuous');
    expect(reconciled?.workoutDays[0]?.stimulusDurationMin).toBe(30);
    expect(reconciled?.workoutDays[0]?.vo2maxPct).toBeNull();
    expect(reconciled?.workoutDays[0]?.detailNotes).toBe(FLEXIBILITY_NOTE);
    expect(reconciled?.workoutDays[0]?.complementNotes).toBe(BALANCE_NOTE);
    expect(reconciled?.workoutDays[0]?.exercises).toHaveLength(0);
  });

  it('não sobrescreve target já iniciado e não cria estado parcial', async () => {
    const fixture = await seedFixture('started');
    const template = await prisma.workoutTemplate.create({
      data: {
        planId: fixture.planId,
        mesocycleNumber: 1,
        weekNumber: 1,
        weekStartDate: new Date('2026-08-17T00:00:00.000Z'),
      },
    });
    await prisma.workoutDay.create({
      data: {
        templateId: template.id,
        dayOfWeek: 1,
        workoutDate: new Date('2026-08-17T00:00:00.000Z'),
        startedAt: new Date('2026-08-17T10:00:00.000Z'),
      },
    });

    await expect(
      service.release(contextFor(fixture), commandFor(fixture), RELEASE_NOW)
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    const assembly = await prisma.consolidatedPrescription.findUnique({
      where: { id: fixture.assemblyId },
    });
    const currentTemplate = await prisma.workoutTemplate.findUnique({ where: { id: template.id } });
    expect(assembly?.currentStatus).toBe('approved');
    expect(assembly?.currentVersion).toBe(1);
    expect(currentTemplate?.released).toBe(false);
    expect(await ledgerCount(fixture.sourceVersionId)).toBe(0);
  });

  it('faz rollback integral quando o vínculo relacional falha depois da escrita operacional', async () => {
    const fixture = await seedFixture('rollback');
    await installFailureInjection();

    await expect(
      service.release(contextFor(fixture), commandFor(fixture), RELEASE_NOW)
    ).rejects.toThrow('issue 320 injected release failure');

    const assembly = await prisma.consolidatedPrescription.findUnique({
      where: { id: fixture.assemblyId },
    });
    const versions = await prisma.consolidatedPrescriptionVersion.findMany({
      where: { assemblyId: fixture.assemblyId },
    });
    const templates = await prisma.workoutTemplate.findMany({
      where: { planId: fixture.planId },
    });

    expect(assembly?.currentStatus).toBe('approved');
    expect(assembly?.currentVersion).toBe(1);
    expect(versions).toHaveLength(1);
    expect(templates).toHaveLength(0);
    expect(await ledgerCount(fixture.sourceVersionId)).toBe(0);
  });
});
