import express from 'express';

const request = require('supertest');

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: 'user-1',
      email: 'professor@example.com',
      type: 'professor',
      professorId: 'professor-1',
      professorRole: 'master',
      contractId: 'company-1',
    };
    next();
  },
  professorMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../src/modules/access-control/access-control.middleware', () => ({
  blockAccessMiddleware: jest.fn(
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
  ),
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

  beforeEach(() => jest.clearAllMocks());

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

  it('updates profile and contract through one service operation', async () => {
    studentFinancialContractService.updateAlunoWithContract.mockResolvedValue({
      aluno: { id: 'student-1' },
      studentContract: { id: 'link-1' },
    });

    const response = await request(app).put('/alunos/student-1/financial-contract').send({
      profile: { age: 31 },
      contract: { contractId: 'contract-1', endDate: null },
    });

    expect(response.status).toBe(200);
    expect(studentFinancialContractService.updateAlunoWithContract).toHaveBeenCalledWith(
      'student-1',
      { age: 31 },
      expect.objectContaining({ contractId: 'contract-1', endDate: null }),
      { professorId: 'professor-1', companyContractId: 'company-1' }
    );
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
