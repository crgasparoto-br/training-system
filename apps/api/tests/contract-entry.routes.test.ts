import express from 'express';

const request = require('supertest');

const mockOpenPublic = jest.fn();
const mockPreview = jest.fn();
const mockGenerate = jest.fn();
const mockAssertAlunoAccess = jest.fn();
const mockAssertContractDocumentAccess = jest.fn();

jest.mock('../src/modules/contracts/contract.routes', () => {
  const legacyRouter = require('express').Router();
  legacyRouter.get('/alunos/:alunoId', (_req: express.Request, res: express.Response) =>
    res.status(204).end()
  );
  legacyRouter.get(
    '/documents/:contractDocumentId',
    (_req: express.Request, res: express.Response) => res.status(204).end()
  );
  legacyRouter.get(
    '/available-for-student',
    (_req: express.Request, res: express.Response) => res.status(204).end()
  );
  return { __esModule: true, default: legacyRouter };
});

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    (req as any).user = {
      userId: 'user-1',
      professorId: 'professor-1',
      professorRole: req.get('x-test-master') === 'true' ? 'master' : 'professor',
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
  screenAccessMiddleware:
    () =>
    (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
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

jest.mock('../src/modules/alunos/student-access-scope.service', () => ({
  studentAccessScopeService: {
    assertAlunoAccess: mockAssertAlunoAccess,
    assertContractDocumentAccess: mockAssertContractDocumentAccess,
  },
}));

jest.mock('../src/modules/contracts/contract-preview-access.middleware', () => ({
  contractPreviewAccessMiddleware: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (req.get('x-test-deny-preview') === 'true') {
      return res.status(403).json({
        success: false,
        error: 'Perfil sem permissão para acessar este recurso',
      });
    }
    return next();
  },
}));

jest.mock('../src/modules/contracts/contract-public-access.service', () => ({
  contractPublicAccessService: {
    open: mockOpenPublic,
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

  beforeEach(() => {
    jest.clearAllMocks();
    mockAssertAlunoAccess.mockResolvedValue({ id: 'student-1' });
    mockAssertContractDocumentAccess.mockResolvedValue({ id: 'document-1' });
  });

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

  it('routes previews and generation with the authenticated professor scope', async () => {
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
      expect.objectContaining({ serviceId: 'untrusted-service' }),
      expect.objectContaining({
        userId: 'user-1',
        professorId: 'professor-1',
        professorRole: 'professor',
      })
    );
    expect(mockGenerate).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ serviceId: 'untrusted-service' }),
      expect.objectContaining({
        userId: 'user-1',
        professorId: 'professor-1',
        professorRole: 'professor',
      })
    );
  });

  it('returns not found when the domain rejects an aluno outside the actor scope', async () => {
    mockPreview.mockRejectedValue(new Error('Aluno fora do escopo do professor autenticado'));
    mockGenerate.mockRejectedValue(new Error('Aluno fora do escopo do professor autenticado'));

    const previewResponse = await request(app)
      .post('/contracts/preview')
      .send({ templateId: 'template-1', alunoId: 'student-other' });
    const generateResponse = await request(app)
      .post('/contracts/generate')
      .send({ templateId: 'template-1', alunoId: 'student-other' });

    expect(previewResponse.status).toBe(404);
    expect(generateResponse.status).toBe(404);
  });

  it('scopes contract history, document reads and available-contract queries', async () => {
    const history = await request(app).get('/contracts/alunos/student-1');
    const document = await request(app).get('/contracts/documents/document-1');
    const available = await request(app).get(
      '/contracts/available-for-student?alunoId=student-1'
    );

    expect(history.status).toBe(204);
    expect(document.status).toBe(204);
    expect(available.status).toBe(204);
    expect(mockAssertAlunoAccess).toHaveBeenCalledWith(
      'student-1',
      expect.objectContaining({
        professorId: 'professor-1',
        professorRole: 'professor',
        companyContractId: 'company-1',
      })
    );
    expect(mockAssertContractDocumentAccess).toHaveBeenCalledWith(
      'document-1',
      expect.objectContaining({ professorId: 'professor-1' })
    );
  });

  it('blocks history and document access when the aluno is outside the professor scope', async () => {
    mockAssertAlunoAccess.mockRejectedValueOnce(
      new Error('Aluno fora do escopo do professor autenticado')
    );
    mockAssertContractDocumentAccess.mockRejectedValueOnce(
      new Error('Aluno fora do escopo do professor autenticado')
    );

    const history = await request(app).get('/contracts/alunos/student-other');
    const document = await request(app).get('/contracts/documents/document-other');

    expect(history.status).toBe(404);
    expect(document.status).toBe(404);
  });

  it('keeps preview available when financial generation permission is denied', async () => {
    mockPreview.mockResolvedValue({ html: '<p>Prévia</p>', context: {} });

    const response = await request(app)
      .post('/contracts/preview')
      .set('x-test-deny-financial-contract', 'true')
      .send({ templateId: 'template-1', alunoId: 'student-1' });

    expect(response.status).toBe(200);
    expect(mockPreview).toHaveBeenCalledTimes(1);
  });

  it('blocks preview when neither accepted permission is available', async () => {
    const response = await request(app)
      .post('/contracts/preview')
      .set('x-test-deny-preview', 'true')
      .send({ templateId: 'template-1', alunoId: 'student-1' });

    expect(response.status).toBe(403);
    expect(mockPreview).not.toHaveBeenCalled();
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