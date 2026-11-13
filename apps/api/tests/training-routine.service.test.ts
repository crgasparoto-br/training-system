import type { PrismaClient } from '@prisma/client';
import {
  createTrainingRoutineService,
  resolveRoutineWeek,
  parseDateOnly,
  todayInTimeZone,
  TrainingRoutineInputError,
} from '../src/modules/workout/training-routine.service.js';

type Row = Record<string, any>;

const makeRow = (overrides: Row = {}): Row => ({
  id: 'day-1',
  dayOfWeek: 3,
  workoutDate: new Date('2026-10-01T00:00:00.000Z'),
  sessionDurationMin: 60,
  stimulusDurationMin: null,
  cyclicTimeMin: null,
  resistanceTimeMin: null,
  location: 'Academia',
  method: 'Seriado',
  status: 'planned',
  targetHrMin: null,
  targetHrMax: null,
  targetSpeedMin: null,
  targetSpeedMax: null,
  paceMin: null,
  paceMax: null,
  vo2maxPct: null,
  generalGuidelines: '  Hidrate-se  ',
  detailNotes: null,
  complementNotes: '',
  template: {
    id: 'template-1',
    planId: 'plan-1',
    mesocycleNumber: 1,
    weekNumber: 2,
    releasedAt: new Date('2026-09-28T12:00:00.000Z'),
    studentGoal: 'Ganhar força',
    coachGoal: 'Objetivo interno do professor',
    trainingMethod: 'Hipertrofia',
    trainingDivision: 'AB',
    repReserve: 2,
    totalVolumeKm: null,
    plan: { id: 'plan-1', name: 'Plano 2026' },
  },
  exercises: [],
  cyclicStages: [],
  ...overrides,
});

const makeRelease = (overrides: Row = {}): Row => ({
  id: 'release-1',
  assemblyId: 'assembly-1',
  workoutTemplateId: 'template-1',
  sourceAssemblyVersion: 3,
  releasedAssemblyVersion: 4,
  ...overrides,
});

const exercise = (id: string, section: string, order: number) => ({
  id,
  section,
  exerciseOrder: order,
  system: null,
  sets: 3,
  reps: 10,
  load: 40,
  intervalSec: 60,
  exerciseNotes: null,
  exercise: { name: `Exercício ${id}` },
});

