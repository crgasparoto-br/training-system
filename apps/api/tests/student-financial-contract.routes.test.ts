import express from 'express';

const request = require('supertest');
const mockAssertAlunoAccess = jest.fn();
const mockAssertRequestedProfessorAccess = jest.fn();

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: 'user-1',
      email: 'professor@example.com',
      type: 'professor',
      professorId: 'professor-1',
      professorRole: req.get('x-test-professor') === 'true' ? 'professor' : 'master',
      contractId: 'company-1',
    };
    next();
  },
  professorMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../src/modules/access-control/access-control.middleware', () => ({
  blockAccessMiddleware: jest.fn(
    (blockKey: string) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (
        blockKey === 'students.actions.manageFinancialContract' &&
        req.get('x-test-deny-financial-contract') === 'true'
      ) {
        return res.status(403).json({
          success: false,
          error: 'Perfil sem permissão para acessar este recurso',
        });
      }
      return next();
    }
  ),
}));

jest.mock('../src/modules/alunos/student-access-scope.service', () => ({
  studentAccessScopeService: {
    assertAlunoAccess: mockAssertAlunoAccess,
    assertRequestedProfessorAccess: mockAssertRequestedProfessorAccess,
  },
}));

jest.mock('../src/modules/alunos/student-financial-contract.service', () => ({
  studentFinancialContractService: {
    createAlunoWithContract: jest.fn(),
    updateAlunoWithContract: jest.fn(),
  },
}));

jest.mock('../src/modules/alunos/student-identity.service', () => ({
  StudentIdentityLockTimeoutError: class StudentIdentityLockTimeoutError extends Error {
    constructor(public readonly contractId: string) {
      super('Muitas operações simultâneas para este contrato. Tente novamente em instantes.');
      this.name = 'StudentIdentityLockTimeoutError';
    }
  },
}));

const router = require('../src/modules/alunos/student-financial-contract.routes').default;
const { studentFinancialContractService } = require('../src/modules/alunos/student-financial-contract.service');
const { StudentIdentityLockTimeoutError } = require('../src/modules/alunos/student-identity.service');

const validCreatePayload = {
  profile: {
    name: 'Aluno Teste',
    email: 'aluno@example.com',
    serviceId: 'interest-service',
    schedulePlan: 'free',
    age: 30,
  },
  contract: {
    contractId: 'contract-1',
    serviceId: 'interest-service',
    startDate: '2026-07-01',
    endDate: '2027-07-01',
  },
};

