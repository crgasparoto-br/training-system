import express from 'express';

const request = require('supertest');

const mockAlunoFindFirst = jest.fn();
const mockAccessPermissionFindFirst = jest.fn();
const mockGetRoutine = jest.fn();
const mockGetCheckIn = jest.fn();
const mockGetGuided = jest.fn();
const mockGetGuidedCyclic = jest.fn();
const mockActGuidedCyclic = jest.fn();
const mockCompleteGuided = jest.fn();
const mockActGuidedRest = jest.fn();
const mockSaveCheckIn = jest.fn();
const mockSaveExecutionValues = jest.fn();
const mockGetSessionExecution = jest.fn();
const mockTransitionExecution = jest.fn();
const mockResolveActiveStudentMembership = jest.fn();
const mockBlockAccessMiddleware = jest.fn(
  () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
);
const mockExplicitBlockAccessMiddleware = jest.fn(
  () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
);
let mockUser: Record<string, unknown> = {};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    aluno: { findFirst: mockAlunoFindFirst },
    accessPermission: { findFirst: mockAccessPermissionFindFirst },
  })),
  Prisma: { join: jest.fn() },
}));

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = mockUser as any;
    next();
  },
  alunoMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  professorMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../src/modules/access-control/access-control.middleware', () => ({
  blockAccessMiddleware: mockBlockAccessMiddleware,
  explicitBlockAccessMiddleware: mockExplicitBlockAccessMiddleware,
}));

jest.mock('../src/modules/workout/training-routine.service', () => {
  class TrainingRoutineInputError extends Error {}
  return {
    trainingRoutineService: { getRoutine: mockGetRoutine },
    TrainingRoutineInputError,
  };
});

jest.mock('../src/modules/workout/workout-session-execution.service', () => {
  class WorkoutSessionExecutionInputError extends Error {
    code = 'WORKOUT_SESSION_EXECUTION_INVALID';
  }
  class WorkoutSessionExecutionNotFoundError extends Error {}
  class WorkoutSessionExecutionConflictError extends Error {
    constructor(message: string, public readonly code:
      | 'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT'
      | 'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION'
      | 'WORKOUT_SESSION_EXECUTION_IDEMPOTENCY_CONFLICT' = 'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT') {
      super(message);
    }
  }
  return {
    workoutSessionExecutionService: {
      saveValues: mockSaveExecutionValues,
      getForSession: mockGetSessionExecution,
      transition: mockTransitionExecution,
      getGuidedForSession: mockGetGuided,
      getGuidedCyclicForSession: mockGetGuidedCyclic,
      actOnGuidedCyclic: mockActGuidedCyclic,
      completeGuided: mockCompleteGuided,
      actOnGuidedRest: mockActGuidedRest,
    },
    WorkoutSessionExecutionInputError,
    WorkoutSessionExecutionNotFoundError,
    WorkoutSessionExecutionConflictError,
  };
});

jest.mock('../src/modules/workout/pre-workout-check-in.service', () => {
  class PreWorkoutCheckInInputError extends Error {}
  class PreWorkoutCheckInNotFoundError extends Error {}
  class PreWorkoutCheckInConflictError extends Error {
    code = 'PRE_WORKOUT_CHECK_IN_LOCKED';
  }
  return {
    preWorkoutCheckInService: { getForSession: mockGetCheckIn, saveForStudent: mockSaveCheckIn },
    PreWorkoutCheckInInputError,
    PreWorkoutCheckInNotFoundError,
    PreWorkoutCheckInConflictError,
  };
});



jest.mock('../src/modules/alunos/student-account-context.service', () => {
  class StudentAccountContextError extends Error {
    constructor(
      message: string,
      public readonly code: 'STUDENT_NOT_FOUND' | 'STUDENT_CONTRACT_CONTEXT_REQUIRED'
    ) {
      super(message);
    }
  }
  return {
    normalizeRequestedStudentContractId: (value?: string) => value?.trim() || undefined,
    resolveActiveStudentMembership: mockResolveActiveStudentMembership,
    StudentAccountContextError,
  };
});

