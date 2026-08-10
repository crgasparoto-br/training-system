import express from 'express';

const request = require('supertest');

const mockBlockAccessMiddleware = jest.fn(
  () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
);

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: 'user-1',
      email: 'professor@example.com',
      type: 'professor',
      professorId: 'professor-1',
      professorRole: 'master',
      contractId: 'contract-1',
    };
    next();
  },
  professorMiddleware: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

jest.mock('../src/modules/access-control/access-control.middleware', () => ({
  blockAccessMiddleware: mockBlockAccessMiddleware,
}));

jest.mock('../src/modules/alunos/aluno.service', () => ({
  alunoService: {
    belongsToContract: jest.fn(),
    belongsToProfessor: jest.fn(),
    calculateBMI: jest.fn(() => 22),
    calculateHeartRateZones: jest.fn(() => ({ zone1: { min: 90, max: 108 } })),
  },
}));

jest.mock('../src/modules/alunos/student-parq-boundary.service', () => ({
  studentParqBoundaryService: {
    getAdministrativeAluno: jest.fn(),
  },
}));

const boundaryRouter = require('../src/modules/alunos/student-parq-boundary.routes').default;
const { alunoService } = require('../src/modules/alunos/aluno.service');
const { studentParqBoundaryService } = require('../src/modules/alunos/student-parq-boundary.service');

describe('student PAR-Q HTTP boundary', () => {
  const app = express();
  app.use(express.json());
  app.use('/alunos', boundaryRouter);
  app.post('/alunos', (_req, res) => res.status(204).end());
  app.put('/alunos/:id', (_req, res) => res.status(204).end());
  app.get('/alunos/search', (_req, res) => res.status(204).end());

  beforeEach(() => {
    (alunoService.belongsToContract as jest.Mock).mockReset();
    (alunoService.belongsToProfessor as jest.Mock).mockReset();
    (studentParqBoundaryService.getAdministrativeAluno as jest.Mock).mockReset();
    (alunoService.belongsToContract as jest.Mock).mockResolvedValue(true);
  });

  it('returns HTTP 410 for legacy PAR-Q writes through POST /alunos', async () => {
    const response = await request(app)
      .post('/alunos')
      .send({ intakeForm: { parqResponses: { q1: false } } });

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      success: false,
      details: { code: 'LEGACY_WRITE_DISABLED' },
    });
  });

  it('returns HTTP 410 for legacy PAR-Q writes through PUT /alunos/:id', async () => {
    const response = await request(app)
      .put('/alunos/aluno-1')
      .send({ intakeForm: { formResponses: { parqResponses: { q1: false } } } });

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      success: false,
      details: { code: 'LEGACY_WRITE_DISABLED' },
    });
  });

  it('allows unrelated aluno writes to continue to the legacy handler', async () => {
    const response = await request(app)
      .put('/alunos/aluno-1')
      .send({ intakeForm: { mainGoal: 'Corrida' } });

    expect(response.status).toBe(204);
  });

  it('does not shadow the existing static search route', async () => {
    const response = await request(app).get('/alunos/search');

    expect(response.status).toBe(204);
    expect(studentParqBoundaryService.getAdministrativeAluno).not.toHaveBeenCalled();
  });

  it('returns the sanitized generic aluno payload under the summary permission', async () => {
    (studentParqBoundaryService.getAdministrativeAluno as jest.Mock).mockResolvedValue({
      id: 'aluno-1',
      contractId: 'contract-1',
      weight: 70,
      height: 175,
      maxHeartRate: 180,
      restingHeartRate: 60,
      intakeForm: { mainGoal: 'Corrida' },
      parq: {
        state: 'COMPLETED_REVIEW_REQUIRED',
        latestSubmission: { positiveCount: 1 },
        requiresProfessionalReview: true,
        legacy: { preserved: false, needsRepeat: false },
      },
    });

    const response = await request(app).get('/alunos/aluno-1');

    expect(response.status).toBe(200);
    expect(response.body.data.intakeForm).toEqual({ mainGoal: 'Corrida' });
    expect(response.body.data.parq.state).toBe('COMPLETED_REVIEW_REQUIRED');
    expect(JSON.stringify(response.body.data)).not.toContain('parqResponses');
    expect(mockBlockAccessMiddleware).toHaveBeenCalledWith('students.details.summary');
  });
});
