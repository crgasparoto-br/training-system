import cors from 'cors';
import express from 'express';
import { createApiCorsOptions } from '../src/common/api-cors';

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

const {
  preRegistrationInvitePublicErrorHandler,
  preRegistrationInvitePublicHeaders,
  preRegistrationInvitePublicRoutes,
} = require('../src/modules/pre-registration-invites/pre-registration-invite.routes');

const ALLOWED_ORIGIN = 'https://allowed.example';
const corsConfig = {
  allowedOrigins: [ALLOWED_ORIGIN],
  allowedVercelPreviewProjects: [],
};

const expectSafeGenericPublicError = (res: any, token: string) => {
  expect(res.status).toBe(404);
  expect(res.body.error).toBe('Link inválido ou expirado.');
  expect(res.headers['cache-control']).toContain('no-store');
  expect(res.headers['referrer-policy']).toBe('no-referrer');
  expect(JSON.stringify(res.body)).not.toContain(token);
};

describe('pre-registration invite public route', () => {
  const app = express();
  app.set('trust proxy', 1);

  // Mesma composição relevante usada em main.ts: headers antes do CORS,
  // preflight contínuo somente neste namespace, roteador e barreira de erro.
  app.use('/api/v1/pre-cadastro', preRegistrationInvitePublicHeaders);
  app.use(
    '/api/v1/pre-cadastro',
    cors(createApiCorsOptions(corsConfig, { preflightContinue: true }))
  );
  app.use('/api/v1', preRegistrationInvitePublicRoutes);
  app.use('/api/v1/pre-cadastro', preRegistrationInvitePublicErrorHandler);
  app.use(express.json());

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

  it('origem CORS rejeitada não reflete nem registra token enviado no cabeçalho', async () => {
    const token = 'OriginTokenAbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-';
    const blockedOrigin = `https://blocked.example/pre-cadastro/${token}`;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const res = await request(app)
        .get(`/api/v1/pre-cadastro/${token}`)
        .set('Origin', blockedOrigin)
        .set('X-Forwarded-For', '203.0.113.54');

      expectSafeGenericPublicError(res, token);
      expect(JSON.stringify(res.body)).not.toContain(blockedOrigin);
      expect(consoleError).not.toHaveBeenCalled();
      expect(mockOpenPublicInvite).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('método diferente de GET não reflete o token nem escapa dos controles públicos', async () => {
    const token = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-TOKEN';

    const res = await request(app)
      .post(`/api/v1/pre-cadastro/${token}`)
      .set('X-Forwarded-For', '203.0.113.51')
      .send({ ignored: true });

    expectSafeGenericPublicError(res, token);
    expect(mockOpenPublicInvite).not.toHaveBeenCalled();
  });

  it('sufixo adicional no caminho não reflete o token nem chega ao 404 global', async () => {
    const token = 'ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210_-TOKEN';

    const res = await request(app)
      .get(`/api/v1/pre-cadastro/${token}/qualquer-coisa`)
      .set('X-Forwarded-For', '203.0.113.52');

    expectSafeGenericPublicError(res, token);
    expect(mockOpenPublicInvite).not.toHaveBeenCalled();
  });

  it('preflight OPTIONS permitido continua até o fallback seguro do convite', async () => {
    const token = 'OptionsTokenAbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-';

    const res = await request(app)
      .options(`/api/v1/pre-cadastro/${token}`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .set('X-Forwarded-For', '203.0.113.55');

    expectSafeGenericPublicError(res, token);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(mockOpenPublicInvite).not.toHaveBeenCalled();
  });

  it('preserva o preflight automático padrão nas demais rotas da API', async () => {
    const genericApp = express();
    genericApp.use(cors(createApiCorsOptions(corsConfig)));
    genericApp.get('/api/v1/outra-rota', (_req, res) => res.sendStatus(200));

    const res = await request(genericApp)
      .options('/api/v1/outra-rota')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
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

  it('aplica rate limit também a métodos inválidos tratados pelo fallback seguro', async () => {
    const token = 'FallbackRateLimitToken0123456789_ABCDEFGHIJKLMNOP';
    let lastResponse: any;

    for (let i = 0; i < 25; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      lastResponse = await request(app)
        .post(`/api/v1/pre-cadastro/${token}`)
        .set('X-Forwarded-For', '203.0.113.53')
        .send({ ignored: true });
      if (lastResponse.status === 429) break;
    }

    expect(lastResponse.status).toBe(429);
    expect(lastResponse.headers['cache-control']).toContain('no-store');
    expect(lastResponse.headers['referrer-policy']).toBe('no-referrer');
    expect(JSON.stringify(lastResponse.body)).not.toContain(token);
    expect(mockOpenPublicInvite).not.toHaveBeenCalled();
  });

  it('aplica rate limit também ao preflight OPTIONS do namespace público', async () => {
    const token = 'OptionsRateLimitToken0123456789_ABCDEFGHIJKLMNOP';
    let lastResponse: any;

    for (let i = 0; i < 25; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      lastResponse = await request(app)
        .options(`/api/v1/pre-cadastro/${token}`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'GET')
        .set('X-Forwarded-For', '203.0.113.56');
      if (lastResponse.status === 429) break;
    }

    expect(lastResponse.status).toBe(429);
    expect(lastResponse.headers['cache-control']).toContain('no-store');
    expect(lastResponse.headers['referrer-policy']).toBe('no-referrer');
    expect(JSON.stringify(lastResponse.body)).not.toContain(token);
    expect(mockOpenPublicInvite).not.toHaveBeenCalled();
  });
});
