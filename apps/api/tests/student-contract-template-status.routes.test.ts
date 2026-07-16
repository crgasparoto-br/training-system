import express from 'express';

const request = require('supertest');

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
  professorMiddleware: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

jest.mock('../src/modules/access-control/access-control.middleware', () => ({
  blockAccessMiddleware:
    () =>
    (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
}));

const router = require(
  '../src/modules/alunos/student-contract-template-status.routes'
).default;

describe('student contract template status route guard', () => {
  const app = express();
  app.use(express.json());
  app.use('/alunos', router);
  app.post('/alunos/:id/contracts', (_req, res) => res.status(204).end());

  it('rejects unsupported states for template references', async () => {
    const response = await request(app)
      .post('/alunos/student-1/contracts')
      .send({ contractId: 'template:template-1', status: 'pending_signature' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('rascunho ou ativo');
  });

  it('allows draft and active states to continue to the canonical route', async () => {
    const draft = await request(app)
      .post('/alunos/student-1/contracts')
      .send({ contractId: 'template:template-1', status: 'draft' });
    const active = await request(app)
      .post('/alunos/student-1/contracts')
      .send({ contractId: 'template:template-1', status: 'active' });

    expect(draft.status).toBe(204);
    expect(active.status).toBe(204);
  });

  it('does not affect linking an existing generated document', async () => {
    const response = await request(app)
      .post('/alunos/student-1/contracts')
      .send({ contractId: 'generated-contract-1', status: 'pending_signature' });

    expect(response.status).toBe(204);
  });
});