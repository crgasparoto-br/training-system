import express from 'express';
import { Prisma } from '@prisma/client';

const request = require('supertest');
const mockListAssessments = jest.fn();
const mockCreateDraft = jest.fn();

jest.mock('../auth/auth.middleware.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as any).user = {
      userId: 'user-1',
      email: 'professor@example.invalid',
      type: 'professor',
      professorId: 'professor-1',
      contractId: 'contract-1',
    };
    next();
  },
  professorMiddleware: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

jest.mock('../access-control/access-control.middleware.js', () => ({
  screenAccessMiddleware:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  blockAccessMiddleware:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('./adipometry-draft-access.middleware.js', () => ({
  ADIPOMETRY_VIEW_BLOCK_KEY: 'physicalAssessment.adpt.view',
  ADIPOMETRY_MANAGE_BLOCK_KEY: 'physicalAssessment.adpt.actions.manage',
  ADIPOMETRY_CORRECT_BLOCK_KEY: 'physicalAssessment.adpt.actions.correctCompleted',
  adipometryDraftMutationAccessMiddleware: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

jest.mock('./adipometry.service.js', () => {
  class AdipometryServiceError extends Error {
    constructor(
      message: string,
      readonly code: string,
      readonly statusCode: 400 | 403 | 404 | 409 | 500 = 400
    ) {
      super(message);
    }
  }

  return {
    AdipometryServiceError,
    adipometryService: {
      listAssessments: mockListAssessments,
      createDraft: mockCreateDraft,
    },
  };
});

const adipometryRouter = require('./adipometry.routes').default;

function prismaError(code: string, databaseMessage: string) {
  return new Prisma.PrismaClientKnownRequestError(
    `Raw query failed. Message: ${databaseMessage}`,
    {
      code,
      clientVersion: '5.7.0',
      meta: {
        code: 'P0001',
        message: databaseMessage,
      },
    }
  );
}

describe('adipometry public persistence errors', () => {
  const app = express();
  app.use(express.json());
  app.use('/adipometry', adipometryRouter);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps protocol-dependent measurement limits out of the HTTP transport schema', async () => {
    mockCreateDraft.mockResolvedValueOnce({ id: 'draft-1' });

    const response = await request(app)
      .post('/adipometry/alunos/aluno-1/assessments')
      .send({
        assessmentDate: '2026-08-03',
        measurements: {
          weightKg: 1000,
          tricepsMm: 81,
          subscapularMm: 81,
          suprailiacMm: 81,
          abdominalMm: 81,
          thighMm: 81,
        },
      });

    expect(response.status).toBe(201);
    expect(mockCreateDraft).toHaveBeenCalledWith(
      'contract-1',
      'aluno-1',
      'user-1',
      'professor-1',
      expect.objectContaining({
        measurements: expect.objectContaining({
          weightKg: 1000,
          tricepsMm: 81,
        }),
      })
    );
  });

  it('returns a stable 409 when serializable retries are exhausted', async () => {
    mockListAssessments.mockRejectedValueOnce(
      prismaError('P2034', 'transaction write conflict internal-marker')
    );

    const response = await request(app)
      .get('/adipometry/alunos/aluno-1/assessments');

    expect(response.status).toBe(409);
    expect(response.body.details?.code).toBe('ADIPOMETRY_CONCURRENT_OPERATION');
    expect(JSON.stringify(response.body)).not.toContain('P2034');
    expect(JSON.stringify(response.body)).not.toContain('internal-marker');
  });

  it('sanitizes an unexpected raw persistence failure at the public route', async () => {
    const rawMarker = 'fingerprint-secret idempotency-key-secret financial-value-999';
    mockListAssessments.mockRejectedValueOnce(
      prismaError('P2010', rawMarker)
    );

    const response = await request(app)
      .get('/adipometry/alunos/aluno-1/assessments');

    expect(response.status).toBe(500);
    expect(response.body.details?.code).toBe('ADIPOMETRY_UNEXPECTED_ERROR');
    expect(response.body.details?.correlationId).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain(rawMarker);
    expect(JSON.stringify(response.body)).not.toContain('P0001');
    expect(JSON.stringify(response.body)).not.toContain('P2010');
  });
});