describe('training routine service (#387)', () => {
  const findMany = jest.fn();
  const queryRaw = jest.fn();
  const preWorkoutCheckInFindMany = jest.fn();
  const postWorkoutFeedbackFindMany = jest.fn();
  const workoutSubstitutionFindMany = jest.fn();
  const client = {
    workoutDay: { findMany },
    workoutSubstitution: { findMany: workoutSubstitutionFindMany },
    preWorkoutCheckIn: { findMany: preWorkoutCheckInFindMany },
    postWorkoutFeedbackRevision: { findMany: postWorkoutFeedbackFindMany },
    $queryRaw: queryRaw,
  } as unknown as PrismaClient;
  const service = createTrainingRoutineService(client);
  const now = new Date('2026-10-01T15:00:00.000Z');

  let releasedRows: Row[];
  let pendingRows: Row[];
  let capacityRows: Row[];
  let releaseRows: Row[];
  let upcomingRows: Row[];
  let latestExecutionRows: Row[];

  beforeEach(() => {
    jest.clearAllMocks();
    releasedRows = [];
    pendingRows = [];
    capacityRows = [];
    releaseRows = [makeRelease()];
    upcomingRows = [];
    preWorkoutCheckInFindMany.mockResolvedValue([]);
    postWorkoutFeedbackFindMany.mockResolvedValue([]);
    workoutSubstitutionFindMany.mockResolvedValue([]);
    latestExecutionRows = [];
    findMany.mockImplementation((args: any) => {
      return Promise.resolve(args.where.template.released ? releasedRows : pendingRows);
    });
    queryRaw.mockImplementation((strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (sql.includes('FROM "WorkoutDay" day')) return Promise.resolve(upcomingRows);
      if (sql.includes('FROM "WorkoutSessionExecution" execution')) return Promise.resolve(latestExecutionRows);
      if (sql.includes('WorkoutDayCapacityOperationalBlock')) return Promise.resolve(capacityRows);
      if (sql.includes('ConsolidatedPrescriptionOperationalRelease')) return Promise.resolve(releaseRows);
      throw new Error(`SQL inesperado: ${sql}`);
    });
  });

  it('consultas de substituição respeitam o aluno e contrato autorizados sem alterar a leitura anterior', async () => {
    releasedRows = [makeRow()];
    await service.getRoutine({
      alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now,
    });
    expect(workoutSubstitutionFindMany).toHaveBeenCalledWith({
      where: {
        workoutDayId: { in: ['day-1'] },
        alunoId: 'aluno-1', contractId: 'contract-1',
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('projects frozen exercise units for authorized professor future-session planning only', async () => {
    releasedRows = [makeRow({ exercises: [exercise('planned-e1', 'principal', 1)] })];
    const professor = await service.getRoutine({
      alunoId: 'aluno-1', contractId: 'contract-1', audience: 'professor', now,
    });
    expect(professor.days[3].sessions[0].substitutionExercises).toEqual([
      { id: 'planned-e1', name: 'Exercício planned-e1' },
    ]);
    const student = await service.getRoutine({
      alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now,
    });
    expect(student.days[3].sessions[0]).not.toHaveProperty('substitutionExercises');
  });

  it('calcula a aderência semanal usando apenas sessões liberadas e o lifecycle canônico', async () => {
    const executed = (dayId: string, status: 'completed' | 'partial', updatedAt: string) => ({
      workoutDayId: dayId, status, version: 1,
      updatedAt: new Date(updatedAt), startedAt: new Date('2026-10-01T10:00:00.000Z'),
      finishedAt: new Date(updatedAt), currentPauseStartedAt: null,
      pausedDurationMs: BigInt(0), interruptionReason: null,
      originReleaseId: 'release-1', originWorkoutTemplateId: 'template-1',
      originTrainingPlanId: 'plan-1', sessionValues: {}, plannedSnapshot: null, items: [],
    });
    releasedRows = [
      makeRow({ id: 'day-completed',
        execution: executed('day-completed', 'completed', '2026-10-01T12:00:00.000Z') }),
      makeRow({ id: 'day-partial', workoutDate: new Date('2026-10-02T00:00:00.000Z'),
        execution: executed('day-partial', 'partial', '2026-10-02T12:00:00.000Z') }),
    ];
    const result = await service.getRoutine({
      alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now,
    });
    expect(result.weeklyEvolution).toMatchObject({
      counts: {
        prescribedSessions: 2, completedSessions: 1, partialSessions: 1,
        notPerformedSessions: 0, pendingSessions: 0,
      },
      adherence: { status: 'available', value: 50, unit: '%' },
    });
    expect(result.weeklyEvolution?.technical).toBeUndefined();
    expect(result.weeklyEvolution).not.toHaveProperty('ruleVersion');
    expect(result.weeklyEvolution).not.toHaveProperty('source');
    expect(result.weeklyEvolution?.adherence).not.toHaveProperty('formula');
    expect(result.weeklyEvolution?.sourceLabel).toBe('Montagem Consolidada e execução das sessões');
    const professor = await service.getRoutine({
      alunoId: 'aluno-1', contractId: 'contract-1', audience: 'professor', now,
    });
    expect(professor.weeklyEvolution?.adherence).toEqual(result.weeklyEvolution?.adherence);
    expect(professor.weeklyEvolution?.technical).toMatchObject({
      ruleVersion: 'weekly-adherence-v1',
      source: 'consolidated_release_and_session_execution',
      formula: 'completedSessions / prescribedSessions * 100',
      sessions: [{ sessionId: 'day-completed', status: 'completed' }, { sessionId: 'day-partial', status: 'partial' }],
    });
    expect(findMany.mock.calls[0][0].where.template.plan).toMatchObject({
      alunoId: 'aluno-1', aluno: { contractId: 'contract-1' },
    });
  });

  it('A-004: alinha conclusão legada, estados pendentes e aderência da semana histórica', async () => {
    releasedRows = [
      makeRow({ id: 'legacy-completed', status: 'completed',
        updatedAt: new Date('2026-10-01T16:00:00.000Z') }),
      makeRow({ id: 'legacy-in-progress', status: 'in_progress', dayOfWeek: 4,
        workoutDate: new Date('2026-10-02T00:00:00.000Z'),
        updatedAt: new Date('2026-10-02T12:00:00.000Z') }),
      makeRow({ id: 'legacy-planned', status: 'planned', dayOfWeek: 5,
        workoutDate: new Date('2026-10-03T00:00:00.000Z'),
        updatedAt: new Date('2026-09-29T12:00:00.000Z') }),
    ];
    const query = {
      alunoId: 'aluno-1', contractId: 'contract-1',
      audience: 'student' as const, date: '2026-10-01',
      now: new Date('2026-10-06T15:00:00.000Z'),
    };
    const student = await service.getRoutine(query);
    expect(student.days.flatMap((day) => day.sessions.map((session) => ({
      sessionId: session.sessionId, status: session.status,
    })))).toEqual([
      { sessionId: 'legacy-completed', status: 'completed' },
      { sessionId: 'legacy-in-progress', status: 'in_progress' },
      { sessionId: 'legacy-planned', status: 'not_started' },
    ]);
    expect(student.weeklyEvolution?.counts).toEqual({
      prescribedSessions: 3, completedSessions: 1, partialSessions: 0,
      notPerformedSessions: 0, pendingSessions: 2,
    });
    expect(student.weeklyEvolution?.adherence).toEqual({
      status: 'available', value: 33.33, unit: '%',
    });
    expect(student.weeklyEvolution?.lastSourceUpdateAt).toBe('2026-10-02T12:00:00.000Z');
    expect(student.weeklyEvolution?.technical).toBeUndefined();

    const professor = await service.getRoutine({ ...query, audience: 'professor' });
    expect(professor.weeklyEvolution?.adherence).toEqual(student.weeklyEvolution?.adherence);
    expect(professor.weeklyEvolution?.technical?.sessions).toEqual([
      { sessionId: 'legacy-completed', status: 'completed' },
      { sessionId: 'legacy-in-progress', status: 'in_progress' },
      { sessionId: 'legacy-planned', status: 'not_started' },
    ]);

    releaseRows = [];
    const withoutConsolidatedRelease = await service.getRoutine(query);
    expect(withoutConsolidatedRelease.weeklyEvolution?.adherence).toEqual({
      status: 'insufficient_data', value: null, unit: '%',
    });
    expect(withoutConsolidatedRelease.weeklyEvolution?.counts.prescribedSessions).toBe(0);
  });

  it('A-004: execução canônica prevalece sobre status legado e horário da origem antiga', async () => {
    releasedRows = [makeRow({
      status: 'completed',
      updatedAt: new Date('2026-10-03T15:00:00.000Z'),
      execution: {
        workoutDayId: 'day-1', status: 'not_performed', version: 1,
        updatedAt: new Date('2026-10-01T12:00:00.000Z'),
        startedAt: null,
        finishedAt: new Date('2026-10-01T12:00:00.000Z'),
        currentPauseStartedAt: null, pausedDurationMs: BigInt(0),
        interruptionReason: 'Impossibilidade informada', originReleaseId: 'release-1',
        originWorkoutTemplateId: 'template-1', originTrainingPlanId: 'plan-1',
        sessionValues: {}, plannedSnapshot: null, items: [],
      },
    })];
    const student = await service.getRoutine({
      alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now,
    });
    expect(student.today.sessions[0].status).toBe('not_performed');
    expect(student.weeklyEvolution?.counts).toEqual({
      prescribedSessions: 1, completedSessions: 0, partialSessions: 0,
      notPerformedSessions: 1, pendingSessions: 0,
    });
    expect(student.weeklyEvolution?.adherence).toEqual({ status: 'available', value: 0, unit: '%' });
    expect(student.weeklyEvolution?.lastSourceUpdateAt).toBe('2026-10-01T12:00:00.000Z');
  });

  it('#405: mantém revisão de feedback vigente, tenant e permissão na projeção de métricas', async () => {
    releasedRows = [makeRow({
      // A-003: the permitted feedback sample has an explicitly known modality.
      id: 'day-1', status: 'completed', cyclicTimeMin: 30,
      execution: {
        workoutDayId: 'day-1', status: 'completed', version: 3,
        updatedAt: new Date('2026-10-01T12:00:00.000Z'),
        startedAt: new Date('2026-10-01T11:00:00.000Z'),
        finishedAt: new Date('2026-10-01T12:00:00.000Z'),
        currentPauseStartedAt: null, pausedDurationMs: BigInt(0), interruptionReason: null,
        originReleaseId: 'release-1', originWorkoutTemplateId: 'template-1',
        originTrainingPlanId: 'plan-1', sessionValues: { durationSec: 3600 },
        plannedSnapshot: { id: 'day-1', cyclicTimeMin: 30, cyclicStages: [], resistanceGroups: [], exercises: [] },
        items: [],
      },
    })];
    postWorkoutFeedbackFindMany.mockResolvedValue([
      { id: 'fb-r2', workoutDayId: 'day-1', scopeKey: 'session', revisionNumber: 2,
        values: { pse: 6, psr: 7, painAfter: 9, professorTechnicalNotes: 'sigiloso' },
        createdAt: new Date('2026-10-02T10:00:00.000Z') },
      { id: 'fb-r1', workoutDayId: 'day-1', scopeKey: 'session', revisionNumber: 1,
        values: { pse: 2, psr: 3 },
        createdAt: new Date('2026-10-01T13:00:00.000Z') },
    ]);
    const query = { alunoId: 'aluno-1', contractId: 'contract-1',
      date: '2026-10-01', now: new Date('2026-10-08T15:00:00.000Z') };
    const student = await service.getRoutine({ ...query, audience: 'student' });
    expect(student.weeklyEvolution?.metrics.find((item) => item.key === 'pse')).toMatchObject({
      status: 'available', value: 6, sampleCount: 1,
      lastSourceUpdateAt: '2026-10-02T10:00:00.000Z',
    });
    expect(student.weeklyEvolution?.metrics.find((item) => item.key === 'psr')?.value).toBe(7);
    expect(JSON.stringify(student.weeklyEvolution)).not.toMatch(/fb-r2|fb-r1|sigiloso|painAfter|release-1/);
    expect(postWorkoutFeedbackFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workoutDayId: { in: ['day-1'] }, alunoId: 'aluno-1', contractId: 'contract-1' },
    }));

    postWorkoutFeedbackFindMany.mockClear();
    const professorWithoutGrant = await service.getRoutine({ ...query, audience: 'professor' });
    expect(postWorkoutFeedbackFindMany).not.toHaveBeenCalled();
    expect(professorWithoutGrant.weeklyEvolution?.metrics.find((item) => item.key === 'pse'))
      .toMatchObject({ status: 'insufficient_data', value: null });
    expect(professorWithoutGrant.weeklyEvolution?.technical?.indicators.find((item) => item.key === 'pse')?.observations)
      .toEqual([]);

    const authorized = await service.getRoutine({
      ...query, audience: 'professor', includePostWorkoutFeedback: true,
    });
    expect(authorized.weeklyEvolution?.metrics.find((item) => item.key === 'pse')?.value).toBe(6);
    expect(authorized.weeklyEvolution?.technical?.indicators.find((item) => item.key === 'pse')?.observations)
      .toMatchObject([{ sessionId: 'day-1', releaseId: 'release-1', sourceId: 'fb-r2' }]);
    expect(authorized.weeklyEvolution?.adherence.value).toBe(student.weeklyEvolution?.adherence.value);
  });

  it('#405 A-002: deriva método e topologia do snapshot, nunca do método atual do WorkoutDay', async () => {
    const captured = {
      id: 'day-1', method: 'Corrida intervalada',
      cyclicStages: [{ id: 'work-1', parentStageId: null, position: 1,
        kind: 'work', targetKind: 'pace_min_per_km', repeatCount: null }],
      exercises: [], resistanceGroups: [],
    };
    const execution = {
      workoutDayId: 'day-1', status: 'completed', version: 1,
      updatedAt: new Date('2026-10-01T12:00:00.000Z'),
      startedAt: new Date('2026-10-01T11:00:00.000Z'),
      finishedAt: new Date('2026-10-01T12:00:00.000Z'),
      currentPauseStartedAt: null, pausedDurationMs: BigInt(0), interruptionReason: null,
      originReleaseId: 'release-1', originWorkoutTemplateId: 'template-1',
      originTrainingPlanId: 'plan-1', sessionValues: { pace: '05:00' },
      plannedSnapshot: captured, items: [],
    };
    releasedRows = [makeRow({ method: 'Contínuo (valor atual)', cyclicTimeMin: 30, execution })];
    const query = { alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student' as const, now };
    const verified = await service.getRoutine(query);
    expect(verified.weeklyEvolution?.metrics.find((item) => item.key === 'pace'))
      .toMatchObject({ status: 'available', value: 5 });
    expect(verified.weeklyEvolution?.series.find((item) => item.key === 'pace')?.scopeLabel)
      .toContain('Corrida intervalada');
    expect(JSON.stringify(verified.weeklyEvolution)).not.toContain('Contínuo (valor atual)');

    // Legacy #401 snapshot with no captured type cannot borrow a mutable current method.
    releasedRows = [makeRow({ method: 'Contínuo (valor atual)', cyclicTimeMin: 30,
      execution: { ...execution, plannedSnapshot: { ...captured, method: null, cyclicStages: [] } },
    })];
    const historical = await service.getRoutine(query);
    expect(historical.weeklyEvolution?.metrics.find((item) => item.key === 'pace'))
      .toMatchObject({ status: 'incomparable', value: null, sampleCount: 1 });
    expect(historical.weeklyEvolution?.series.filter((item) => item.key === 'pace')).toHaveLength(1);
  });

  it('#405 A-008: usa o grafo do snapshot vinculado para evitar dupla contagem de repeat', async () => {
    const captured = {
      id: 'day-1', method: 'Corrida contínua', cyclicTimeMin: 30,
      cyclicStages: [
        { id: 'parent', kind: 'repeat', parentStageId: null, position: 1,
          targetKind: null, repeatCount: 2 },
        { id: 'work', kind: 'work', parentStageId: 'parent', position: 1,
          targetKind: null, repeatCount: null },
      ],
      exercises: [], resistanceGroups: [],
    };
    const execution = {
      workoutDayId: 'day-1', status: 'completed', version: 1,
      updatedAt: new Date('2026-10-01T12:00:00.000Z'),
      startedAt: new Date('2026-10-01T11:00:00.000Z'),
      finishedAt: new Date('2026-10-01T12:00:00.000Z'),
      currentPauseStartedAt: null, pausedDurationMs: BigInt(0), interruptionReason: null,
      originReleaseId: 'release-1', originWorkoutTemplateId: 'template-1',
      originTrainingPlanId: 'plan-1', plannedSnapshot: captured,
      sessionValues: { cyclicStages: [
        { plannedStageId: 'parent', outcome: 'full', durationSec: 600, distanceMeters: 5000 },
        { plannedStageId: 'work', iteration: 1, outcome: 'full', durationSec: 300, distanceMeters: 2500 },
        { plannedStageId: 'work', iteration: 2, outcome: 'full', durationSec: 300, distanceMeters: 2500 },
      ] }, items: [],
    };
    // Current mutable method and stages deliberately disagree with the snapshot.
    releasedRows = [makeRow({ method: 'Ciclismo atual', cyclicTimeMin: 60, execution })];
    const result = await service.getRoutine({
      alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now,
    });
    expect(result.weeklyEvolution?.metrics.find((m) => m.key === 'duration'))
      .toMatchObject({ status: 'available', value: 10 });
    expect(result.weeklyEvolution?.metrics.find((m) => m.key === 'distance'))
      .toMatchObject({ status: 'available', value: 5 });
    expect(JSON.stringify(result.weeklyEvolution)).not.toMatch(/Ciclismo atual|release-1|"sessionId"/);
  });

  it('#405 A-011/A-012: projects historical groups and repeat parents without duplicate substitution totals', async () => {
    const captured = {
      id: 'day-1', method: 'Corrida continua', cyclicTimeMin: 10,
      cyclicStages: [
        { id: 'parent', kind: 'repeat', parentStageId: null, position: 1, targetKind: null, repeatCount: 2 },
        { id: 'stage', kind: 'work', parentStageId: 'parent', position: 1, targetKind: null, repeatCount: null },
      ],
      resistanceGroups: [{ id: 'group-a', kind: 'bi_set', position: 1,
        members: [{ workoutExerciseId: 'unit-a', position: 1 }] }],
      exercises: [{ id: 'unit-a', exerciseId: 'catalog-a', section: 'principal', exerciseOrder: 1,
        system: null, resistanceBlocks: [], exercise: { name: 'Exercise A' } }],
    };
    const execution = {
      workoutDayId: 'day-1', status: 'partial', version: 1,
      updatedAt: new Date('2026-10-01T12:00:00.000Z'),
      startedAt: new Date('2026-10-01T11:00:00.000Z'),
      finishedAt: new Date('2026-10-01T12:00:00.000Z'),
      currentPauseStartedAt: null, pausedDurationMs: BigInt(0), interruptionReason: null,
      originReleaseId: 'release-1', originWorkoutTemplateId: 'template-1',
      originTrainingPlanId: 'plan-1', plannedSnapshot: captured,
      sessionValues: {
        cyclicStages: [
          { plannedStageId: 'parent', outcome: 'substituted' },
          { plannedStageId: 'stage', iteration: 1, outcome: 'substituted' },
          { plannedStageId: 'stage', iteration: 2, outcome: 'substituted' },
        ],
        resistanceGroups: [{ plannedGroupId: 'group-a', outcome: 'substituted' }],
      },
      items: [{ plannedUnitId: 'unit-a', plannedSetId: null, setNumber: 1,
        outcome: 'substituted', completedAt: null, loadKg: null, repetitions: null }],
    };
    releasedRows = [makeRow({ method: 'Changed current method', execution })];
    const query = { alunoId: 'aluno-1', contractId: 'contract-1',
      audience: 'student' as const, now };
    const student = await service.getRoutine(query);
    expect(student.weeklyEvolution?.metrics.find((item) => item.key === 'substitutions'))
      .toMatchObject({ status: 'available', value: 3, sampleCount: 1 });
    expect(student.weeklyEvolution?.adherence.value).toBe(0);
    expect(JSON.stringify(student.weeklyEvolution)).not.toMatch(/group-a|unit-a|release-1|"sessionId"/);
    releasedRows = [makeRow({ method: 'Other current method', execution })];
    const unchanged = await service.getRoutine(query);
    expect(unchanged.weeklyEvolution?.metrics).toEqual(student.weeklyEvolution?.metrics);
    const professor = await service.getRoutine({ ...query, audience: 'professor' });
    expect(professor.weeklyEvolution?.metrics.find((item) => item.key === 'substitutions')?.value).toBe(3);
  });

  it('#405 A-004: mantém modalidade capturada após edição do planejamento atual e isola snapshots inválidos', async () => {
    const captured = {
      id: 'day-1', method: 'Corrida contínua', cyclicTimeMin: 30,
      cyclicStages: [], exercises: [], resistanceGroups: [],
    };
    const execution = {
      workoutDayId: 'day-1', status: 'completed', version: 1,
      updatedAt: new Date('2026-10-01T12:00:00.000Z'),
      startedAt: new Date('2026-10-01T11:00:00.000Z'),
      finishedAt: new Date('2026-10-01T12:00:00.000Z'),
      currentPauseStartedAt: null, pausedDurationMs: BigInt(0), interruptionReason: null,
      originReleaseId: 'release-1', originWorkoutTemplateId: 'template-1',
      originTrainingPlanId: 'plan-1',
      sessionValues: { distanceKm: 5, pace: '05:00' },
      plannedSnapshot: captured, items: [],
    };
    const query = { alunoId: 'aluno-1', contractId: 'contract-1',
      audience: 'student' as const, now };
    releasedRows = [makeRow({
      method: 'Musculação atual', cyclicTimeMin: null,
      exercises: [exercise('current-exercise', 'principal', 1)], execution,
    })];
    const before = await service.getRoutine(query);
    expect(before.weeklyEvolution?.metrics.find((m) => m.key === 'distance'))
      .toMatchObject({ status: 'available', value: 5 });
    expect(before.weeklyEvolution?.series.find((s) => s.key === 'distance')?.modality).toBe('cyclic');

    // Deliberately replace the current modality without touching the immutable execution.
    releasedRows = [makeRow({ method: 'Ciclismo atual', cyclicTimeMin: 60, exercises: [], execution })];
    const after = await service.getRoutine(query);
    expect(after.weeklyEvolution?.metrics).toEqual(before.weeklyEvolution?.metrics);
    expect(after.weeklyEvolution?.series).toEqual(before.weeklyEvolution?.series);
    expect(JSON.stringify(after.weeklyEvolution)).not.toContain('Ciclismo atual');

    releasedRows = [makeRow({ method: 'Ciclismo atual', cyclicTimeMin: 60,
      execution: { ...execution, plannedSnapshot: { ...captured, id: 'foreign-day' } },
    })];
    const mismatched = await service.getRoutine(query);
    expect(mismatched.weeklyEvolution?.metrics.find((m) => m.key === 'distance'))
      .toMatchObject({ status: 'incomparable', value: null, sampleCount: 1 });
    expect(mismatched.weeklyEvolution?.series.find((s) => s.key === 'distance'))
      .toMatchObject({ modality: 'unknown', points: [{ date: '2026-10-01', value: 5 }] });
    expect(mismatched.weeklyEvolution?.metrics.find((m) => m.key === 'pace')?.status)
      .toBe('incomparable');

    const resistanceSnapshot = {
      id: 'day-1', method: 'Seriado', cyclicTimeMin: null, cyclicStages: [], resistanceGroups: [],
      exercises: [{
        id: 'historical-unit', exerciseId: 'catalog-squat', section: 'principal',
        exerciseOrder: 1, system: null, resistanceBlocks: [],
        exercise: { name: 'Agachamento' },
      }],
    };
    releasedRows = [makeRow({ method: 'Corrida atual', cyclicTimeMin: 60, exercises: [],
      execution: {
        ...execution, sessionValues: {}, plannedSnapshot: resistanceSnapshot,
        items: [{ plannedUnitId: 'historical-unit', plannedSetId: null, setNumber: 1,
          outcome: 'full', completedAt: null, loadKg: 40, repetitions: 10 }],
      },
    })];
    const resistance = await service.getRoutine(query);
    expect(resistance.weeklyEvolution?.metrics.find((m) => m.key === 'tonnage'))
      .toMatchObject({ status: 'available', value: 400, sampleCount: 1 });
    expect(resistance.weeklyEvolution?.series.find((s) => s.key === 'tonnage')?.modality)
      .toBe('resistance');
    expect(resistance.weeklyEvolution?.metrics.find((m) => m.key === 'distance'))
      .toMatchObject({ status: 'insufficient_data', value: null });
  });


  it('#405 A-010: snapshot de estágios órfãos não se funde com topologia vazia válida', async () => {
    const execution = (id: string, stages: Row[]) => ({
      workoutDayId: id, status: 'completed', version: 1,
      updatedAt: new Date('2026-10-01T12:00:00.000Z'),
      startedAt: new Date('2026-10-01T11:00:00.000Z'),
      finishedAt: new Date('2026-10-01T12:00:00.000Z'),
      currentPauseStartedAt: null, pausedDurationMs: BigInt(0), interruptionReason: null,
      originReleaseId: 'release-1', originWorkoutTemplateId: 'template-1',
      originTrainingPlanId: 'plan-1',
      sessionValues: { durationSec: 1800, distanceKm: id === 'valid' ? 5 : 8, pace: '05:00' },
      plannedSnapshot: { id, method: 'Corrida contínua', cyclicTimeMin: 30,
        cyclicStages: stages, resistanceGroups: [], exercises: [] },
      items: [],
    });
    releasedRows = [
      makeRow({ id: 'valid', execution: execution('valid', []) }),
      makeRow({ id: 'orphan', dayOfWeek: 4, workoutDate: new Date('2026-10-02T00:00:00.000Z'),
        execution: execution('orphan', [{ id: 'orphan-stage', parentStageId: 'not-present',
          position: 1, kind: 'work', targetKind: null, repeatCount: null }]) }),
    ];
    const query = { alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student' as const, now };
    const result = await service.getRoutine(query);
    for (const key of ['duration', 'distance', 'pace'] as const) {
      expect(result.weeklyEvolution?.metrics.find((metric) => metric.key === key))
        .toMatchObject({ status: 'incomparable', value: null, sampleCount: 2 });
      expect(result.weeklyEvolution?.series.filter((series) => series.key === key)).toHaveLength(2);
    }
    releasedRows[1].execution.plannedSnapshot.cyclicStages = [];
    const valid = await service.getRoutine(query);
    expect(valid.weeklyEvolution?.metrics.find((m) => m.key === 'distance'))
      .toMatchObject({ status: 'available', value: 13, sampleCount: 2 });
  });

  it('#405 A-009: hora da execução supera IDs invertidos na mesma data', async () => {
    const makeResistanceRow = (
      id: string, templateId: string, planId: string, releaseId: string, time: string, kg: number,
    ) => makeRow({
      id,
      template: { ...makeRow().template, id: templateId, planId,
        plan: { id: planId, name: 'Plano original' } },
      execution: {
        workoutDayId: id, status: 'completed', version: 1,
        updatedAt: new Date(time), startedAt: new Date('2026-10-01T07:00:00.000Z'),
        finishedAt: new Date(time), currentPauseStartedAt: null,
        pausedDurationMs: BigInt(0), interruptionReason: null,
        originReleaseId: releaseId, originWorkoutTemplateId: templateId,
        originTrainingPlanId: planId, sessionValues: {},
        plannedSnapshot: { id, method: 'Seriado', cyclicStages: [], resistanceGroups: [],
          exercises: [{ id: 'unit-' + id, exerciseId: 'catalog-squat',
            section: 'principal', exerciseOrder: 1, system: null,
            resistanceBlocks: [], exercise: { name: 'Agachamento' } }] },
        items: [{ plannedUnitId: 'unit-' + id, plannedSetId: null, setNumber: 1,
          outcome: 'full', completedAt: null, loadKg: kg, repetitions: kg === 30 ? 8 : 5 }],
      },
    });
    releaseRows = [makeRelease(), makeRelease({ id: 'release-2', workoutTemplateId: 'template-2' })];
    releasedRows = [
      makeResistanceRow('z-early', 'template-1', 'plan-1', 'release-1', '2026-10-01T08:00:00.000Z', 30),
      makeResistanceRow('a-late', 'template-2', 'plan-2', 'release-2', '2026-10-01T18:00:00.000Z', 50),
    ];
    const result = await service.getRoutine({
      alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now,
    });
    expect(result.weeklyEvolution?.metrics.find((m) => m.key === 'load'))
      .toMatchObject({ status: 'available', value: 50, sampleCount: 2 });
    expect(result.weeklyEvolution?.metrics.find((m) => m.key === 'repetitions'))
      .toMatchObject({ status: 'available', value: 5, sampleCount: 2 });
  });

  it('#405 RISK-001: execução de outra liberação não altera aderência, status nem feedback', async () => {
    releasedRows = [makeRow({ status: 'completed',
      execution: {
        workoutDayId: 'day-1', status: 'completed', version: 2,
        updatedAt: new Date('2026-10-01T18:00:00.000Z'),
        startedAt: new Date('2026-10-01T10:00:00.000Z'),
        finishedAt: new Date('2026-10-01T18:00:00.000Z'),
        currentPauseStartedAt: null, pausedDurationMs: BigInt(0), interruptionReason: null,
        originReleaseId: 'release-previous', originWorkoutTemplateId: 'template-1',
        originTrainingPlanId: 'plan-1',
        plannedSnapshot: { id: 'day-1', method: 'Corrida contínua', cyclicTimeMin: 30,
          cyclicStages: [], resistanceGroups: [], exercises: [] },
        sessionValues: { durationSec: 3600, distanceKm: 10 }, items: [],
      },
    })];
    const result = await service.getRoutine({
      alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now,
    });
    expect(result.weeklyEvolution?.counts)
      .toMatchObject({ prescribedSessions: 1, completedSessions: 0, pendingSessions: 1 });
    expect(result.weeklyEvolution?.adherence).toEqual({ status: 'available', value: 0, unit: '%' });
    expect(result.weeklyEvolution?.metrics.find((metric) => metric.key === 'distance'))
      .toMatchObject({ status: 'insufficient_data', value: null, sampleCount: 0 });
    expect(result.weeklyEvolution?.lastSourceUpdateAt).toBe('2026-09-28T12:00:00.000Z');
    expect(result.today.sessions[0].status).toBe('not_started');
    expect(postWorkoutFeedbackFindMany).not.toHaveBeenCalled();
    const nextSessionSql = queryRaw.mock.calls
      .map(([strings]) => strings.join('?'))
      .find((sql: string) => sql.includes('FROM "WorkoutDay" day'));
    expect(nextSessionSql).toContain('execution."originReleaseId" = release."id"');
    expect(nextSessionSql).toContain('execution."originTrainingPlanId" = plan."id"');
  });

  it('projeta o próximo treino de outra semana apenas com liberação consolidada e escopo contratual', async () => {
    upcomingRows = [{
      sessionId: 'next-month',
      date: new Date('2026-11-03T00:00:00.000Z'),
      status: 'not_started',
    }];
    const result = await service.getRoutine({
      alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now,
    });
    expect(result.nextSession).toEqual({
      sessionId: 'next-month', date: '2026-11-03', status: 'not_started',
    });
    const sql = queryRaw.mock.calls
      .map(([strings]) => strings.join('?'))
      .find((query: string) => query.includes('FROM "WorkoutDay" day'));
    expect(sql).toContain('ConsolidatedPrescriptionOperationalRelease');
    expect(sql).toContain('student."contractId"');
    expect(sql).toContain('plan."alunoId"');
    expect(sql).toContain("NOT IN ('completed', 'partial', 'not_performed')");
    const args = queryRaw.mock.calls.find(([strings]) =>
      strings.join('?').includes('FROM "WorkoutDay" day')
    );
    expect(args).toContain('aluno-1');
    expect(args).toContain('contract-1');
    expect(args).not.toContain('contract-2');
  });

  it('não inventa sessão futura quando a consulta consolidada não retorna dias autorizados', async () => {
    upcomingRows = [];
    const result = await service.getRoutine({
      alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now,
    });
    expect(result.nextSession).toBeNull();
  });

  it('projeta a ultima execucao global apenas com liberação consolidada vinculada ao release de origem', async () => {
    latestExecutionRows = [{
      sessionId: 'old-day',
      status: 'completed',
      date: new Date('2026-09-01T00:00:00.000Z'),
    }];
    const result = await service.getRoutine({
      alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now,
    });
    expect(result.lastExecution).toEqual({
      sessionId: 'old-day', status: 'completed', date: '2026-09-01',
    });
    const executionCall = queryRaw.mock.calls.find(([strings]) =>
      strings.join('?').includes('FROM "WorkoutSessionExecution" execution')
    );
    expect(executionCall).toBeDefined();
    const executionSql = (executionCall?.[0] as TemplateStringsArray).join('?');
    expect(executionSql).toContain('release."id" = execution."originReleaseId"');
    expect(executionSql).toContain('release."workoutTemplateId" = template."id"');
    expect(executionSql).toContain('release."alunoId" = execution."alunoId"');
    expect(executionSql).toContain('release."contractId" = execution."contractId"');
    expect(executionSql).toContain("IN ('completed', 'partial', 'not_performed')");
    expect(executionSql).toContain('ORDER BY execution."finishedAt" DESC');
    expect(executionCall?.slice(1)).toEqual(['aluno-1', 'contract-1', 'aluno-1', 'contract-1']);
  });

  it('não inventa última execução quando o backend não encontra execução autorizada', async () => {
    latestExecutionRows = [];
    const result = await service.getRoutine({
      alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now,
    });
    expect(result.lastExecution).toBeNull();
  });

  it('não projeta contagens de feedback ao professor sem concessão explícita', async () => {
    releasedRows = [makeRow()];
    const result = await service.getRoutine({
      alunoId: 'aluno-1', contractId: 'contract-1', audience: 'professor', now,
    });
    expect(result.feedbackContinuity).toEqual({
      state: 'unavailable', pendingCount: 0, registeredCount: 0,
    });
    expect(postWorkoutFeedbackFindMany).not.toHaveBeenCalled();
  });

  it('calcula feedback pendente apenas para sessão concluída do contrato', async () => {
    releasedRows = [makeRow({
      execution: {
        workoutDayId: 'day-1',
        status: 'completed',
        version: 1,
        startedAt: new Date('2026-10-01T10:00:00.000Z'),
        finishedAt: new Date('2026-10-01T11:00:00.000Z'),
        currentPauseStartedAt: null,
        pausedDurationMs: BigInt(0),
        interruptionReason: null,
        originReleaseId: 'release-1',
        originWorkoutTemplateId: 'template-1',
        originTrainingPlanId: 'plan-1',
        sessionValues: {},
        items: [],
      },
    })];
    const result = await service.getRoutine({
      alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now,
    });
    expect(result.feedbackContinuity).toEqual({
      state: 'available', pendingCount: 1, registeredCount: 0,
    });
    expect(postWorkoutFeedbackFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ alunoId: 'aluno-1', contractId: 'contract-1' }),
    }));
  });

  it('consulta somente sessões liberadas do aluno e do contrato informados', async () => {
    await service.getRoutine({ alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now });

    const releasedCall = findMany.mock.calls.find(([args]) => args.where.template.released === true)?.[0];
    const pendingCall = findMany.mock.calls.find(([args]) => args.where.template.released === false)?.[0];
    const scope = { alunoId: 'aluno-1', aluno: { contractId: 'contract-1' } };
    expect(releasedCall.where.template).toEqual({ released: true, plan: scope });
    expect(releasedCall.orderBy).toEqual([{ workoutDate: 'asc' }, { dayOfWeek: 'asc' }, { id: 'asc' }]);
    expect(pendingCall.where.template).toEqual({ released: false, plan: scope });
    // A consulta de sessões não liberadas nunca carrega conteúdo do treino.
    expect(pendingCall.select).toEqual({ workoutDate: true });
  });

  it('monta a semana segunda a domingo em ordem estável e marca o dia atual', async () => {
    releasedRows = [
      makeRow(),
      makeRow({ id: 'day-2', dayOfWeek: 5, workoutDate: new Date('2026-10-03T00:00:00.000Z') }),
    ];

    const routine = await service.getRoutine({ alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now });

    expect(routine.week).toEqual({ startDate: '2026-09-28', endDate: '2026-10-04' });
    expect(routine.days.map((day) => day.date)).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ]);
    expect(routine.days.filter((day) => day.isToday).map((day) => day.date)).toEqual(['2026-10-01']);
    expect(routine.days[3].sessions.map((session) => session.sessionId)).toEqual(['day-1']);
    expect(routine.days[5].sessions.map((session) => session.sessionId)).toEqual(['day-2']);
    expect(routine.today.state).toBe('released');
    expect(routine.today.sessions[0]).toMatchObject({
      sessionId: 'day-1',
      workoutTemplateId: 'template-1',
      trainingPlanId: 'plan-1',
      objective: 'Ganhar força',
      guidelines: ['Hidrate-se'],
      status: 'not_started',
    });
  });

  it('distingue hoje sem sessão de sessão existente ainda não liberada', async () => {
    const empty = await service.getRoutine({ alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now });
    expect(empty.today).toEqual({ date: '2026-10-01', state: 'none', sessions: [] });

    pendingRows = [{ workoutDate: new Date('2026-10-01T00:00:00.000Z') }];
    const pending = await service.getRoutine({ alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now });
    expect(pending.today.state).toBe('not_released');
    expect(pending.today.sessions).toEqual([]);
    expect(pending.days[3].pendingReleaseCount).toBe(1);
  });


  it('A-021: student routine redacts raw technical readings, professor retains them', async () => {
    const executionItem = {
      plannedUnitId: 'exercise-1', plannedSetId: null, setNumber: 1,
      completedAt: null, outcome: 'full', substitutionNote: null,
      rir: 2, rpe: 7, tempo: '2-0-2', restSec: 45,
      repetitions: 8, loadKg: 20, durationSec: null, distanceKm: null,
      pace: null, heartRateBpm: null, heartRateZone: null,
    };
    const row = makeRow({ execution: {
      workoutDayId: 'day-1', status: 'in_progress', version: 2,
      startedAt: new Date('2026-10-01T14:00:00.000Z'), finishedAt: null,
      currentPauseStartedAt: null, pausedDurationMs: BigInt(0),
      interruptionReason: null, originReleaseId: 'release-1',
      originWorkoutTemplateId: 'template-1', originTrainingPlanId: 'plan-1',
      sessionValues: { speedKmh: 0 },
      plannedSnapshot: { id: 'day-1', cyclicStages: [], exercises: [], resistanceGroups: [] },
      items: [executionItem],
    } });
    releasedRows = [row];

    const student = await service.getRoutine({ alunoId: 'aluno-1',
      contractId: 'contract-1', audience: 'student', now });
    const professor = await service.getRoutine({ alunoId: 'aluno-1',
      contractId: 'contract-1', audience: 'professor', now });

    const studentItem = student.today.sessions[0].execution.items[0];
    const professorItem = professor.today.sessions[0].execution.items[0];
    expect(studentItem).not.toHaveProperty('rir');
    expect(studentItem).not.toHaveProperty('rpe');
    expect(studentItem).not.toHaveProperty('tempo');
    expect(studentItem).toMatchObject({ loadKg: 20, repetitions: 8, restSec: 45 });
    expect(student.today.sessions[0].execution.sessionValues.speedKmh).toBe(0);
    expect(JSON.stringify(student)).not.toContain('2-0-2');
    expect(professorItem).toMatchObject({ rir: 2, rpe: 7, tempo: '2-0-2' });
    expect(executionItem).toMatchObject({ rir: 2, rpe: 7, tempo: '2-0-2' });
  });

  it('expõe a origem consolidada e o contexto técnico somente ao professor', async () => {
    releasedRows = [makeRow()];
    releaseRows = [
      {
        id: 'release-1',
        assemblyId: 'assembly-1',
        workoutTemplateId: 'template-1',
        sourceAssemblyVersion: 3,
        releasedAssemblyVersion: 4,
      },
    ];

    const student = await service.getRoutine({ alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now });
    const professor = await service.getRoutine({ alunoId: 'aluno-1', contractId: 'contract-1', audience: 'professor', now });

    expect(student.today.sessions[0].origin).toEqual({ kind: 'consolidated', releasedAt: '2026-09-28T12:00:00.000Z' });
    expect(student.today.sessions[0]).not.toHaveProperty('technical');
    expect(JSON.stringify(student)).not.toContain('Objetivo interno do professor');
    expect(professor.today.sessions[0].origin.consolidatedRelease).toEqual({
      releaseId: 'release-1',
      assemblyId: 'assembly-1',
      sourceAssemblyVersion: 3,
      releasedAssemblyVersion: 4,
    });
    expect(professor.today.sessions[0].technical).toMatchObject({ coachGoal: 'Objetivo interno do professor' });

    const releaseSql = queryRaw.mock.calls.find(([strings]) =>
      strings.join('?').includes('ConsolidatedPrescriptionOperationalRelease')
    );
    expect(releaseSql?.slice(1)).toEqual(expect.arrayContaining(['contract-1', 'aluno-1']));
  });

  it('não consulta nem projeta check-in sensível ao professor sem concessão explícita', async () => {
    releasedRows = [makeRow()];
    preWorkoutCheckInFindMany.mockResolvedValue([
      {
        id: 'checkin-1',
        workoutDayId: 'day-1',
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        psr: 7,
        sleepQuality: 8,
        fatigue: 3,
        painLevel: 4,
        motivation: 9,
        availableMinutes: 45,
        notes: 'Observação sensível',
        ruleSetVersion: 'pre-workout-check-in-v1',
        ruleSnapshot: {
          version: 'pre-workout-check-in-v1',
          painTriage: 'attention',
          studentMessage: 'Atenção',
          technicalMessage: 'Mensagem técnica',
          blocksWorkout: false,
          changesWorkoutAutomatically: false,
        },
        createdByUserId: 'user-1',
        createdAt: new Date('2026-10-01T12:00:00.000Z'),
        updatedAt: new Date('2026-10-01T12:00:00.000Z'),
      },
    ]);

    const routine = await service.getRoutine({
      alunoId: 'aluno-1',
      contractId: 'contract-1',
      audience: 'professor',
      now,
    });

    expect(preWorkoutCheckInFindMany).not.toHaveBeenCalled();
    expect(routine.today.sessions[0]).not.toHaveProperty('preWorkoutCheckIn');
    expect(JSON.stringify(routine)).not.toContain('Observação sensível');
  });

  it('projeta o check-in ao professor quando a concessão explícita foi validada', async () => {
    releasedRows = [makeRow()];
    preWorkoutCheckInFindMany.mockResolvedValue([
      {
        id: 'checkin-1',
        workoutDayId: 'day-1',
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        psr: 7,
        sleepQuality: 8,
        fatigue: 3,
        painLevel: 4,
        motivation: 9,
        availableMinutes: 45,
        notes: 'Contexto autorizado',
        ruleSetVersion: 'pre-workout-check-in-v1',
        ruleSnapshot: {
          version: 'pre-workout-check-in-v1',
          painTriage: 'attention',
          studentMessage: 'Atenção',
          technicalMessage: 'Mensagem técnica',
          blocksWorkout: false,
          changesWorkoutAutomatically: false,
        },
        createdByUserId: 'user-1',
        createdAt: new Date('2026-10-01T12:00:00.000Z'),
        updatedAt: new Date('2026-10-01T12:00:00.000Z'),
      },
    ]);

    const routine = await service.getRoutine({
      alunoId: 'aluno-1',
      contractId: 'contract-1',
      audience: 'professor',
      includePreWorkoutCheckIn: true,
      now,
    });

    expect(preWorkoutCheckInFindMany).toHaveBeenCalledTimes(1);
    expect(routine.today.sessions[0].preWorkoutCheckIn).toMatchObject({
      values: { notes: 'Contexto autorizado' },
      technical: {
        ruleSetVersion: 'pre-workout-check-in-v1',
        technicalMessage: 'Mensagem técnica',
      },
    });
  });

  it('não publica no Treino de hoje template liberado apenas pelo Workout Builder', async () => {
    releasedRows = [makeRow()];
    releaseRows = [];

    const routine = await service.getRoutine({
      alunoId: 'aluno-1',
      contractId: 'contract-1',
      audience: 'professor',
      now,
    });

    expect(routine.today).toEqual({ date: '2026-10-01', state: 'none', sessions: [] });
    expect(routine.days[3].sessions).toEqual([]);
  });

  it('não inclui na rotina semanal template manual liberado em outro dia', async () => {
    releasedRows = [
      makeRow({
        id: 'day-manual-week',
        workoutDate: new Date('2026-10-03T00:00:00.000Z'),
        dayOfWeek: 5,
      }),
    ];
    releaseRows = [];

    const routine = await service.getRoutine({
      alunoId: 'aluno-1',
      contractId: 'contract-1',
      audience: 'student',
      now,
    });

    expect(routine.days[5].sessions).toEqual([]);
    expect(routine.today.state).toBe('none');
  });

  it('organiza exercícios em aquecimento, principal, finalização e demais blocos', async () => {
    releasedRows = [
      makeRow({
        exercises: [
          exercise('c', 'resfriamento', 1),
          exercise('x', 'livre', 1),
          exercise('b2', 'sessao', 2),
          exercise('b1', 'principal', 1),
          exercise('a', 'mobilidade', 1),
        ],
      }),
    ];

    const routine = await service.getRoutine({ alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now });
    const blocks = routine.today.sessions[0].blocks;

    expect(blocks.map((block) => block.key)).toEqual(['warmup', 'main', 'cooldown', 'other']);
    expect(blocks[1].exercises.map((item) => item.id)).toEqual(['b2', 'b1']);
    expect(routine.today.sessions[0].modalities).toEqual(['resistance']);
  });

  it('uses catalog name captured at release in the today routine', async () => {
    releasedRows = [makeRow({ exercises: [
      { ...exercise('a', 'sessao', 1), exercise: { name: 'Biblioteca alterada' },
        releasedCatalog: { catalog: { name: 'Agachamento prescrito na liberação' } } },
      { ...exercise('b', 'sessao', 2), releasedCatalog: null },
    ] })];
    const routine = await service.getRoutine({ alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now });
    expect(routine.today.sessions[0].blocks[0].exercises.map((item) => item.name))
      .toEqual(['Agachamento prescrito na liberação', 'Exercício b']);
    const query = findMany.mock.calls.find(([args]) => args.where.template?.released === true);
    expect(query?.[0]?.select?.exercises?.select?.releasedCatalog).toEqual({ select: { catalog: true } });
  });

  it('A-401-05: preserva modalidade cíclica sem projetar volume semanal como distância do dia', async () => {
    const cyclicRow = makeRow({ sessionDurationMin: null, cyclicTimeMin: 30, resistanceTimeMin: 20, targetHrMin: '140', targetHrMax: '150' });
    cyclicRow.template.totalVolumeKm = 5;
    releasedRows = [cyclicRow];
    capacityRows = [{ workoutDayId: 'day-1', capacity: 'flexibility' }];

    const routine = await service.getRoutine({ alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now });
    const session = routine.today.sessions[0];

    expect(session.modalities).toEqual(['cyclic', 'flexibility']);
    expect(session.durationMin).toBe(50);
    expect(session.cyclic).toEqual({
      durationMin: 30,
      distanceKm: null,
      heartRate: { min: '140', max: '150' },
      speed: null,
      pace: null,
    });
  });


  it('A-401-05: volume semanal isolado não cria falsa meta ou modalidade diária', async () => {
    const row = makeRow({ sessionDurationMin: null, cyclicTimeMin: null, exercises: [], cyclicStages: [] });
    row.template.totalVolumeKm = 30;
    releasedRows = [row];

    const routine = await service.getRoutine({
      alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now,
    });
    const session = routine.today.sessions[0];
    expect(session.modalities).toEqual([]);
    expect(session.cyclic).toBeNull();
    const projectedSelect = findMany.mock.calls.find(([args]) => args.where.template?.released === true)?.[0].select;
    expect(projectedSelect.template.select.totalVolumeKm).toBeUndefined();
  });

  it('projeta o status legado no vocabulário canônico da #389 sem criar segunda autoridade', async () => {
    releasedRows = [makeRow({ status: 'planned' })];
    const notStarted = await service.getRoutine({ alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now });
    expect(notStarted.today.sessions[0].status).toBe('not_started');

    releasedRows = [makeRow({ status: 'in_progress' })];
    const inProgress = await service.getRoutine({ alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now });
    expect(inProgress.today.sessions[0].status).toBe('in_progress');
  });

  it('declara o contrato canônico de execução como disponível após a #389', async () => {
    const routine = await service.getRoutine({ alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now });
    expect(routine.execution).toEqual({ available: true, reason: null });
  });

  it('usa a data civil do fuso do produto e aceita navegar para outra semana', async () => {
    const lateNight = new Date('2026-10-02T02:30:00.000Z');
    expect(todayInTimeZone(lateNight, 'America/Sao_Paulo')).toBe('2026-10-01');

    const routine = await service.getRoutine({
      alunoId: 'aluno-1',
      contractId: 'contract-1',
      audience: 'student',
      date: '2026-10-08',
      now,
    });
    expect(routine.referenceDate).toBe('2026-10-08');
    expect(routine.week).toEqual({ startDate: '2026-10-05', endDate: '2026-10-11' });
    expect(routine.days.some((day) => day.isToday)).toBe(false);
    expect(routine.today.date).toBe('2026-10-01');
  });

  it('rejeita datas inválidas', async () => {
    await expect(
      service.getRoutine({ alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', date: '2026-02-30', now })
    ).rejects.toBeInstanceOf(TrainingRoutineInputError);
    expect(() => parseDateOnly('01/10/2026')).toThrow(TrainingRoutineInputError);
  });

  it('resolve a semana a partir de um domingo', () => {
    const week = resolveRoutineWeek(parseDateOnly('2026-10-04'));
    expect(week.start.toISOString().slice(0, 10)).toBe('2026-09-28');
  });
  it('A-401-026: a historical routine with no snapshot does not read the mutable plan', async () => {
    const persisted = {
      workoutDayId: 'day-past', status: 'completed', version: 5,
      startedAt: new Date('2026-09-30T10:00:00.000Z'),
      finishedAt: new Date('2026-09-30T11:00:00.000Z'),
      currentPauseStartedAt: null, pausedDurationMs: BigInt(0), interruptionReason: null,
      originReleaseId: 'release-1', originWorkoutTemplateId: 'template-1',
      originTrainingPlanId: 'plan-1', plannedSnapshot: null, sessionValues: {},
      items: [{ plannedUnitId: 'exercise-old', plannedSetId: 'set-old',
        setNumber: 1, outcome: 'full', completedAt: new Date('2026-09-30T10:30:00.000Z'),
        repetitions: 10, loadKg: 25, rir: 2, rpe: null, tempo: null,
        restSec: 30, durationSec: null, distanceKm: null, pace: null,
        heartRateBpm: null, heartRateZone: null, substitutionNote: null }],
    };
    const legacy = makeRow({ id: 'day-past', workoutDate: new Date('2026-09-30T00:00:00.000Z'),
      exercises: [exercise('exercise-old', 'principal', 1)], execution: persisted });
    releasedRows = [legacy];
    const query = { alunoId: 'aluno-1', contractId: 'contract-1',
      date: '2026-09-30', now };
    const firstStudent = await service.getRoutine({ ...query, audience: 'student' });
    const firstProfessor = await service.getRoutine({ ...query, audience: 'professor' });
    // A mutable prescription changes its series count and exercises; historical
    // comparison stays byte-for-byte equivalent for both audiences.
    legacy.exercises = [exercise('exercise-old', 'principal', 1),
      exercise('added-later', 'principal', 2)];
    legacy.exercises[0].sets = 99;
    const nextStudent = await service.getRoutine({ ...query, audience: 'student' });
    const nextProfessor = await service.getRoutine({ ...query, audience: 'professor' });
    const historical = (routine: typeof firstStudent) => routine.days[2].sessions[0].comparison;
    expect(historical(nextStudent)).toEqual(historical(firstStudent));
    expect(historical(nextProfessor)).toEqual(historical(firstProfessor));
    const student = historical(firstStudent)!;
    const professor = historical(firstProfessor)!;
    expect(student.snapshotSource).toBe('released_plan');
    expect(student.units[0].outcome).toBe('historical_unknown');
    expect(student.units.some((unit) => unit.kind === 'set')).toBe(false);
    expect(professor.units.find((unit) => unit.plannedUnitId === 'set-old'))
      .toMatchObject({ outcome: 'full' });
    expect(professor.units.find((unit) => unit.plannedUnitId === 'exercise-old'))
      .toMatchObject({ outcome: 'historical_unknown' });
    expect(professor.units.find((unit) => unit.plannedUnitId === 'set-old')?.metrics
      .find((metric) => metric.key === 'load_kg')).toMatchObject({
        planned: null, executed: 25, difference: null,
      });
    expect(findMany.mock.calls.some(([args]) => args.select?.resistanceGroups)).toBe(false);
  });

  it('exposes the frozen comparison for an earlier session in the selected week, per audience', async () => {
    const historical = {
      id: 'day-past',
      sessionDurationMin: 60, cyclicTimeMin: null, stimulusDurationMin: null,
      targetHrMin: null, targetHrMax: null, targetSpeedMin: null, targetSpeedMax: null,
      paceMin: null, paceMax: null, template: { totalVolumeKm: null },
      cyclicStages: [], resistanceGroups: [],
      exercises: [{
        id: 'exercise-old', section: 'principal', exerciseOrder: 1,
        sets: 1, reps: 10, load: 20, intervalSec: 60,
        exercise: { name: 'Original' }, releasedCatalog: null,
        resistanceBlocks: [{ id: 'block-old', position: 1, kind: 'principal',
          plannedSets: [{ id: 'set-old', position: 1, repsMin: 10, repsMax: 10,
            loadKg: 20, loadPercent: null, rir: null, rpe: null, tempo: null, restSec: 60 }],
        }],
      }],
    };
    releasedRows = [makeRow({
      id: 'day-past',
      workoutDate: new Date('2026-09-30T00:00:00.000Z'),
      execution: {
        workoutDayId: 'day-past', status: 'completed', version: 2,
        startedAt: new Date('2026-09-30T10:00:00.000Z'),
        finishedAt: new Date('2026-09-30T11:00:00.000Z'),
        currentPauseStartedAt: null, pausedDurationMs: BigInt(0),
        interruptionReason: null, originReleaseId: 'release-1',
        originWorkoutTemplateId: 'template-1', originTrainingPlanId: 'plan-1',
        sessionValues: {}, plannedSnapshot: historical,
        items: [{ plannedUnitId: 'exercise-old', plannedSetId: 'set-old',
          setNumber: 1, outcome: null, completedAt: new Date('2026-09-30T10:30:00.000Z'),
          loadKg: 22, repetitions: 10,
          durationSec: null, distanceKm: null, pace: null,
          heartRateBpm: null, heartRateZone: null, substitutionNote: null,
          rir: null, rpe: null, tempo: null, restSec: 60 }],
      },
    })];
    const query = { alunoId: 'aluno-1', contractId: 'contract-1',
      now, date: '2026-09-30' };
    const student = await service.getRoutine({ ...query, audience: 'student' });
    const professor = await service.getRoutine({ ...query, audience: 'professor' });
    expect(student.today.sessions).toEqual([]);
    const studentComparison = student.days[2].sessions[0].comparison!;
    const professorComparison = professor.days[2].sessions[0].comparison!;
    expect(studentComparison.snapshotSource).toBe('captured');
    expect(studentComparison.units.some((unit) => unit.kind === 'set')).toBe(false);
    const plannedSet = professorComparison.units.find((unit) => unit.plannedUnitId === 'set-old');
    // #487 guided confirmation is durable set evidence even without an explicit outcome.
    expect(plannedSet?.outcome).toBe('full');
    expect(findMany.mock.calls.some(([args]) =>
      args.select?.execution?.select?.items?.select?.completedAt === true
    )).toBe(true);
    expect(plannedSet?.metrics.find((metric) => metric.key === 'load_kg')).toMatchObject({
      planned: 20, executed: 22, difference: 2,
    });
    expect(professorComparison.units.some((unit) => unit.kind === 'set')).toBe(true);
    // A draft with no completion marker must remain unclassified.
    releasedRows[0].execution.items[0].completedAt = null;
    const notConfirmed = await service.getRoutine({ ...query, audience: 'professor' });
    expect(notConfirmed.days[2].sessions[0].comparison?.units
      .find((unit) => unit.plannedUnitId === 'set-old')?.outcome).toBe('unclassified');
    // Only the scoped routine read is needed; captured snapshots are already
    // on the execution, and a legacy comparison must not query a current plan.
    expect(findMany.mock.calls.some(([args]) => args.select?.resistanceGroups)).toBe(false);
  });

});
