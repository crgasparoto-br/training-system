import express from 'express';
import workoutRouter from '../src/routes/workout.routes';
import { workoutService } from '../src/modules/workout/workout.service';
import { prismaRuntimeClient } from '../src/common/prisma-runtime-client';

const request = require('supertest');

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: any, res: any, next: any) =>
    req.headers['x-test-anonymous'] ? res.status(401).json({ error: 'Token não fornecido' }) : next(),
  professorMiddleware: (req: any, res: any, next: any) => {
    if (req.headers['x-test-student']) return res.status(403).json({ error: 'Apenas professores' });
    req.user = { contractId: 'contract-test', type: 'professor' };
    next();
  },
}));
jest.mock('../src/common/prisma-runtime-client', () => ({
  prismaRuntimeClient: {
    trainingPlan: { findFirst: jest.fn().mockResolvedValue({ id: 'plan-1' }) },
    workoutTemplate: { findFirst: jest.fn().mockResolvedValue({ id: 'template-1' }) },
    workoutDay: { findFirst: jest.fn().mockResolvedValue({ id: 'day-1' }) },
    workoutExercise: { findFirst: jest.fn().mockResolvedValue({ id: 'row-1' }) },
    exerciseLibrary: { findFirst: jest.fn().mockResolvedValue({ id: 'exercise-1' }) },
  },
}));


jest.mock('../src/modules/workout/workout.service', () => ({
  workoutService: {
    getOrCreateTemplate: jest.fn(),
    copyTemplate: jest.fn(),
    copyTemplateSections: jest.fn(),
    reorderExercises: jest.fn(),
    getTemplateById: jest.fn(),
    updateTemplate: jest.fn(),
    deleteTemplate: jest.fn(),
    releaseTemplate: jest.fn(),
    getOrCreateDay: jest.fn(),
    getDay: jest.fn(),
    updateDay: jest.fn(),
    deleteDay: jest.fn(),
    copyDay: jest.fn(),
    getExercises: jest.fn(),
    addExercise: jest.fn(),
    updateExercise: jest.fn(),
    replaceDayResistanceExercises: jest.fn(),
    deleteExercise: jest.fn(),
  },
}));

const invalidDateCases = [
  { name: 'missing', includeField: false, value: undefined },
  { name: 'null', includeField: true, value: null },
  { name: 'empty string', includeField: true, value: '' },
  { name: 'blank string', includeField: true, value: '   ' },
  { name: 'invalid string', includeField: true, value: 'not-a-date' },
  { name: 'normalized invalid ISO date', includeField: true, value: '2026-02-31' },
  { name: 'normalized invalid non-leap date', includeField: true, value: '2025-02-29' },
  { name: 'normalized invalid legacy numeric date', includeField: true, value: '02/31/2026' },
  { name: 'normalized invalid textual date', includeField: true, value: 'Feb 29, 2025' },
  { name: 'invalid dotted year-first date', includeField: true, value: '2026.02.31' },
  { name: 'invalid dashed month-first date', includeField: true, value: '02-31-2026' },
  { name: 'invalid dashed textual date', includeField: true, value: 'Feb-31-2026' },
  { name: 'invalid spaced year-first date', includeField: true, value: '2026 02 31' },
  { name: 'invalid comma-separated year-first date', includeField: true, value: '2026,02,31' },
  { name: 'invalid day-first textual date', includeField: true, value: '31 Feb 2026' },
  { name: 'invalid year-first textual date', includeField: true, value: '2026-Feb-31' },
  { name: 'invalid two-digit-year date', includeField: true, value: '02-31-26' },
  { name: 'weekday-prefixed invalid year-first date', includeField: true, value: 'Mon 2026-02-31' },
  { name: 'weekday-prefixed invalid month-first date', includeField: true, value: 'Mon, 02/31/2026' },
  { name: 'weekday-prefixed invalid year-first textual date', includeField: true, value: 'Mon 2026 Feb 31' },
  { name: 'numeric-only string', includeField: true, value: '0' },
  { name: 'number', includeField: true, value: 0 },
  { name: 'object', includeField: true, value: { year: 2026, month: 9, day: 14 } },
] as const;

