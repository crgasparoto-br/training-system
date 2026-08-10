import type { Request, Response } from 'express';
import { createPreRegistrationSafeBoundary } from '../src/common/pre-registration-safe-log.js';

const disabledBody = {
  error: 'PRE_REGISTRATION_DISABLED',
  message:
    'O pré-cadastro está temporariamente indisponível. Entre em contato com a equipe da academia.',
};

function passThroughBoundary(statusCode: number, body: unknown): unknown {
  let captured: unknown;
  const res = {
    statusCode: 200,
    json(payload: unknown) {
      captured = payload;
      return this;
    },
  } as unknown as Response;
  const boundary = createPreRegistrationSafeBoundary();
  boundary({} as Request, res, () => {
    res.statusCode = statusCode;
    res.json(body);
  });
  return captured;
}

describe('pre-registration safe boundary rollout response', () => {
  it('preserves the exact static disabled rollout envelope', () => {
    expect(passThroughBoundary(503, disabledBody)).toEqual(disabledBody);
  });

  it('sanitizes a disabled-looking response with any extra field', () => {
    expect(passThroughBoundary(503, { ...disabledBody, details: { secret: 'blocked' } })).toEqual(
      expect.objectContaining({
        error: 'PRE_REGISTRATION_INTERNAL_ERROR',
        message: 'Não foi possível continuar.',
        correlationId: expect.any(String),
      })
    );
  });

  it('continues sanitizing every other 5xx payload', () => {
    expect(passThroughBoundary(500, { error: 'raw', details: 'sensitive' })).toEqual(
      expect.objectContaining({
        error: 'PRE_REGISTRATION_INTERNAL_ERROR',
        message: 'Não foi possível continuar.',
        correlationId: expect.any(String),
      })
    );
  });
});
