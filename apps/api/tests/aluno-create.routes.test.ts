import express from 'express';

const request = require('supertest');

const mockAlunoService = {
  create: jest.fn(),
};

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as any).user = {
      userId: 'user-master',
      email: 'master@example.com',
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

jest.mock('../src/modules/alunos/aluno.service', () => ({
  alunoService: mockAlunoService,
}));

jest.mock('../src/modules/agenda/fixed-schedule.service', () => ({
  FixedScheduleError: class FixedScheduleError extends Error {
    statusCode = 400;
    code = 'FIXED_SCHEDULE_INVALID';
    stage = 'validation';
    rowIndex = undefined;
    reasonCode = undefined;
  },
}));

jest.mock('../src/modules/alunos/student-identity.service', () => ({
  StudentIdentityLockTimeoutError: class StudentIdentityLockTimeoutError extends Error {
    constructor() {
      super('Muitas operações simultâneas para este contrato. Tente novamente em instantes.');
      this.name = 'StudentIdentityLockTimeoutError';
    }
  },
}));

const alunoCreateRouter = require('../src/modules/alunos/aluno-create.routes').default;
const { StudentIdentityLockTimeoutError } = require('../src/modules/alunos/student-identity.service');

const validPayload = {
  name: 'Aluno Novo',
  email: 'novo@example.com',
  serviceId: 'service-1',
  schedulePlan: 'free',
  age: 30,
};

describe('POST /alunos creation error boundary', () => {
  const app = express();
  app.use(express.json());
  app.use('/alunos', alunoCreateRouter);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mantém o caminho feliz da criação administrativa', async () => {
    mockAlunoService.create.mockResolvedValue({
      aluno: { id: 'aluno-1' },
      tempPassword: 'temp-1234',
    });

    const response = await request(app).post('/alunos').send(validPayload);

    expect(response.status).toBe(201);
    expect(mockAlunoService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ...validPayload,
        professorId: 'professor-1',
      })
    );
  });

  it('classifica serviço inválido como erro de negócio 4xx', async () => {
    mockAlunoService.create.mockRejectedValue(
      new Error('Serviço selecionado não pertence ao contrato')
    );

    const response = await request(app).post('/alunos').send(validPayload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Serviço selecionado não pertence ao contrato');
  });

  it('classifica corrida da constraint de e-mail como conflito 409', async () => {
    mockAlunoService.create.mockRejectedValue({
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: { target: ['email'] },
      message: 'Unique constraint failed on the fields: (`email`)',
    });

    const response = await request(app).post('/alunos').send(validPayload);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Email já está registrado');
    expect(JSON.stringify(response.body)).not.toContain('Unique constraint');
  });

  it('classifica indisponibilidade concorrente da identidade sem expor detalhes internos', async () => {
    mockAlunoService.create.mockRejectedValue(new StudentIdentityLockTimeoutError());

    const response = await request(app).post('/alunos').send(validPayload);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe(
      'Muitas operações simultâneas para este contrato. Tente novamente em instantes.'
    );
  });

  it('mantém P2028 como 5xx seguro e correlacionável', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockAlunoService.create.mockRejectedValue({
      name: 'PrismaClientKnownRequestError',
      code: 'P2028',
      message: 'Transaction API error: Transaction not found',
      stack: 'private stack',
    });

    const response = await request(app).post('/alunos').send(validPayload);

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Erro ao criar aluno');
    expect(response.body.details).toMatchObject({
      code: 'ALUNO_CREATE_INTERNAL_ERROR',
    });
    expect(typeof response.body.details.correlationId).toBe('string');
    expect(JSON.stringify(response.body)).not.toContain('P2028');
    expect(JSON.stringify(response.body)).not.toContain('Transaction not found');
    expect(consoleError).toHaveBeenCalledWith(
      'Erro ao criar aluno:',
      expect.objectContaining({
        correlationId: response.body.details.correlationId,
        stage: 'aluno.create',
        errorCode: 'P2028',
      })
    );

    consoleError.mockRestore();
  });
});
