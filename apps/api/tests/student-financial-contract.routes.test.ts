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

const router = require('../src/modules/alunos/student-financial-contract.routes').default;
const { studentFinancialContractService } = require('../src/modules/alunos/student-financial-contract.service');

describe('student financial contract routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/alunos', router);

  beforeEach(() => {
    jest.clearAllMocks();
    mockAssertAlunoAccess.mockResolvedValue({ id: 'student-1' });
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

    const response = await request(app).post('/alunos/financial-contract').send({
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
    });

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