describe('student financial contract routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/alunos', router);

  beforeEach(() => {
    jest.clearAllMocks();
    mockAssertAlunoAccess.mockResolvedValue({ id: 'student-1' });
    mockAssertRequestedProfessorAccess.mockImplementation(() => undefined);
  });

  it('requires the financial contract block before reaching the atomic service', async () => {
    const response = await request(app)
      .post('/alunos/financial-contract')
      .set('x-test-deny-financial-contract', 'true')
      .send({
        profile: {
          name: 'Aluno Teste',
          email: 'aluno@example.com',
          schedulePlan: 'free',
          age: 30,
        },
        contract: { contractId: 'contract-1' },
      });

    expect(response.status).toBe(403);
    expect(studentFinancialContractService.createAlunoWithContract).not.toHaveBeenCalled();
  });

  it('creates profile and contract through one service operation with civil dates', async () => {
    studentFinancialContractService.createAlunoWithContract.mockResolvedValue({
      aluno: { id: 'student-1' },
      tempPassword: 'temporary',
      studentContract: { id: 'link-1' },
    });

    const response = await request(app).post('/alunos/financial-contract').send(validCreatePayload);

    expect(response.status).toBe(201);
    expect(studentFinancialContractService.createAlunoWithContract).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'aluno@example.com' }),
      expect.objectContaining({
        contractId: 'contract-1',
        startDate: new Date('2026-07-01T12:00:00.000Z'),
        endDate: new Date('2027-07-01T12:00:00.000Z'),
      }),
      { professorId: 'professor-1', companyContractId: 'company-1' }
    );
  });

  it('classifies an invalid interest service as a business error on atomic creation', async () => {
    studentFinancialContractService.createAlunoWithContract.mockRejectedValue(
      new Error('Serviço selecionado não pertence ao contrato')
    );

    const response = await request(app).post('/alunos/financial-contract').send(validCreatePayload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Serviço selecionado não pertence ao contrato');
  });

  it('maps a concurrent email constraint to a static 409 without leaking database details', async () => {
    studentFinancialContractService.createAlunoWithContract.mockRejectedValue({
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: { target: ['email'] },
      message: 'Unique constraint fingerprint=private-email-race',
    });

    const response = await request(app).post('/alunos/financial-contract').send(validCreatePayload);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Email já está registrado');
    expect(JSON.stringify(response.body)).not.toContain('P2002');
    expect(JSON.stringify(response.body)).not.toContain('fingerprint');
    expect(JSON.stringify(response.body)).not.toContain('Unique constraint');
  });

  it('maps identity lock contention to the controlled 409 domain response', async () => {
    studentFinancialContractService.createAlunoWithContract.mockRejectedValue(
      new StudentIdentityLockTimeoutError('company-1')
    );

    const response = await request(app).post('/alunos/financial-contract').send(validCreatePayload);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe(
      'Muitas operações simultâneas para este contrato. Tente novamente em instantes.'
    );
    expect(JSON.stringify(response.body)).not.toContain('company-1');
  });

  it('keeps P2028 as a safe correlatable 5xx on atomic creation', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    studentFinancialContractService.createAlunoWithContract.mockRejectedValue({
      name: 'PrismaClientKnownRequestError',
      code: 'P2028',
      message: 'Transaction API error fingerprint=private idempotencyKey=secret amount=999.99',
      stack: 'private stack',
    });

    const response = await request(app).post('/alunos/financial-contract').send(validCreatePayload);

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Erro ao criar aluno');
    expect(response.body.details).toMatchObject({ code: 'ALUNO_CREATE_INTERNAL_ERROR' });
    expect(typeof response.body.details.correlationId).toBe('string');
    expect(JSON.stringify(response.body)).not.toContain('P2028');
    expect(JSON.stringify(response.body)).not.toContain('Transaction API error');
    expect(JSON.stringify(response.body)).not.toContain('fingerprint');
    expect(JSON.stringify(response.body)).not.toContain('idempotencyKey');
    expect(JSON.stringify(response.body)).not.toContain('999.99');
    expect(consoleError).toHaveBeenCalledWith(
      'Erro na operação atômica de criação de aluno e contrato:',
      expect.objectContaining({
        correlationId: response.body.details.correlationId,
        stage: 'aluno.financial-contract.create',
        errorCode: 'P2028',
      })
    );

    consoleError.mockRestore();
  });

  it('PB-ERR-001 hides raw persistence markers and returns correlationId', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    studentFinancialContractService.createAlunoWithContract.mockRejectedValue({
      name: 'DatabaseError',
      code: 'P0001',
      message: 'fingerprint=pb-secret idempotencyKey=pb-key amount=1234.56',
      stack: 'private sql stack',
    });

    const response = await request(app).post('/alunos/financial-contract').send(validCreatePayload);
    const serialized = JSON.stringify(response.body);

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Erro ao criar aluno');
    expect(response.body.details).toMatchObject({ code: 'ALUNO_CREATE_INTERNAL_ERROR' });
    expect(typeof response.body.details.correlationId).toBe('string');
    expect(serialized).not.toContain('P0001');
    expect(serialized).not.toContain('fingerprint');
    expect(serialized).not.toContain('idempotencyKey');
    expect(serialized).not.toContain('1234.56');
    expect(serialized).not.toContain('private sql stack');

    consoleError.mockRestore();
  });

  it('updates profile and contract through one scoped service operation', async () => {
    studentFinancialContractService.updateAlunoWithContract.mockResolvedValue({
      aluno: { id: 'student-1' },
      studentContract: { id: 'link-1' },
    });

    const response = await request(app)
      .put('/alunos/student-1/financial-contract')
      .set('x-test-professor', 'true')
      .send({
        profile: { age: 31 },
        contract: { contractId: 'contract-1', endDate: null },
      });

    expect(response.status).toBe(200);
    expect(mockAssertAlunoAccess).toHaveBeenCalledWith(
      'student-1',
      expect.objectContaining({
        professorId: 'professor-1',
        professorRole: 'professor',
        companyContractId: 'company-1',
      })
    );
    expect(studentFinancialContractService.updateAlunoWithContract).toHaveBeenCalledWith(
      'student-1',
      { age: 31 },
      expect.objectContaining({ contractId: 'contract-1', endDate: null }),
      { professorId: 'professor-1', companyContractId: 'company-1' }
    );
  });

  it('blocks an atomic update for an aluno outside the professor scope', async () => {
    mockAssertAlunoAccess.mockRejectedValue(
      new Error('Aluno fora do escopo do professor autenticado')
    );

    const response = await request(app)
      .put('/alunos/student-other/financial-contract')
      .set('x-test-professor', 'true')
      .send({
        profile: { age: 31 },
        contract: { contractId: 'contract-1' },
      });

    expect(response.status).toBe(404);
    expect(studentFinancialContractService.updateAlunoWithContract).not.toHaveBeenCalled();
  });

  it('blocks assigning another professor through the atomic update', async () => {
    mockAssertRequestedProfessorAccess.mockImplementation(() => {
      throw new Error('Professor responsável fora do escopo do professor autenticado');
    });

    const response = await request(app)
      .put('/alunos/student-1/financial-contract')
      .set('x-test-professor', 'true')
      .send({
        profile: { professorId: 'professor-2' },
        contract: { contractId: 'contract-1' },
      });

    expect(response.status).toBe(404);
    expect(studentFinancialContractService.updateAlunoWithContract).not.toHaveBeenCalled();
  });

  it('rejects an invalid civil date before invoking the transactional service', async () => {
    const response = await request(app).put('/alunos/student-1/financial-contract').send({
      profile: { age: 31 },
      contract: { contractId: 'contract-1', endDate: '2026-02-31' },
    });

    expect(response.status).toBe(400);
    expect(studentFinancialContractService.updateAlunoWithContract).not.toHaveBeenCalled();
  });
});
