import express from 'express';

const request = require('supertest');

const mockOpenPublicInvite = jest.fn();

class MockPublicAccessError extends Error {}

jest.mock('../src/modules/pre-registration-invites/pre-registration-invite.service', () => ({
  PreRegistrationInviteError: class extends Error {},
  PreRegistrationInvitePublicAccessError: MockPublicAccessError,
  preRegistrationInviteService: {
    openPublicInvite: mockOpenPublicInvite,
  },
}));

const { preRegistrationInvitePublicRoutes } = require('../src/modules/pre-registration-invites/pre-registration-invite.routes');

describe('pre-registration invite public route', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', preRegistrationInvitePublicRoutes);

  beforeEach(() => jest.clearAllMocks());

  it('retorna somente o mínimo necessário, sem IDs internos, e cabeçalhos anti-abuso em caso de sucesso', async () => {
    mockOpenPublicInvite.mockResolvedValue({
      purpose: 'PRE_REGISTRATION',
      expiresAt: '2026-08-21T00:00:00.000Z',
    });

    const res = await request(app).get('/api/v1/pre-cadastro/some-token');

    expect(res.status).toBe(200);
    // Critério de aceite da issue #269: a resposta pública não deve conter
    // IDs internos, histórico comercial, contratos ou dados clínicos - apenas
    // o mínimo estritamente necessário para a tela pública.
    expect(res.body.data).toEqual({
      purpose: 'PRE_REGISTRATION',
      expiresAt: '2026-08-21T00:00:00.000Z',
    });
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.body.data).not.toHaveProperty('alunoId');
    expect(res.body.data).not.toHaveProperty('contractId');
    expect(res.body.data).not.toHaveProperty('id');
    expect(res.body.data).not.toHaveProperty('cpf');
    expect(res.body.data).not.toHaveProperty('email');
  });

  it('token inválido, expirado, revogado, substituído ou de outro tenant produzem a mesma resposta genérica', async () => {
    mockOpenPublicInvite.mockRejectedValue(new MockPublicAccessError('Link inválido ou expirado.'));

    const res = await request(app).get('/api/v1/pre-cadastro/qualquer-token');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Link inválido ou expirado.');
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it('falha inesperada também retorna a mensagem genérica pública (não vaza causa interna)', async () => {
    mockOpenPublicInvite.mockRejectedValue(new Error('erro interno de banco'));

    const res = await request(app).get('/api/v1/pre-cadastro/token-x');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Link inválido ou expirado.');
    expect(res.body.error).not.toContain('banco');
  });

  it('aplica rate limit específico à rota pública após muitas tentativas', async () => {
    mockOpenPublicInvite.mockRejectedValue(new MockPublicAccessError());

    let lastStatus = 200;
    for (let i = 0; i < 25; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .get('/api/v1/pre-cadastro/rate-limit-token')
        .set('X-Forwarded-For', '203.0.113.50');
      lastStatus = res.status;
      if (lastStatus === 429) break;
    }

    expect(lastStatus).toBe(429);
  });
});
