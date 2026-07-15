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

describe('student financial contract route authority', () => {
  const app = express();
  app.use(express.json());
  app.use('/alunos', router);

  beforeEach(() => jest.clearAllMocks());

  it('does not forward a client supplied contract serviceId during create', async () => {
    studentFinancialContractService.createAlunoWithContract.mockResolvedValue({
      aluno: { id: 'student-1' },
      tempPassword: 'temporary',
      studentContract: { id: 'link-1' },
    });

    const response = await request(app).post('/alunos/financial-contract').send({
      profile: {
        name: 'Aluno Teste',
        email: 'aluno@example.com',
        serviceId: 'persisted-interest-service',
        schedulePlan: 'free',
        age: 30,
      },
      contract: {
        contractId: 'contract-1',
        serviceId: 'untrusted-client-service',
        startDate: '2026-07-01',
      },
    });

    expect(response.status).toBe(201);
    expect(studentFinancialContractService.createAlunoWithContract).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 'persisted-interest-service' }),
      expect.not.objectContaining({ serviceId: expect.anything() }),
      { professorId: 'professor-1', companyContractId: 'company-1' }
    );
  });

  it('does not forward a client supplied contract serviceId during update', async () => {
    studentFinancialContractService.updateAlunoWithContract.mockResolvedValue({
      aluno: { id: 'student-1' },
      studentContract: { id: 'link-1' },
    });

    const response = await request(app).put('/alunos/student-1/financial-contract').send({
      profile: {
        serviceId: 'new-persisted-interest-service',
        age: 31,
      },
      contract: {
        contractId: 'contract-1',
        serviceId: 'untrusted-client-service',
      },
    });

    expect(response.status).toBe(200);
    expect(studentFinancialContractService.updateAlunoWithContract).toHaveBeenCalledWith(
      'student-1',
      expect.objectContaining({ serviceId: 'new-persisted-interest-service' }),
      expect.not.objectContaining({ serviceId: expect.anything() }),
      { professorId: 'professor-1', companyContractId: 'company-1' }
    );
  });
});