jest.mock('../src/modules/alunos/aluno.service', () => ({
  alunoService: { belongsToContract: jest.fn(), belongsToProfessor: jest.fn() },
}));
jest.mock('../src/modules/alunos/student-domain.service', () => ({ studentDomainService: {} }));
jest.mock('../src/modules/alunos/student-parq-boundary.service', () => ({ studentParqBoundaryService: {} }));
jest.mock('../src/modules/alunos/profile-review.service', () => ({ profileReviewService: {} }));
jest.mock('../src/modules/alunos/profile-audit.service', () => ({ profileAuditService: {} }));
jest.mock('../src/modules/assessments/assessment.service', () => ({ assessmentService: {} }));
jest.mock('../src/modules/alunos/aluno-assessment-plan.service', () => ({ alunoAssessmentPlanService: {} }));
jest.mock('../src/modules/alunos/student-identity.service', () => ({
  loadStudentIdentity: jest.fn(),
  upsertStudentIdentity: jest.fn(),
}));
jest.mock('../src/modules/alunos/student-health-intake-write.service', () => ({
  hasCanonicalHealthIntakeMutation: jest.fn(),
  upsertCanonicalStudentHealthIntake: jest.fn(),
}));
jest.mock('../src/modules/workout/student-workout.service', () => ({ studentWorkoutService: {} }));

const studentRouter = require('../src/routes/student.routes').default;
const segmentedAlunoRouter = require('../src/modules/alunos/student-domain.routes').default;
const { alunoService } = require('../src/modules/alunos/aluno.service');
const { TrainingRoutineInputError } = require('../src/modules/workout/training-routine.service');
const { StudentAccountContextError } = require('../src/modules/alunos/student-account-context.service');
const { WorkoutSessionExecutionNotFoundError, WorkoutSessionExecutionConflictError } =
  require('../src/modules/workout/workout-session-execution.service');

const routine = { alunoId: 'aluno-1', execution: { available: false, reason: 'execution_contract_pending' } };

