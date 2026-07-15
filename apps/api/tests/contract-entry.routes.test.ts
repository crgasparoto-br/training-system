import express from 'express';

const request = require('supertest');

const mockOpenPublic = jest.fn();
const mockPreview = jest.fn();
const mockGenerate = jest.fn();

jest.mock('../src/modules/contracts/contract.routes', () => ({
  __esModule: true,
  default: require('express').Router(),
}));

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    (req as any).user = {
      userId: 'user-1',
      professorId: 'professor-1',
      contractId: 'company-1',
      type: 'professor',
    };
    next();
  },
  professorMiddleware: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

jest.mock('../src/modules/access-control/access-control.middleware', () => ({
  blockAccessMiddleware:
    (blockKey: string) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (
        blockKey === 'students.actions.manageFinancialContract' &&
        req.get('x-test-deny-financial-contract') === 'true'
      ) {
        return res.status(403).json({
          success: false,
          error: 'Perfil sem permissão para acessar este recurso',
        });
      }
      return next();
    },
}));

jest.mock('../src/modules/contracts/contract-document.service', () => ({
  contractDocumentService: {
    openPublic: mockOpenPublic,
  },
}));

jest.mock('../src/modules/contracts/contract-authoritative-generation.service', () => ({
  contractAuthoritativeGenerationService: {
    preview: mockPreview,
    generate: mockGenerate,
  },
}));

const router = require('../src/modules/contracts/contract-entry.routes').default;

describe('contract route entry', () => {
  const app = express();
  app.use(express.json());
  app.use('/contracts', router);

  beforeEach(() => jest.clearAllMocks());

  it('keeps public document opening outside authenticated routes', async () => {
    mockOpenPublic.mockResolvedValue({
      id: 'contract-1',
      title: 'Contrato público',
      status: 'SENT',
      renderedHtml: '<p>Contrato</p>',
      signedAt: null,
    });

    const response = await request(app).get('/contracts/public/public-token');

    expect(response.status).toBe(200);
    expect(mockOpenPublic).toHaveBeenCalledWith(
      'public-token',
      expect.objectContaining({ ipAddress: expect.any(String) })
    );
  });

  it('routes previews and generation through the authoritative domain service', async () => {
    mockPreview.mockResolvedValue({ html: '<p>Prévia</p>', context: {} });
    mockGenerate.mockResolvedValue({ id: 'generated-contract-1' });

    const previewResponse = await request(app)
      .post('/contracts/preview')
      .send({
        templateId: 'template-1',
        alunoId: 'student-1',
        serviceId: 'untrusted-service',
      });
    const generateResponse = await request(app)
      .post('/contracts/generate')
      .send({
        templateId: 'template-1',
        alunoId: 'student-1',
        serviceId: 'untrusted-service',
      });

    expect(previewResponse.status).toBe(200);
    expect(generateResponse.status).toBe(201);
    expect(mockPreview).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ serviceId: 'untrusted-service' })
    );
    expect(mockGenerate).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ serviceId: 'untrusted-service' }),
      expect.objectContaining({ userId: 'user-1' })
    );
  });

  it('blocks direct generation when the profile lacks financial contract permission', async () => {
    const response = await request(app)
      .post('/contracts/generate')
      .set('x-test-deny-financial-contract', 'true')
      .send({ templateId: 'template-1', alunoId: 'student-1' });

    expect(response.status).toBe(403);
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