const validDateCases = [
  { name: 'valid leap day', value: '2024-02-29T12:00:00.000Z' },
  { name: 'valid RFC 2822 date', value: 'Mon, 14 Sep 2026 12:00:00 GMT' },
  { name: 'valid legacy numeric date', value: '09/14/2026' },
  { name: 'valid dotted year-first date', value: '2026.02.28' },
  { name: 'valid dashed month-first date', value: '02-28-2026' },
  { name: 'valid dashed textual date', value: 'Feb-28-2026' },
  { name: 'valid day-first textual date', value: '28 Feb 2026' },
  { name: 'valid year-first textual date', value: '2026-Feb-28' },
  { name: 'valid two-digit-year date', value: '02-28-26' },
  { name: 'valid weekday-prefixed year-first date', value: 'Mon 2026-02-28' },
  { name: 'valid weekday-prefixed month-first date', value: 'Mon, 02/28/2026' },
  { name: 'valid weekday-prefixed year-first textual date', value: 'Mon 2026 Feb 28' },
] as const;

describe('workout routes date normalization', () => {
  const app = express();

  app.use(express.json());
  app.use('/workout', workoutRouter);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('converts a valid weekStartDate string to Date without changing sibling fields or instant', async () => {
    const payload = {
      planId: 'plan-1',
      mesocycleNumber: 2,
      weekNumber: 3,
      weekStartDate: '2026-09-14T09:00:00.000-03:00',
      cyclicFrequency: 2,
      totalVolumeMin: 45,
      observation1: 'preserve this value',
    };
    (workoutService.getOrCreateTemplate as jest.Mock).mockResolvedValue({ id: 'template-1' });

    const response = await request(app).post('/workout/templates/get-or-create').send(payload);

    expect(response.status).toBe(200);
    expect(workoutService.getOrCreateTemplate).toHaveBeenCalledTimes(1);

    const serviceInput = (workoutService.getOrCreateTemplate as jest.Mock).mock.calls[0][0];
    expect(serviceInput).toEqual({
      ...payload,
      weekStartDate: expect.any(Date),
    });
    expect(serviceInput.weekStartDate.getTime()).toBe(Date.parse(payload.weekStartDate));
  });

  it.each(validDateCases)('accepts $name without narrowing the contract to ISO-only', async ({ value }) => {
    const payload = {
      planId: 'plan-1',
      mesocycleNumber: 1,
      weekNumber: 1,
      weekStartDate: value,
    };
    (workoutService.getOrCreateTemplate as jest.Mock).mockResolvedValue({ id: 'template-1' });

    const response = await request(app).post('/workout/templates/get-or-create').send(payload);

    expect(response.status).toBe(200);
    expect(workoutService.getOrCreateTemplate).toHaveBeenCalledTimes(1);
    const serviceInput = (workoutService.getOrCreateTemplate as jest.Mock).mock.calls[0][0];
    expect(serviceInput.weekStartDate).toBeInstanceOf(Date);
    expect(serviceInput.weekStartDate.getTime()).toBe(Date.parse(value));
  });

  it.each(invalidDateCases)(
    'rejects $name weekStartDate before calling get-or-create service',
    async ({ includeField, value }) => {
      const payload: Record<string, unknown> = {
        planId: 'plan-1',
        mesocycleNumber: 1,
        weekNumber: 1,
      };
      if (includeField) {
        payload.weekStartDate = value;
      }

      const response = await request(app).post('/workout/templates/get-or-create').send(payload);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid weekStartDate' });
      expect(workoutService.getOrCreateTemplate).not.toHaveBeenCalled();
    }
  );

  it('uses the same normalization for a valid template copy date and preserves its instant', async () => {
    (workoutService.copyTemplate as jest.Mock).mockResolvedValue({ id: 'template-copy' });
    const targetWeekStartDate = '2026-09-21T15:00:00.000+03:00';

    const response = await request(app).post('/workout/templates/template-1/copy').send({
      targetWeekNumber: 4,
      targetWeekStartDate,
    });

    expect(response.status).toBe(200);
    expect(workoutService.copyTemplate).toHaveBeenCalledTimes(1);

    const [, targetWeekNumber, parsedTargetWeekStartDate] = (
      workoutService.copyTemplate as jest.Mock
    ).mock.calls[0];
    expect(targetWeekNumber).toBe(4);
    expect(parsedTargetWeekStartDate).toBeInstanceOf(Date);
    expect(parsedTargetWeekStartDate.getTime()).toBe(Date.parse(targetWeekStartDate));
  });

  it.each(invalidDateCases)(
    'rejects $name targetWeekStartDate before calling copy service',
    async ({ includeField, value }) => {
      const payload: Record<string, unknown> = {
        targetWeekNumber: 4,
      };
      if (includeField) {
        payload.targetWeekStartDate = value;
      }

      const response = await request(app).post('/workout/templates/template-1/copy').send(payload);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid targetWeekStartDate' });
      expect(workoutService.copyTemplate).not.toHaveBeenCalled();
    }
  );
});

