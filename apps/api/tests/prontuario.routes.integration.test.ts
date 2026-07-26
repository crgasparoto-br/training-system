import express from 'express';
import prontuarioRouter from '../src/modules/prontuario/prontuario.routes';
import { prontuarioService } from '../src/modules/prontuario/prontuario.service';

const request = require('supertest');

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
  screenAccessMiddleware: () => (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
  blockAccessMiddleware: () => (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

jest.mock('../src/modules/pre-registration-public/pre-registration-parq.service', () => {
  class ParqServiceError extends Error {
    constructor(
      message: string,
      readonly code: string
    ) {
      super(message);
      this.name = 'ParqServiceError';
    }
  }

  return {
    ParqServiceError,
    preRegistrationParqService: {
      reviewProfessional: jest.fn(),
    },
  };
});

jest.mock('../src/modules/prontuario/prontuario.service', () => ({
  prontuarioService: {
    overview: jest.fn(),
  },
}));

describe('prontuario routes integration', () => {
  const app = express();

  app.use(express.json());
  app.use('/api/v1/prontuario', prontuarioRouter);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mounts overview at /api/v1/prontuario/alunos/:alunoId', async () => {
    (prontuarioService.overview as jest.Mock).mockResolvedValue({
      aluno: { id: 'aluno-1' },
      records: [],
      currentRecord: null,
      parqSubmissions: [],
      latestParqSubmission: null,
    });

    const response = await request(app).get('/api/v1/prontuario/alunos/aluno-1');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      aluno: { id: 'aluno-1' },
      records: [],
      currentRecord: null,
      parqSubmissions: [],
      latestParqSubmission: null,
    });
    expect(prontuarioService.overview).toHaveBeenCalledWith('contract-1', 'aluno-1');
  });
});
