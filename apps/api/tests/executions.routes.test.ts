import express from 'express';

const request = require('supertest');

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as any).user = {
      userId: 'student-user',
      professorId: 'professor-1',
    };
    next();
  },
  professorMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  alunoMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../src/modules/alunos/student-account-context.service', () => ({
  normalizeRequestedStudentContractId: jest.fn(() => undefined),
  resolveActiveStudentMembership: jest.fn(async () => ({ id: 'student-1' })),
}));

jest.mock('../src/modules/alunos/aluno.service', () => ({
  alunoService: {
    belongsToProfessor: jest.fn(async () => true),
  },
}));

jest.mock('../src/modules/workout/workout.service', () => ({
  workoutService: {
    getWorkoutDay: jest.fn(),
    getWorkoutDayByDate: jest.fn(),
    getWorkoutDaysByRange: jest.fn(),
    updateWorkoutDayStatus: jest.fn(),
    recordExecution: jest.fn(),
    getExecutionsByAluno: jest.fn(),
  },
}));

const { workoutService } = require('../src/modules/workout/workout.service');
const router = require('../src/routes/executions.routes').default;

describe('legacy execution route error boundary', () => {
  const app = express();
  app.use(express.json());
  app.use('/executions', router);

  beforeEach(() => jest.clearAllMocks());

  it('redacts internal errors from the student workout-day endpoint', async () => {
    const secret = 'Prisma SQL secret password=must-not-leak';
    workoutService.getWorkoutDay.mockRejectedValueOnce(new Error(secret));

    const response = await request(app).get('/executions/workout-day/day-1');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: 'EXECUTION_OPERATION_FAILED',
      error: 'Não foi possível consultar o treino.',
    });
    expect(JSON.stringify(response.body)).not.toContain(secret);
  });

  it('redacts internal errors from the professor read endpoint too', async () => {
    const secret = 'database relation=private_training_data';
    workoutService.getWorkoutDay.mockRejectedValueOnce(new Error(secret));

    const response = await request(app).get('/executions/professor/workout-day/day-1');

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('EXECUTION_OPERATION_FAILED');
    expect(JSON.stringify(response.body)).not.toContain(secret);
  });
});