describe('training routine HTTP boundaries (#387)', () => {
  const app = express();
  app.use(express.json());
  app.use('/student', studentRouter);
  app.use('/alunos', segmentedAlunoRouter);

  beforeEach(() => {
    mockGetRoutine.mockReset().mockResolvedValue(routine);
    mockGetCheckIn.mockReset().mockResolvedValue(null);
    mockSaveCheckIn.mockReset().mockResolvedValue({ id: 'checkin-1', editable: true });
    mockGetSessionExecution.mockReset();
    mockTransitionExecution.mockReset();
    mockSaveExecutionValues.mockReset().mockResolvedValue({ sessionId: 'day-1', version: 2,
      sessionValues: { speedKmh: 9 }, items: [] });
    mockGetGuided.mockReset().mockResolvedValue({ sessionId: 'day-1', availability: 'available', current: null });
    mockGetGuidedCyclic.mockReset().mockResolvedValue({ sessionId: 'day-1', version: 2, availability: 'available', current: { plannedStageId: 'stage-1', iteration: 1 } });
    mockActGuidedCyclic.mockReset().mockResolvedValue({ sessionId: 'day-1', version: 3, completed: 1 });
    mockCompleteGuided.mockReset().mockResolvedValue({ sessionId: 'day-1', completed: 1 });
    mockActGuidedRest.mockReset().mockResolvedValue({ sessionId: 'day-1', version: 3, rest: null });
    mockAlunoFindFirst.mockReset();
    mockAccessPermissionFindFirst.mockReset().mockResolvedValue(null);
    mockResolveActiveStudentMembership.mockReset();
    (alunoService.belongsToContract as jest.Mock).mockReset().mockResolvedValue(true);
    (alunoService.belongsToProfessor as jest.Mock).mockReset().mockResolvedValue(true);
  });

  describe('guided resistance HTTP isolation (#487)', () => {
    beforeEach(() => {
      mockUser = { userId: 'user-1', type: 'aluno' };
      mockResolveActiveStudentMembership.mockResolvedValue({ id: 'aluno-1', contractId: 'contract-1' });
      mockAlunoFindFirst.mockResolvedValue({ id: 'aluno-1', contractId: 'contract-1', user: { id: 'user-1' } });
    });

    const payload = () => ({
      operationKey: 'issue487-confirm-set-1',
      expectedVersion: 1, plannedUnitId: 'exercise-a',
      plannedSetId: 'planned-set-1', setNumber: 1,
      repetitions: 8, loadKg: 40.5,
    });

    it('scopes guided reads to authenticated student and requested contract, never a body/query alunoId', async () => {
      const response = await request(app)
        .get('/student/me/training-sessions/day-1/execution/guided?alunoId=foreign')
        .set('x-contract-id', 'contract-1');
      expect(response.status).toBe(200);
      expect(mockResolveActiveStudentMembership).toHaveBeenCalledWith('user-1', 'contract-1');
      expect(mockGetGuided).toHaveBeenCalledWith({
        sessionId: 'day-1', alunoId: 'aluno-1', contractId: 'contract-1',
      });
      expect(response.body.data).toMatchObject({ sessionId: 'day-1', availability: 'available' });
    });

    it('validates a single stable planned set and derives actor/tenant exclusively from membership', async () => {
      const response = await request(app)
        .post('/student/me/training-sessions/day-1/execution/guided/complete')
        .set('x-contract-id', 'contract-1').send(payload());
      expect(response.status).toBe(200);
      expect(mockCompleteGuided).toHaveBeenCalledWith({
        sessionId: 'day-1', alunoId: 'aluno-1', contractId: 'contract-1',
        actorUserId: 'user-1', payload: payload(),
      });
    });

    it('rejects tenant/student spoofing in a strict mutation body before entering service', async () => {
      const response = await request(app)
        .post('/student/me/training-sessions/day-1/execution/guided/complete')
        .set('x-contract-id', 'contract-1')
        .send({ ...payload(), contractId: 'foreign', alunoId: 'foreign' });
      expect(response.status).toBe(400);
      expect(mockCompleteGuided).not.toHaveBeenCalled();
    });

    it('never reads/writes without an explicit resolvable contract when required', async () => {
      mockResolveActiveStudentMembership.mockRejectedValue(
        new StudentAccountContextError('Selecione o contrato', 'STUDENT_CONTRACT_CONTEXT_REQUIRED')
      );
      const read = await request(app).get('/student/me/training-sessions/day-1/execution/guided');
      const write = await request(app).post('/student/me/training-sessions/day-1/execution/guided/complete').send(payload());
      expect(read.status).toBe(409);
      expect(write.status).toBe(409);
      expect(mockGetGuided).not.toHaveBeenCalled();
      expect(mockCompleteGuided).not.toHaveBeenCalled();
    });

    it('does not reveal another contract session, and signals a stale version as 409', async () => {
      mockGetGuided.mockRejectedValueOnce(new WorkoutSessionExecutionNotFoundError('not found'));
      const foreign = await request(app)
        .get('/student/me/training-sessions/foreign-day/execution/guided')
        .set('x-contract-id', 'contract-1');
      expect(foreign.status).toBe(404);
      mockCompleteGuided.mockRejectedValueOnce(new WorkoutSessionExecutionConflictError('stale version'));
      const stale = await request(app)
        .post('/student/me/training-sessions/day-1/execution/guided/complete')
        .set('x-contract-id', 'contract-1').send(payload());
      expect(stale.status).toBe(409);
    });
  });

  describe('guided cyclic HTTP authorization and version boundary (#489)', () => {
    beforeEach(() => {
      mockUser = { userId: 'user-1', type: 'aluno' };
      mockResolveActiveStudentMembership.mockResolvedValue({ id: 'aluno-1', contractId: 'contract-1' });
      mockAlunoFindFirst.mockResolvedValue({ id: 'aluno-1', contractId: 'contract-1', user: { id: 'user-1' } });
    });

    const step = () => ({
      operationKey: 'issue489-stage-work-1', expectedVersion: 2, plannedStageId: 'stage-1',
      iteration: 1, action: 'complete', outcome: 'partial',
      values: { durationSec: 35, heartRateBpm: 140 },
    });

    it('reads the scoped current step by membership; URL/query alunoId never overrides context', async () => {
      const response = await request(app)
        .get('/student/me/training-sessions/day-1/execution/guided-cyclic?alunoId=foreign')
        .set('x-contract-id', 'contract-1');
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        sessionId: 'day-1', version: 2, availability: 'available',
      });
      expect(mockResolveActiveStudentMembership).toHaveBeenCalledWith('user-1', 'contract-1');
      expect(mockGetGuidedCyclic).toHaveBeenCalledWith({
        sessionId: 'day-1', alunoId: 'aluno-1', contractId: 'contract-1',
      });
    });

    it('accepts stable stage identity, iteration and metrics without accepting client actor/tenant', async () => {
      const payload = step();
      const response = await request(app)
        .post('/student/me/training-sessions/day-1/execution/guided-cyclic/step')
        .set('x-contract-id', 'contract-1')
        .send(payload);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ sessionId: 'day-1', version: 3, completed: 1 });
      expect(mockActGuidedCyclic).toHaveBeenCalledWith({
        sessionId: 'day-1', alunoId: 'aluno-1', contractId: 'contract-1',
        actorUserId: 'user-1', payload,
      });
      const forged = await request(app)
        .post('/student/me/training-sessions/day-1/execution/guided-cyclic/step')
        .set('x-contract-id', 'contract-1')
        .send({ ...payload, contractId: 'foreign', alunoId: 'foreign', actorUserId: 'other' });
      expect(forged.status).toBe(400);
      expect(mockActGuidedCyclic).toHaveBeenCalledTimes(1);
    });

    it('rejects malformed iterations, negative metrics and invalid action/outcome combinations', async () => {
      const invalid = [
        { ...step(), iteration: 0 },
        { ...step(), values: { distanceMeters: -1 } },
        { ...step(), values: { speedKmh: 'fast' } },
        { ...step(), action: 'fast_forward' },
        { ...step(), operationKey: '' },
      ];
      for (const payload of invalid) {
        const response = await request(app)
          .post('/student/me/training-sessions/day-1/execution/guided-cyclic/step')
          .set('x-contract-id', 'contract-1').send(payload);
        expect(response.status).toBe(400);
      }
      expect(mockActGuidedCyclic).not.toHaveBeenCalled();
    });

    it('does not leak foreign sessions; propagates version conflicts with canonical error code', async () => {
      mockGetGuidedCyclic.mockRejectedValueOnce(new WorkoutSessionExecutionNotFoundError('not found'));
      const foreign = await request(app)
        .get('/student/me/training-sessions/foreign-day/execution/guided-cyclic')
        .set('x-contract-id', 'contract-1');
      expect(foreign.status).toBe(404);
      mockActGuidedCyclic.mockRejectedValueOnce(new WorkoutSessionExecutionConflictError(
        'versão obsoleta', 'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT',
      ));
      const conflict = await request(app)
        .post('/student/me/training-sessions/day-1/execution/guided-cyclic/step')
        .set('x-contract-id', 'contract-1').send(step());
      expect(conflict.status).toBe(409);
      expect(conflict.body).toMatchObject({
        success: false, details: { code: 'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT' },
      });
    });

    it('blocks reads and writes when the selected student contract cannot be resolved', async () => {
      mockResolveActiveStudentMembership.mockRejectedValue(
        new StudentAccountContextError('Selecione o contrato', 'STUDENT_CONTRACT_CONTEXT_REQUIRED')
      );
      const read = await request(app)
        .get('/student/me/training-sessions/day-1/execution/guided-cyclic');
      const write = await request(app)
        .post('/student/me/training-sessions/day-1/execution/guided-cyclic/step').send(step());
      expect(read.status).toBe(409);
      expect(write.status).toBe(409);
      expect(mockGetGuidedCyclic).not.toHaveBeenCalled();
      expect(mockActGuidedCyclic).not.toHaveBeenCalled();
    });
  });

  describe('guided rest HTTP conflict envelope (#488)', () => {
    beforeEach(() => {
      mockUser = { userId: 'user-1', type: 'aluno' };
      mockResolveActiveStudentMembership.mockResolvedValue({ id: 'aluno-1', contractId: 'contract-1' });
      mockAlunoFindFirst.mockResolvedValue({ id: 'aluno-1', contractId: 'contract-1', user: { id: 'user-1' } });
    });

    const restPayload = () => ({
      operationKey: 'issue488-rest-finish-early', expectedVersion: 2,
      restId: 'rest-1', action: 'finish',
    });

    it('returns the @corrida/utils details.code envelope for a premature finish', async () => {
      mockActGuidedRest.mockRejectedValueOnce(new WorkoutSessionExecutionConflictError(
        'O descanso ainda não terminou.', 'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION',
      ));
      const response = await request(app)
        .post('/student/me/training-sessions/day-1/execution/guided/rest')
        .set('x-contract-id', 'contract-1').send(restPayload());
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        success: false,
        details: { code: 'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION' },
      });
      expect(response.body.errors).toBeUndefined();
      expect(mockActGuidedRest).toHaveBeenCalledWith({
        sessionId: 'day-1', alunoId: 'aluno-1', contractId: 'contract-1',
        actorUserId: 'user-1', payload: restPayload(),
      });
    });

    it('keeps version conflicts distinguishable from a premature finish in the public response', async () => {
      mockActGuidedRest.mockRejectedValueOnce(new WorkoutSessionExecutionConflictError(
        'Versão alterada.', 'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT',
      ));
      const response = await request(app)
        .post('/student/me/training-sessions/day-1/execution/guided/rest')
        .set('x-contract-id', 'contract-1').send(restPayload());
      expect(response.status).toBe(409);
      expect(response.body.details).toEqual({ code: 'WORKOUT_SESSION_EXECUTION_VERSION_CONFLICT' });
      expect(response.body.errors).toBeUndefined();
    });

    it('preserves the normal rest action path and versioned canonical response', async () => {
      const response = await request(app)
        .post('/student/me/training-sessions/day-1/execution/guided/rest')
        .set('x-contract-id', 'contract-1').send({ ...restPayload(), action: 'skip' });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true, data: { sessionId: 'day-1', version: 3, rest: null },
      });
      expect(mockActGuidedRest).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /student/me/training-routine', () => {
    beforeEach(() => {
      mockUser = { userId: 'user-1', type: 'aluno' };
      mockResolveActiveStudentMembership.mockResolvedValue({ id: 'aluno-1', contractId: 'contract-1' });
      mockAlunoFindFirst.mockResolvedValue({ id: 'aluno-1', contractId: 'contract-1', user: { id: 'user-1' } });
    });

    it('resolve aluno e contrato pela sessão e ignora alunoId enviado pelo cliente', async () => {
      const response = await request(app)
        .get('/student/me/training-routine?date=2026-10-01&alunoId=aluno-2')
        .set('x-contract-id', 'contract-1');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(routine);
      expect(mockResolveActiveStudentMembership).toHaveBeenCalledWith('user-1', 'contract-1');
      expect(mockGetRoutine).toHaveBeenCalledWith({
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        audience: 'student',
        date: '2026-10-01',
      });
    });

    it('exige contexto contratual quando a conta possui mais de um vínculo', async () => {
      mockResolveActiveStudentMembership.mockRejectedValue(
        new StudentAccountContextError('Selecione o contrato', 'STUDENT_CONTRACT_CONTEXT_REQUIRED')
      );

      const response = await request(app).get('/student/me/training-routine');

      expect(response.status).toBe(409);
      expect(mockGetRoutine).not.toHaveBeenCalled();
    });

    it('responde 400 para data inválida', async () => {
      mockGetRoutine.mockRejectedValue(new TrainingRoutineInputError('Data inválida'));
      const response = await request(app).get('/student/me/training-routine?date=amanha');
      expect(response.status).toBe(400);
    });

    it('não expõe detalhes internos em falha inesperada', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockGetRoutine.mockRejectedValue(new Error('connection refused at 10.0.0.1'));
      const response = await request(app).get('/student/me/training-routine');
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('10.0.0.1');
      consoleError.mockRestore();
    });
  });

  describe('session-speed write contract (#401 A-401-09)', () => {
    beforeEach(() => {
      mockUser = { userId: 'user-1', type: 'aluno' };
      mockResolveActiveStudentMembership.mockResolvedValue({ id: 'aluno-1', contractId: 'contract-1' });
      mockAlunoFindFirst.mockResolvedValue({ id: 'aluno-1', contractId: 'contract-1', user: { id: 'user-1' } });
    });




    it('A-401023: HTTP rejects non-performed transitions carrying executed evidence', async () => {
      const { WorkoutSessionExecutionInputError } =
        require('../src/modules/workout/workout-session-execution.service');
      mockTransitionExecution.mockRejectedValueOnce(
        new WorkoutSessionExecutionInputError('Sessão não realizada não aceita valores ou unidades executadas.')
      );
      const response = await request(app)
        .post('/student/me/training-sessions/day-1/execution/transition')
        .set('x-contract-id', 'contract-1')
        .send({ operationKey: '40123-invalid-http', expectedVersion: 0,
          targetStatus: 'not_performed', reason: 'Cancelamento',
          items: [{ plannedUnitId: 'exercise-a', setNumber: 1,
            outcome: 'full', repetitions: 10 }] });
      expect(response.status).toBe(400);
      expect(response.body.data?.items).toBeUndefined();
      expect(mockTransitionExecution).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: 'day-1', alunoId: 'aluno-1', contractId: 'contract-1',
      }));
    });


    it.each([
      ['série estruturada', { items: [{ plannedUnitId: 'exercise-a', plannedSetId: 'set-a',
        outcome: 'not_performed', repetitions: 12, loadKg: 40 }] }],
      ['série legada', { items: [{ plannedUnitId: 'exercise-a', setNumber: 1,
        outcome: 'not_performed', repetitions: 0 }] }],
      ['etapa repetida', { sessionValues: { cyclicStages: [{
        plannedStageId: 'stage-a', iteration: 2, outcome: 'not_performed', durationSec: 90 }] } }],
      ['agrupamento', { sessionValues: { resistanceGroups: [{
        plannedGroupId: 'group-a', outcome: 'not_performed', roundsCompleted: 2 }] } }],
    ])('A-401-025: HTTP maps negative %s metrics to typed 400 without leaking persistence data', async (_label, values) => {
      const { WorkoutSessionExecutionInputError } =
        require('../src/modules/workout/workout-session-execution.service');
      mockSaveExecutionValues.mockRejectedValueOnce(
        new WorkoutSessionExecutionInputError('Unidade não realizada não pode conter valores executados.')
      );
      const payload = { operationKey: '40125-http-negative-unit', expectedVersion: 1, ...values };
      const response = await request(app)
        .put('/student/me/training-sessions/day-1/execution/values')
        .set('x-contract-id', 'contract-1').send(payload);
      expect(response.status).toBe(400);
      expect(response.body.data?.items).toBeUndefined();
      expect(mockSaveExecutionValues).toHaveBeenCalledWith({
        sessionId: 'day-1', alunoId: 'aluno-1', contractId: 'contract-1',
        actorUserId: 'user-1', payload,
      });
    });

    it('A-021: GET, transition and save return student-safe data at the HTTP boundary', async () => {
      const recorded = {
        sessionId: 'day-1', status: 'in_progress', version: 2,
        sessionValues: { speedKmh: 0 },
        items: [{ plannedUnitId: 'exercise-a', plannedSetId: 'set-1', setNumber: 1,
          rir: 2, rpe: 7, tempo: '2-0-2', restSec: 45,
          repetitions: 8, loadKg: 20 }],
      };
      mockGetSessionExecution.mockResolvedValue(recorded);
      mockTransitionExecution.mockResolvedValue(recorded);
      mockSaveExecutionValues.mockResolvedValue(recorded);
      const url = '/student/me/training-sessions/day-1/execution';
      const read = await request(app).get(url).set('x-contract-id', 'contract-1');
      const transition = await request(app).post(url + '/transition')
        .set('x-contract-id', 'contract-1')
        .send({ operationKey: 'issue401-redact-transition', expectedVersion: 2,
          targetStatus: 'paused' });
      const save = await request(app).put(url + '/values')
        .set('x-contract-id', 'contract-1')
        .send({ operationKey: 'issue401-redact-values', expectedVersion: 2,
          items: [{ plannedUnitId: 'exercise-a', plannedSetId: 'set-1', setNumber: 1,
            rir: 2, rpe: 7, tempo: '2-0-2', repetitions: 8, loadKg: 20 }] });

      for (const response of [read, transition, save]) {
        expect(response.status).toBe(200);
        const item = response.body.data.items[0];
        expect(item).not.toHaveProperty('rir');
        expect(item).not.toHaveProperty('rpe');
        expect(item).not.toHaveProperty('tempo');
        expect(item).toMatchObject({ loadKg: 20, repetitions: 8, restSec: 45 });
        expect(response.body.data.sessionValues.speedKmh).toBe(0);
        expect(JSON.stringify(response.body)).not.toContain('2-0-2');
      }
      expect(mockGetSessionExecution).toHaveBeenCalledWith({
        sessionId: 'day-1', alunoId: 'aluno-1', contractId: 'contract-1',
      });
      expect(mockTransitionExecution).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: 'day-1', alunoId: 'aluno-1', contractId: 'contract-1',
        actorUserId: 'user-1',
      }));
      expect(recorded.items[0]).toMatchObject({ rir: 2, rpe: 7, tempo: '2-0-2' });
    });

    it('A-401-18/19: forwards partial substitution notes and two distinct planned-set IDs without ordinals', async () => {
      const payload = { operationKey: 'issue401-patch-ids-http', expectedVersion: 2,
        items: [
          { plannedUnitId: 'exercise-a', plannedSetId: 'planned-set-1',
            outcome: 'substituted', loadKg: 25 },
          { plannedUnitId: 'exercise-a', plannedSetId: 'planned-set-2',
            substitutionNote: 'Alternativa registrada' },
        ],
      };
      const response = await request(app)
        .put('/student/me/training-sessions/day-1/execution/values')
        .set('x-contract-id', 'contract-1').send(payload);
      expect(response.status).toBe(200);
      expect(mockSaveExecutionValues).toHaveBeenCalledWith({
        sessionId: 'day-1', alunoId: 'aluno-1', contractId: 'contract-1',
        actorUserId: 'user-1', payload,
      });
      mockSaveExecutionValues.mockClear();
      const spoof = await request(app)
        .put('/student/me/training-sessions/day-1/execution/values')
        .set('x-contract-id', 'contract-1').send({ ...payload, actorUserId: 'attacker' });
      expect(spoof.status).toBe(400);
      expect(mockSaveExecutionValues).not.toHaveBeenCalled();
    });

    it('accepts an explicit legacy session speed and forwards only the scoped validated payload', async () => {
      const payload = { operationKey: 'issue401-speed-route', expectedVersion: 1,
        sessionValues: { speedKmh: 9, pace: '5:30' } };
      const response = await request(app)
        .put('/student/me/training-sessions/day-1/execution/values')
        .set('x-contract-id', 'contract-1').send(payload);
      expect(response.status).toBe(200);
      expect(mockSaveExecutionValues).toHaveBeenCalledWith({
        sessionId: 'day-1', alunoId: 'aluno-1', contractId: 'contract-1',
        actorUserId: 'user-1', payload,
      });
      expect(mockResolveActiveStudentMembership).toHaveBeenCalledWith('user-1', 'contract-1');
    });

    it('accepts a measured zero and a deliberate null without synthesizing either', async () => {
      for (const speedKmh of [0, null]) {
        mockSaveExecutionValues.mockClear();
        const payload = { operationKey: 'issue401-speed-zero-or-null', expectedVersion: 1,
          sessionValues: { speedKmh } };
        const response = await request(app)
          .put('/student/me/training-sessions/day-1/execution/values')
          .set('x-contract-id', 'contract-1').send(payload);
        expect(response.status).toBe(200);
        expect(mockSaveExecutionValues).toHaveBeenCalledWith(expect.objectContaining({ payload }));
      }
    });

    it('passes explicit patch removals without accepting forged fields on the HTTP boundary', async () => {
      const payload = { operationKey: 'issue401-patch-remove-http', expectedVersion: 2,
        sessionValues: { cyclicStages: [{ plannedStageId: 'stage-2', outcome: 'partial', speedKmh: 0 }],
          removeCyclicStages: [{ plannedStageId: 'stage-1', iteration: 1 }],
          removeResistanceGroups: ['group-1'] },
      };
      const response = await request(app).put('/student/me/training-sessions/day-1/execution/values')
        .set('x-contract-id', 'contract-1').send(payload);
      expect(response.status).toBe(200);
      expect(mockSaveExecutionValues).toHaveBeenCalledWith({
        sessionId: 'day-1', alunoId: 'aluno-1', contractId: 'contract-1',
        actorUserId: 'user-1', payload,
      });
    });

    it.each([
      { removeCyclicStages: [{ plannedStageId: 'stage-1', iteration: 0 }] },
      { removeCyclicStages: [{ plannedStageId: 'stage-1', wrong: true }] },
      { removeResistanceGroups: [null] },
      { removeResistanceGroups: [123] },
      { removeCyclicStages: 'stage-1' },
    ])('rejects malformed patch deletion intent before persistence: %p', async (sessionValues) => {
      mockSaveExecutionValues.mockClear();
      const response = await request(app).put('/student/me/training-sessions/day-1/execution/values')
        .set('x-contract-id', 'contract-1')
        .send({ operationKey: 'issue401-delete-bad', expectedVersion: 2, sessionValues });
      expect(response.status).toBe(400);
      expect(mockSaveExecutionValues).not.toHaveBeenCalled();
    });

    it.each([-0.5, '9', { kmh: 9 }])('rejects invalid speed %p with no service write', async (speedKmh) => {
      const response = await request(app)
        .put('/student/me/training-sessions/day-1/execution/values')
        .set('x-contract-id', 'contract-1')
        .send({ operationKey: 'issue401-speed-bad-route', expectedVersion: 1,
          sessionValues: { speedKmh } });
      expect(response.status).toBe(400);
      expect(mockSaveExecutionValues).not.toHaveBeenCalled();
    });
  });

  describe('pre-workout check-in student boundary (#388)', () => {
    beforeEach(() => {
      mockUser = { userId: 'user-1', type: 'aluno' };
      mockResolveActiveStudentMembership.mockResolvedValue({ id: 'aluno-1', contractId: 'contract-1' });
      mockAlunoFindFirst.mockResolvedValue({ id: 'aluno-1', contractId: 'contract-1', user: { id: 'user-1' } });
    });

    it('deriva aluno, contrato e ator da sessão e não aceita tenant/aluno do body', async () => {
      const response = await request(app)
        .put('/student/me/training-sessions/day-1/check-in')
        .set('x-contract-id', 'contract-1')
        .send({
          operationKey: 'operation-123',
          psr: 8,
          alunoId: 'aluno-outro',
          contractId: 'contract-outro',
        });

      expect(response.status).toBe(400);
      expect(mockSaveCheckIn).not.toHaveBeenCalled();

      const valid = await request(app)
        .put('/student/me/training-sessions/day-1/check-in')
        .set('x-contract-id', 'contract-1')
        .send({ operationKey: 'operation-123', psr: 8 });

      expect(valid.status).toBe(200);
      expect(mockSaveCheckIn).toHaveBeenCalledWith({
        sessionId: 'day-1',
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        actorUserId: 'user-1',
        payload: { operationKey: 'operation-123', psr: 8 },
      });
    });

    it('não grava se o vínculo contratual não puder ser resolvido', async () => {
      mockResolveActiveStudentMembership.mockRejectedValue(
        new StudentAccountContextError('Selecione o contrato', 'STUDENT_CONTRACT_CONTEXT_REQUIRED')
      );
      const response = await request(app)
        .put('/student/me/training-sessions/day-1/check-in')
        .send({ operationKey: 'operation-123', fatigue: 3 });

      expect(response.status).toBe(409);
      expect(mockSaveCheckIn).not.toHaveBeenCalled();
    });
  });

  describe('GET /alunos/:id/training-routine', () => {
    beforeEach(() => {
      mockUser = {
        userId: 'user-9',
        type: 'professor',
        professorId: 'professor-1',
        professorRole: 'professor',
        collaboratorFunctionId: 'function-1',
        contractId: 'contract-1',
      };
    });

    it('exige o bloco de treinos da Central e usa o contrato do token', async () => {
      const response = await request(app).get('/alunos/aluno-1/training-routine?date=2026-10-01');

      expect(response.status).toBe(200);
      expect(mockBlockAccessMiddleware).toHaveBeenCalledWith('students.details.trainingPlans');
      expect(alunoService.belongsToProfessor).toHaveBeenCalledWith('aluno-1', 'professor-1');
      expect(alunoService.belongsToContract).toHaveBeenCalledWith('aluno-1', 'contract-1');
      expect(mockAccessPermissionFindFirst).toHaveBeenCalledWith({
        where: {
          collaboratorFunctionId: 'function-1',
          screenKey: 'students.details',
          blockKey: 'students.details.preWorkoutCheckIn',
          canView: true,
        },
        select: { id: true },
      });
      expect(mockGetRoutine).toHaveBeenCalledWith({
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        audience: 'professor',
        date: '2026-10-01',
        includePreWorkoutCheckIn: false,
        includePostWorkoutFeedback: false,
      });
    });

    it('inclui o check-in sensível somente com concessão explícita', async () => {
      mockAccessPermissionFindFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where.blockKey === 'students.details.preWorkoutCheckIn' ? { id: 'permission-checkin' } : null)
      );

      const response = await request(app).get('/alunos/aluno-1/training-routine');

      expect(response.status).toBe(200);
      expect(mockGetRoutine).toHaveBeenCalledWith({
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        audience: 'professor',
        date: undefined,
        includePreWorkoutCheckIn: true,
        includePostWorkoutFeedback: false,
      });
    });

    it('mantém o boundary explícito disponível para as rotas sensíveis de feedback', async () => {
      expect(mockExplicitBlockAccessMiddleware).toHaveBeenCalledWith('students.details.postWorkoutFeedback');
    });

    it('projeta feedback pós-treino somente com concessão sensível própria', async () => {
      mockAccessPermissionFindFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where.blockKey === 'students.details.postWorkoutFeedback' ? { id: 'permission-feedback' } : null)
      );

      const response = await request(app).get('/alunos/aluno-1/training-routine');

      expect(response.status).toBe(200);
      expect(mockAccessPermissionFindFirst).toHaveBeenCalledWith({
        where: {
          collaboratorFunctionId: 'function-1',
          screenKey: 'students.details',
          blockKey: 'students.details.postWorkoutFeedback',
          canView: true,
        },
        select: { id: true },
      });
      expect(mockGetRoutine).toHaveBeenCalledWith({
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        audience: 'professor',
        date: undefined,
        includePreWorkoutCheckIn: false,
        includePostWorkoutFeedback: true,
      });
    });

    it('responde como inexistente para aluno fora do escopo do professor', async () => {
      (alunoService.belongsToProfessor as jest.Mock).mockResolvedValue(false);
      const response = await request(app).get('/alunos/aluno-2/training-routine');
      expect(response.status).toBe(404);
      expect(mockGetRoutine).not.toHaveBeenCalled();
    });

    it('responde como inexistente para aluno de outro contrato', async () => {
      (alunoService.belongsToContract as jest.Mock).mockResolvedValue(false);
      const response = await request(app).get('/alunos/aluno-x/training-routine');
      expect(response.status).toBe(404);
      expect(mockGetRoutine).not.toHaveBeenCalled();
    });

    it('não oferece endpoint de mutação de execução nesta fronteira', async () => {
      for (const method of ['post', 'put', 'patch', 'delete'] as const) {
        const response = await request(app)[method]('/alunos/aluno-1/training-routine');
        expect(response.status).toBe(404);
      }
      const studentWrite = await request(app).post('/student/me/training-routine');
      expect(studentWrite.status).toBe(404);
      expect(mockGetRoutine).not.toHaveBeenCalled();
    });
  });
});
