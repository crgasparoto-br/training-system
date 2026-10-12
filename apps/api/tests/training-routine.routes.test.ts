import express from 'express';

const request = require('supertest');

const mockAlunoFindFirst = jest.fn();
const mockAccessPermissionFindFirst = jest.fn();
const mockGetRoutine = jest.fn();
const mockGetCheckIn = jest.fn();
const mockSaveCheckIn = jest.fn();
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
    mockAlunoFindFirst.mockReset();
    mockAccessPermissionFindFirst.mockReset().mockResolvedValue(null);
    mockResolveActiveStudentMembership.mockReset();
    (alunoService.belongsToContract as jest.Mock).mockReset().mockResolvedValue(true);
    (alunoService.belongsToProfessor as jest.Mock).mockReset().mockResolvedValue(true);
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