describe('Issue #399 - route protection and contract isolation', () => {
  const app = express();
  app.use(express.json());
  app.use('/workout', workoutRouter);
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['get', '/workout/exercises?workoutDayId=day-1'],
    ['post', '/workout/exercises'],
    ['put', '/workout/exercises/row-1'],
    ['delete', '/workout/exercises/row-1'],
    ['put', '/workout/exercises/reorder'],
    ['get', '/workout/days/day-1'],
    ['get', '/workout/templates/template-1'],
  ])('rejects anonymous %s %s before any scope lookup', async (method, url) => {
    const response = await request(app)[method](url).set('x-test-anonymous', '1');
    expect(response.status).toBe(401);
    expect(prismaRuntimeClient.workoutDay.findFirst).not.toHaveBeenCalled();
  });

  it('rejects student access to legacy exercise reads', async () => {
    const response = await request(app).get('/workout/exercises?workoutDayId=day-1')
      .set('x-test-student', '1');
    expect(response.status).toBe(403);
  });

  it('returns 404 for a day belonging to another contract', async () => {
    (prismaRuntimeClient.workoutDay.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const response = await request(app).get('/workout/exercises?workoutDayId=other-contract-day');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: 'RESISTANCE_DAY_NOT_FOUND', error: 'Treino não encontrado.' });
  });

  it('dispatches the reorder endpoint ahead of parameterized exercise edits', async () => {
    (workoutService.reorderExercises as jest.Mock).mockResolvedValue(undefined);
    const response = await request(app).put('/workout/exercises/reorder').send({
      workoutDayId: 'day-1', section: 'sessao', exerciseIds: ['row-1'],
    });
    expect(response.status).toBe(204);
    expect(workoutService.reorderExercises).toHaveBeenCalledWith(
      'day-1', 'sessao', ['row-1'], 'contract-test',
    );
  });

  it('rejects library exercises from a different contract', async () => {
    (prismaRuntimeClient.exerciseLibrary.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const response = await request(app).post('/workout/exercises').send({
      workoutDayId: 'day-1', exerciseId: 'other-contract-exercise',
    });
    expect(response.status).toBe(404);
  });
});

