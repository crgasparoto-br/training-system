import express from 'express';
import { adipometryPublicBoundaryMiddleware } from './adipometry-public-boundary.middleware.js';

const request = require('supertest');

describe('adipometry public error boundary', () => {
  const app = express();
  app.use(adipometryPublicBoundaryMiddleware);
  app.get('/unauthenticated', (_req, res) => res.status(401).json({ success: false, error: 'Token não fornecido' }));
  app.get('/forbidden', (_req, res) => res.status(403).json({ success: false, error: 'Acesso negado' }));
  app.get('/inactive', (_req, res) => res.status(404).json({ success: false, error: 'Professor não encontrado' }));
  app.get('/unexpected', (_req, res) => res.status(500).json({ success: false, error: 'internal-marker' }));
  app.get('/stable', (_req, res) => res.status(409).json({
    success: false,
    message: 'Conflito conhecido.',
    details: { code: 'ADIPOMETRY_PREVIEW_INVALIDATED' },
  }));

  it.each([
    ['/unauthenticated', 401, 'ADIPOMETRY_AUTHENTICATION_REQUIRED'],
    ['/forbidden', 403, 'ADIPOMETRY_ACCESS_DENIED'],
    ['/inactive', 404, 'ADIPOMETRY_RESOURCE_NOT_FOUND'],
  ])('normalizes %s with a stable code', async (path, status, code) => {
    const response = await request(app).get(path);
    expect(response.status).toBe(status);
    expect(response.body.details?.code).toBe(code);
    expect(response.body.error).toBeUndefined();
  });

  it('sanitizes unexpected middleware failures and adds a correlation id', async () => {
    const response = await request(app).get('/unexpected');
    expect(response.status).toBe(500);
    expect(response.body.details?.code).toBe('ADIPOMETRY_UNEXPECTED_ERROR');
    expect(response.body.details?.correlationId).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain('internal-marker');
  });

  it('preserves errors that already follow the ADPT public contract', async () => {
    const response = await request(app).get('/stable');
    expect(response.status).toBe(409);
    expect(response.body.details?.code).toBe('ADIPOMETRY_PREVIEW_INVALIDATED');
    expect(response.body.message).toBe('Conflito conhecido.');
  });
});
