import express from 'express';
import request from 'supertest';
import { preRegistrationPublicEntryRoutes } from '../src/modules/pre-registration-public/index.js';

describe('public pre-registration route contracts', () => {
  const app = express();
  app.use('/api/v1', preRegistrationPublicEntryRoutes);

  it('reuses the shared account policy before creating an invited account', async () => {
    const response = await request(app)
      .post('/api/v1/pre-cadastro/contract-test-token/register')
      .send({
        name: 'A',
        email: 'not-an-email',
        password: 'short',
        role: 'STUDENT',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Email invalido|Nome deve ter|Senha deve ter/);
  });

  it('rejects unknown fields instead of allowing account mass assignment', async () => {
    const response = await request(app)
      .post('/api/v1/pre-cadastro/contract-test-token/register')
      .send({
        name: 'Pessoa Teste',
        email: 'pessoa@example.com',
        password: 'senha-segura',
        role: 'STUDENT',
        isActive: true,
        type: 'professor',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Unrecognized key|não reconhecid/i);
  });
});