describe('Issue #399 - copy failure boundary', () => {
  const app = express();
  app.use(express.json());
  app.use('/workout', workoutRouter);
  beforeEach(() => jest.clearAllMocks());

  const requestCopy = () => request(app).post('/workout/templates/template-1/copy').send({
    targetWeekNumber: 2, targetWeekStartDate: '2026-10-12T12:00:00.000Z',
  });

  it('returns conflict when destination is frozen instead of a raw 500', async () => {
    (workoutService.copyTemplate as jest.Mock).mockRejectedValueOnce({
      code: 'WORKOUT_PLANNING_LOCKED_AFTER_EXECUTION_START',
      message: 'Database internal lock diagnostics',
    });
    const response = await requestCopy();
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'WORKOUT_PLANNING_LOCKED_AFTER_EXECUTION_START',
    });
    expect(JSON.stringify(response.body)).not.toContain('Database internal');
  });

  it('does not expose SQL or database diagnostics on failed atomic copy', async () => {
    (workoutService.copyTemplate as jest.Mock).mockRejectedValueOnce(
      new Error('SQL deadlock at db.example.net, password=secret'),
    );
    const response = await requestCopy();
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: 'WORKOUT_COPY_FAILED', error: 'Não foi possível copiar a semana.',
    });
  });
});

describe('Issue #399 - template read failure boundary', () => {
  const app = express();
  app.use(express.json());
  app.use('/workout', workoutRouter);
  beforeEach(() => jest.clearAllMocks());

  const requestTemplate = () => request(app).post('/workout/templates/get-or-create').send({
    planId: 'plan-1',
    mesocycleNumber: 1,
    weekNumber: 1,
    weekStartDate: '2026-10-12T12:00:00.000Z',
  });

  it('returns a safe conflict when template planning is locked', async () => {
    (workoutService.getOrCreateTemplate as jest.Mock).mockRejectedValueOnce({
      code: 'WORKOUT_PLANNING_LOCKED_AFTER_EXECUTION_START',
      message: 'Database internal lock diagnostics',
    });
    const response = await requestTemplate();
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'WORKOUT_PLANNING_LOCKED_AFTER_EXECUTION_START',
    });
    expect(JSON.stringify(response.body)).not.toContain('Database internal');
  });

  it('does not expose SQL or database diagnostics when template loading fails', async () => {
    (workoutService.getOrCreateTemplate as jest.Mock).mockRejectedValueOnce(
      new Error('SQL deadlock at db.example.net, ******'),
    );
    const response = await requestTemplate();
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: 'WORKOUT_TEMPLATE_LOAD_FAILED',
      error: 'Não foi possível carregar o treino.',
    });
  });
});

