import express from 'express';

const request = require('supertest');

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: 'user-1',
      email: 'master@example.com',
      type: 'professor',
      professorId: 'professor-1',
      professorRole: 'master',
      contractId: 'contract-1',
    };
    next();
  },
  professorMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../src/modules/access-control/access-control.middleware', () => ({
  blockAccessMiddleware:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../src/modules/student-contracts/student-contract-lifecycle.service', () => ({
  studentContractLifecycleService: {
    prepareOrActivateStudentContract: jest.fn(),
  },
}));

const lifecycleRouter = require('../src/modules/student-contracts/student-contract-lifecycle.routes').default;

describe('student contract lifecycle route guard', () => {
  const app = express();
  app.use(express.json());
  app.use('/alunos', lifecycleRouter);
  app.patch('/alunos/:id/contracts/:studentContractId', (_req, res) => {
    res.status(200).json({ success: true });
  });

  it('blocks direct status transitions before the legacy update route', async () => {
    const response = await request(app)
      .patch('/alunos/aluno-1/contracts/link-1')
      .send({ status: 'terminated' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      'O status do vínculo contratual deve ser alterado pelo fluxo de vigência'
    );
  });

  it('allows administrative edits to continue to the legacy update route', async () => {
    const response = await request(app)
      .patch('/alunos/aluno-1/contracts/link-1')
      .send({ amount: 350, paymentDay: 10 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
  });
});
