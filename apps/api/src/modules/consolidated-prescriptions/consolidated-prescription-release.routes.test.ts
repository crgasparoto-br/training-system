import express, { type NextFunction, type Request, type Response } from 'express';

const request = require('supertest');

jest.mock('../auth/auth.middleware.js', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      ...(req.user ?? {}),
      contractId: 'contract-pb-err',
      professorId: 'professor-pb-err',
    } as Request['user'];
    next();
  },
  professorMiddleware: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('./consolidated-prescription-release.service.js', () => ({
  ConsolidatedReleaseDomainError: class ConsolidatedReleaseDomainError extends Error {},
  consolidatedPrescriptionReleaseService: { release: jest.fn() },
}));

const releaseRoute = require('./consolidated-prescription-release.routes').default;
const { consolidatedPrescriptionReleaseService } = require('./consolidated-prescription-release.service');

function payload() {
  return {
    expectedCurrentVersion: 1,
    target: {
      trainingPlanId: 'plan-pb-err',
      mesocycleNumber: 1,
      weekNumber: 1,
      weekStartDate: '2026-08-17T00:00:00.000Z',
      placements: [],
    },
  };
}

describe('consolidated operational release unexpected public error', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    consolidatedPrescriptionReleaseService.release.mockReset();
  });

  it('PB-ERR-001 retorna código genérico, correlationId e não vaza erro bruto', async () => {
    const rawError = Object.assign(
      new Error(
        'PB-ERR-001 fingerprint=fingerprint-marker idempotencyKey=idempotency-marker amount=123.45'
      ),
      { code: 'P0001' }
    );
    consolidatedPrescriptionReleaseService.release.mockRejectedValueOnce(rawError);
    const logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = express();
    app.use(express.json());
    app.use('/consolidated-prescriptions', releaseRoute);

    const response = await request(app)
      .post('/consolidated-prescriptions/alunos/aluno-pb-err/operational-release')
      .send(payload());

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      success: false,
      code: 'API_UNEXPECTED_ERROR',
      error: 'Erro ao liberar saída operacional da montagem consolidada',
    });
    expect(response.body.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    const serialized = JSON.stringify(response.body);
    for (const marker of [
      'PB-ERR-001',
      'fingerprint-marker',
      'idempotency-marker',
      '123.45',
      'P0001',
      'stack',
    ]) {
      expect(serialized).not.toContain(marker);
    }
    expect(logSpy).toHaveBeenCalledWith(
      'Erro ao liberar saída operacional da montagem consolidada:',
      expect.objectContaining({ correlationId: response.body.correlationId, error: rawError })
    );
  });
});
