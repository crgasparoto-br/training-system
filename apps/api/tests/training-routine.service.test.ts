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
    plan: { id: 'plan-1', name: 'Plano 2026' },
  },
  exercises: [],
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
  const client = {
    workoutDay: { findMany },
    $queryRaw: queryRaw,
  } as unknown as PrismaClient;
  const service = createTrainingRoutineService(client);
  const now = new Date('2026-10-01T15:00:00.000Z');

  let releasedRows: Row[];
  let pendingRows: Row[];
  let capacityRows: Row[];
  let releaseRows: Row[];

  beforeEach(() => {
    jest.clearAllMocks();
    releasedRows = [];
    pendingRows = [];
    capacityRows = [];
    releaseRows = [makeRelease()];
    findMany.mockImplementation((args: any) =>
      Promise.resolve(args.where.template.released ? releasedRows : pendingRows)
    );
    queryRaw.mockImplementation((strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (sql.includes('WorkoutDayCapacityOperationalBlock')) return Promise.resolve(capacityRows);
      if (sql.includes('ConsolidatedPrescriptionOperationalRelease')) return Promise.resolve(releaseRows);
      throw new Error(`SQL inesperado: ${sql}`);
    });
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
      status: 'planned',
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

  it('identifica modalidades pelos dados persistidos da sessão e dos blocos estruturados', async () => {
    releasedRows = [
      makeRow({ sessionDurationMin: null, cyclicTimeMin: 30, resistanceTimeMin: 20, targetHrMin: '140', targetHrMax: '150' }),
    ];
    capacityRows = [{ workoutDayId: 'day-1', capacity: 'flexibility' }];

    const routine = await service.getRoutine({ alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now });
    const session = routine.today.sessions[0];

    expect(session.modalities).toEqual(['cyclic', 'flexibility']);
    expect(session.durationMin).toBe(50);
    expect(session.cyclic).toEqual({
      durationMin: 30,
      heartRate: { min: '140', max: '150' },
      speed: null,
      pace: null,
    });
  });

  it('declara o contrato de execução como indisponível até a #389', async () => {
    const routine = await service.getRoutine({ alunoId: 'aluno-1', contractId: 'contract-1', audience: 'student', now });
    expect(routine.execution).toEqual({ available: false, reason: 'execution_contract_pending' });
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
});
