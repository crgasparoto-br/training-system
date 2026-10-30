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

  it.each([
    { audience: 'aluno', url: '/executions/workout-days?startDate=2026-10-06&endDate=2026-10-06', releasedOnly: true },
    { audience: 'professor', url: '/executions/professor/workout-days?alunoId=student-1&startDate=2026-10-06&endDate=2026-10-06', releasedOnly: false },
  ])('AUD-400-05: rota de $audience mantém o contrato de consulta por período', async ({ url, releasedOnly }) => {
    const historical = [{
      id: 'day-1',
      template: { released: true },
      resistanceGroups: [{ id: 'group-1', members: [{ workoutExerciseId: 'exercise-1' }] }],
      exercises: [{ id: 'exercise-1', exercise: { name: 'Nome prescrito na liberação' } }],
    }];
    workoutService.getWorkoutDaysByRange.mockResolvedValueOnce(historical);

    const response = await request(app).get(url);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(historical);
    expect(workoutService.getWorkoutDaysByRange).toHaveBeenCalledWith(
      'student-1', '2026-10-06', '2026-10-06', { releasedOnly },
    );
  });

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
