import express from 'express';

const request = require('supertest');

const mockGetMostPermissiveDataScope = jest.fn();
const mockFindByAccessScope = jest.fn();
const mockSummary = jest.fn();
const mockPreview = jest.fn();
const mockAssertDocument = jest.fn();
const mockFindDocument = jest.fn();
let allowedScreens = new Set<string>();
let allowedBlocks = new Set<string>();

jest.mock('../src/modules/access-control/index', () => ({
  getMostPermissiveDataScopeForProfessor: (...args: unknown[]) =>
    mockGetMostPermissiveDataScope(...args),
}));

jest.mock('../src/modules/access-control/access-control.middleware', () => ({
  screenAccessMiddleware:
    (requested: string | string[]) =>
    (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      const keys = Array.isArray(requested) ? requested : [requested];
      if (!keys.some((key) => allowedScreens.has(key))) {
        return res.status(403).json({ success: false, error: 'Acesso negado' });
      }
      return next();
    },
  blockAccessMiddleware:
    (blockKey: string) =>
    (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!allowedBlocks.has(blockKey)) {
        return res.status(403).json({ success: false, error: 'Acesso negado' });
      }
      return next();
    },
}));

jest.mock('../src/modules/professores/professor-access-query.service', () => ({
  professorAccessQueryService: {
    findByAccessScope: (...args: unknown[]) => mockFindByAccessScope(...args),
  },
}));

jest.mock('../src/modules/contracts/collaborator-contract.service', () => ({
  collaboratorContractService: {
    summary: (...args: unknown[]) => mockSummary(...args),
    preview: (...args: unknown[]) => mockPreview(...args),
    generate: jest.fn(),
    assertDocumentBelongsToCollaborator: (...args: unknown[]) => mockAssertDocument(...args),
  },
}));

jest.mock('../src/modules/contracts/contract-record.repository', () => ({
  contractRecordRepository: {
    findByIdForCompany: (...args: unknown[]) => mockFindDocument(...args),
    findById: jest.fn(),
  },
}));

jest.mock('../src/modules/contracts/contract-pdf.service', () => ({
  contractPdfService: { generate: jest.fn() },
}));

jest.mock('../src/modules/contracts/contract-party-link.service', () => ({
  contractPartyLinkService: { setStatusByGeneratedContractId: jest.fn() },
}));

jest.mock('../src/modules/student-contracts/student-contract-lifecycle.service', () => ({
  studentContractLifecycleService: {
    prepareOrActivateCollaboratorContract: jest.fn(),
  },
}));

const router = require('../src/modules/contracts/collaborator-contract.routes').default;

describe('collaborator contract routes access separation', () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = {
      userId: 'user-1',
      professorId: 'actor-1',
      professorRole: 'professor',
      collaboratorFunctionId: 'function-1',
      collaboratorFunctionCode: 'manager',
      contractId: 'company-1',
    };
    next();
  });
  app.use('/contracts', router);

  beforeEach(() => {
    jest.clearAllMocks();
    allowedScreens = new Set();
    allowedBlocks = new Set();
    mockGetMostPermissiveDataScope.mockResolvedValue('managed');
    mockFindByAccessScope.mockResolvedValue({ id: 'collaborator-1' });
    mockSummary.mockResolvedValue({ current: null, candidates: [], history: [], all: [] });
    mockPreview.mockResolvedValue({ html: '<p>Prévia</p>', context: {} });
    mockAssertDocument.mockResolvedValue(undefined);
    mockFindDocument.mockResolvedValue({
      id: 'document-1',
      renderedHtml: '<p>Documento persistido</p>',
      pdfPath: null,
    });
  });

  it('permite resumo e documento para perfil somente de consulta', async () => {
    allowedScreens.add('collaborators.consultation');

    const summaryResponse = await request(app)
      .get('/contracts/collaborators/collaborator-1/summary');
    const documentResponse = await request(app)
      .get('/contracts/collaborators/collaborator-1/documents/document-1');

    expect(summaryResponse.status).toBe(200);
    expect(documentResponse.status).toBe(200);
    expect(mockGetMostPermissiveDataScope).toHaveBeenCalledWith(
      expect.anything(),
      ['collaborators.consultation', 'collaborators.registration']
    );
    expect(mockFindByAccessScope).toHaveBeenCalledWith(
      'company-1',
      'actor-1',
      'managed',
      'collaborator-1'
    );
    expect(mockAssertDocument).toHaveBeenCalledWith(
      'company-1',
      'collaborator-1',
      'document-1'
    );
  });

  it('nega ações de escrita para perfil somente de consulta', async () => {
    allowedScreens.add('collaborators.consultation');
    allowedBlocks.add('collaborators.actions.uploadSignedContract');

    const response = await request(app)
      .post('/contracts/collaborators/collaborator-1/preview')
      .send({ templateId: 'template-1' });

    expect(response.status).toBe(403);
    expect(mockPreview).not.toHaveBeenCalled();
    expect(mockGetMostPermissiveDataScope).not.toHaveBeenCalled();
  });

  it('exige o bloco administrativo mesmo com acesso de cadastro', async () => {
    allowedScreens.add('collaborators.registration');

    const response = await request(app)
      .post('/contracts/collaborators/collaborator-1/preview')
      .send({ templateId: 'template-1' });

    expect(response.status).toBe(403);
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('permite escrita somente com cadastro, bloco e escopo de cadastro', async () => {
    allowedScreens.add('collaborators.registration');
    allowedBlocks.add('collaborators.actions.uploadSignedContract');

    const response = await request(app)
      .post('/contracts/collaborators/collaborator-1/preview')
      .send({ templateId: 'template-1' });

    expect(response.status).toBe(200);
    expect(mockGetMostPermissiveDataScope).toHaveBeenCalledWith(
      expect.anything(),
      ['collaborators.registration']
    );
    expect(mockPreview).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({
        templateId: 'template-1',
        collaboratorId: 'collaborator-1',
      })
    );
  });
});