describe('Issue #399 / AUD-399-11 - legacy workout public error boundary', () => {
  const app = express();
  app.use(express.json());
  app.use('/workout', workoutRouter);
  beforeEach(() => jest.clearAllMocks());

  const scenarios: Array<[string, string, keyof typeof workoutService, Record<string, unknown> | null]> = [
    ['get', '/workout/templates/template-1', 'getTemplateById', null],
    ['put', '/workout/templates/template-1', 'updateTemplate', {}],
    ['delete', '/workout/templates/template-1', 'deleteTemplate', null],
    ['post', '/workout/templates/template-1/release', 'releaseTemplate', {}],
    ['post', '/workout/days/get-or-create', 'getOrCreateDay', { templateId: 'template-1' }],
    ['get', '/workout/days/day-1', 'getDay', null],
    ['put', '/workout/days/day-1', 'updateDay', {}],
    ['delete', '/workout/days/day-1', 'deleteDay', null],
    ['post', '/workout/days/day-1/copy', 'copyDay', { targetDayOfWeek: 2, targetDate: '2026-10-13T12:00:00Z' }],
    ['get', '/workout/exercises?workoutDayId=day-1', 'getExercises', null],
    ['post', '/workout/exercises', 'addExercise', { workoutDayId: 'day-1', exerciseId: 'exercise-1' }],
    ['put', '/workout/exercises/row-1', 'updateExercise', { workoutDayId: 'day-1', exerciseId: 'exercise-1' }],
    ['delete', '/workout/exercises/row-1', 'deleteExercise', null],
    ['put', '/workout/exercises/reorder', 'reorderExercises', {
      workoutDayId: 'day-1', section: 'sessao', exerciseIds: ['row-1'],
    }],
  ];

  it.each(scenarios)('redacts unexpected Prisma/SQL error on %s %s', async (
    method, url, serviceMethod, payload,
  ) => {
    const secret = 'SQL P2010 database=db.internal.example password=secret-key-399';
    (workoutService[serviceMethod] as jest.Mock).mockRejectedValueOnce(new Error(secret));
    const call = (request(app) as any)[method](url);
    const response = payload === null ? await call : await call.send(payload);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: 'WORKOUT_OPERATION_FAILED',
      error: 'Não foi possível concluir a operação de treino.',
    });
    expect(JSON.stringify(response.body)).not.toContain(secret);
    expect(JSON.stringify(response.body)).not.toContain('SQL');
    expect(JSON.stringify(response.body)).not.toContain('password');
  });

  it.each([
    ['put', '/workout/exercises/reorder', 'reorderExercises', {
      workoutDayId: 'day-1', section: 'sessao', exerciseIds: ['row-1'],
    }],
    ['delete', '/workout/exercises/row-1', 'deleteExercise', null],
    ['post', '/workout/days/day-1/copy', 'copyDay', {
      targetDayOfWeek: 2, targetDate: '2026-10-13T12:00:00Z',
    }],
  ] as const)('keeps typed planning lock as sanitized 409 on %s %s', async (
    method, url, serviceMethod, payload,
  ) => {
    (workoutService[serviceMethod] as jest.Mock).mockRejectedValueOnce({
      code: 'WORKOUT_PLANNING_LOCKED_AFTER_EXECUTION_START',
      message: 'SQL diagnostic password=never-expose',
    });
    const call = (request(app) as any)[method](url);
    const response = payload === null ? await call : await call.send(payload);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('WORKOUT_PLANNING_LOCKED_AFTER_EXECUTION_START');
    expect(response.body.error).toBe('Este treino possui histórico ou já foi liberado e não pode ser alterado.');
    expect(JSON.stringify(response.body)).not.toContain('password');
  });
});

describe('Issue #399 / AUD-399-12 - public parent reassignment boundary', () => {
  const app = express();
  app.use(express.json());
  app.use('/workout', workoutRouter);
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['put', '/workout/templates/template-1', 'updateTemplate', { planId: 'other-contract-plan' }],
    ['put', '/workout/days/day-1', 'updateDay', { templateId: 'other-contract-template' }],
  ] as const)('returns sanitized HTTP 400 for rejected ownership on %s %s', async (
    method, url, serviceMethod, payload,
  ) => {
    // The HTTP input guard now rejects ownership changes before the mocked
    // service is invoked; do not leave an unused rejected mock for later tests.
    const response = await request(app)[method](url).send(payload);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'INVALID_RESISTANCE_STRUCTURE',
      error: 'Revise os blocos e as séries informados.',
    });
    expect(workoutService[serviceMethod]).not.toHaveBeenCalled();
  });
});

