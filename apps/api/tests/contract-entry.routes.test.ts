import express from 'express';

const request = require('supertest');

const mockOpenPublic = jest.fn();
const mockLegacySignPublic = jest.fn();
const mockLifecycleSignPublic = jest.fn();
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

jest.mock('../src/modules/contracts/contract-document.service', () => ({
  contractDocumentService: {
    openPublic: mockOpenPublic,
    signPublic: mockLegacySignPublic,
  },
}));

jest.mock('../src/modules/contracts/contract-authoritative-generation.service', () => ({
  contractAuthoritativeGenerationService: {
    preview: mockPreview,
    generate: mockGenerate,
  },
}));

jest.mock('../src/modules/student-contracts/student-contract-lifecycle.service', () => ({
  studentContractLifecycleService: {
    signPublicContract: mockLifecycleSignPublic,
  },
}));

const router = require('../src/modules/contracts/contract-entry.routes').default;

describe('contract route entry', () => {
  const app = express();
  app.use(express.json());
  app.use('/contracts', router);

  beforeEach(() => jest.clearAllMocks());

  it('routes public signatures through the transactional lifecycle service', async () => {
    mockLifecycleSignPublic.mockResolvedValue({
      signature: { id: 'signature-1' },
      activation: {
        effectiveAt: '2026-08-01T12:00:00.000Z',
        scheduled: true,
        studentContractStatus: 'pending_signature',
      },
    });

    const response = await request(app)
      .post('/contracts/public/public-token/sign')
      .send({
        signerName: 'Aluno Teste',
        signerCpf: '12345678901',
        signerEmail: 'aluno@example.com',
      });

    expect(response.status).toBe(200);
    expect(mockLifecycleSignPublic).toHaveBeenCalledWith(
      'public-token',
      expect.objectContaining({ signerName: 'Aluno Teste' }),
      expect.objectContaining({ userAgent: expect.any(String) })
    );
    expect(mockLegacySignPublic).not.toHaveBeenCalled();
    expect(response.body.data.activation).toEqual(
      expect.objectContaining({ scheduled: true })
    );
  });

  it('routes previews and generation through the authoritative scope service', async () => {
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
});