describe('AUD-399-14: malicious nested HTTP payloads cannot reach Prisma services', () => {
  const app = express();
  app.use(express.json());
  app.use('/workout', workoutRouter);
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['post', '/workout/templates/get-or-create', 'getOrCreateTemplate', {
      planId: 'plan-1', weekStartDate: '2026-10-12T12:00:00.000Z',
      workoutDays: { create: [{ dayOfWeek: 1 }] },
    }],
    ['put', '/workout/templates/template-1', 'updateTemplate', {
      workoutDays: { create: [{ dayOfWeek: 1 }] },
    }],
    ['post', '/workout/days/get-or-create', 'getOrCreateDay', {
      templateId: 'template-1', exercises: { create: [{ exerciseId: 'other-contract' }] },
    }],
    ['put', '/workout/days/day-1', 'updateDay', {
      exercises: { create: [{ exerciseId: 'other-contract' }] },
    }],
    ['post', '/workout/exercises', 'addExercise', {
      workoutDayId: 'day-1', exerciseId: 'exercise-1',
      exercise: { connect: { id: 'other-contract' } },
    }],
    ['put', '/workout/exercises/row-1', 'updateExercise', {
      resistanceBlocks: { create: [{ kind: 'principal', plannedSets: { create: [] } }] },
    }],
    ['put', '/workout/days/day-1/resistance-exercises', 'replaceDayResistanceExercises', {
      exercises: [{
        workoutDayId: 'day-1', exerciseId: 'exercise-1', section: 'sessao', exerciseOrder: 1,
        executionItems: { create: [{ loadKg: 100 }] },
      }],
    }],
    ['post', '/workout/exercises', 'addExercise', {
      workoutDayId: 'day-1', exerciseId: 'exercise-1',
      resistanceBlocks: [{ position: 1, kind: 'principal', plannedSets: [] }],
    }],
  ] as const)('returns safe HTTP 400 on %s %s and does not call %s', async (method, url, action, payload) => {
    const response = await (request(app) as any)[method](url).send(payload);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'INVALID_RESISTANCE_STRUCTURE', error: 'Revise os blocos e as séries informados.',
    });
    expect(workoutService[action]).not.toHaveBeenCalled();
  });

  it('continues to accept legitimate legacy metadata edits', async () => {
    (workoutService.updateTemplate as jest.Mock).mockResolvedValueOnce({ id: 'template-1' });
    (workoutService.updateDay as jest.Mock).mockResolvedValueOnce({ id: 'day-1' });
    expect((await request(app).put('/workout/templates/template-1').send({
      observation1: 'Observação', resistanceFrequency: 2,
    })).status).toBe(200);
    expect((await request(app).put('/workout/days/day-1').send({
      cyclicTimeMin: 12, detailNotes: 'Treino', intensity1: null,
    })).status).toBe(200);
    expect(workoutService.updateTemplate).toHaveBeenCalledWith('template-1', {
      observation1: 'Observação', resistanceFrequency: 2,
    });
    expect(workoutService.updateDay).toHaveBeenCalledWith('day-1', {
      cyclicTimeMin: 12, detailNotes: 'Treino', intensity1: null,
    });
  });
});

describe('AUD-399-23/24: public copy commands are strict and atomic', () => {
  const app = express();
  app.use(express.json());
  app.use('/workout', workoutRouter);

  beforeEach(() => jest.clearAllMocks());

  it.each([
    { targetDayOfWeek: 0, targetDate: '2026-10-12T12:00:00Z' },
    { targetDayOfWeek: 8, targetDate: '2026-10-12T12:00:00Z' },
    { targetDayOfWeek: 2.5, targetDate: '2026-10-12T12:00:00Z' },
    { targetDayOfWeek: 2, targetDate: '2026-02-31' },
  ])('rejects invalid copy-day boundary %#', async (payload) => {
    const response = await request(app).post('/workout/days/day-1/copy').send(payload);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_RESISTANCE_STRUCTURE');
    expect(workoutService.copyDay).not.toHaveBeenCalled();
  });

  it.each([1.5, 0, -1, NaN])('rejects non-integer copy-week boundary %#', async (targetWeekNumber) => {
    const response = await request(app).post('/workout/templates/template-1/copy').send({
      targetWeekNumber,
      targetWeekStartDate: '2026-10-12T12:00:00Z',
    });
    expect(response.status).toBe(400);
    expect(workoutService.copyTemplate).not.toHaveBeenCalled();
  });

  it('routes a partial modality copy as one backend command', async () => {
    (workoutService.copyTemplateSections as jest.Mock).mockResolvedValueOnce({ id: 'template-2' });
    const response = await request(app).post('/workout/templates/template-1/copy-sections').send({
      targetWeekNumber: 2,
      targetWeekStartDate: '2026-10-12T12:00:00Z',
      mode: 'resistance',
    });
    expect(response.status).toBe(200);
    expect(workoutService.copyTemplateSections).toHaveBeenCalledWith(
      'template-1', 2, new Date('2026-10-12T12:00:00.000Z'), 'resistance',
    );
  });
});
