import express from 'express';

const request = require('supertest');

const mockGetAutomaticCloneSourceContract = jest.fn();
const mockGetFirstSourceContract = jest.fn();
const mockCloneContractData = jest.fn();

jest.mock('../src/modules/contracts/contract.service', () => ({
  contractService: {
    getAutomaticCloneSourceContract: mockGetAutomaticCloneSourceContract,
    getFirstSourceContract: mockGetFirstSourceContract,
  },
}));

jest.mock('../src/modules/contracts/contract-data.service', () => ({
  cloneContractData: mockCloneContractData,
}));

jest.mock('../src/modules/contracts/contract-document.service', () => ({
  contractDocumentService: {},
}));

jest.mock('../src/modules/adipometry/adipometry-governance.service', () => ({
  adipometryGovernanceService: {},
  AdipometryGovernanceError: class AdipometryGovernanceError extends Error {
    statusCode = 400;
  },
}));

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    (req as any).user = {
      userId: 'user-1',
      professorId: 'master-1',
      professorRole: 'master',
      contractId: 'target-contract',
      type: 'professor',
    };
    next();
  },
  professorMiddleware: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
  masterMiddleware: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

jest.mock('../src/modules/access-control/access-control.middleware', () => ({
  screenAccessMiddleware:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  blockAccessMiddleware:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../src/common/supabase-storage', () => ({
  savePublicAsset: jest.fn(),
}));

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

const router = require('../src/modules/contracts/contract.routes').default;

const responseCounters = {
  parametersCreated: 2,
  parametersSkipped: 3,
  exercisesCreated: 5,
  exercisesSkipped: 7,
  assessmentTypesCreated: 11,
  assessmentTypesSkipped: 13,
};

const expectedCounterKeys = [
  'assessmentTypesCreated',
  'assessmentTypesSkipped',
  'exercisesCreated',
  'exercisesSkipped',
  'parametersCreated',
  'parametersSkipped',
];

describe('POST /contracts/clone-data', () => {
  const app = express();
  app.use(express.json());
  app.use('/contracts', router);

  const originalDefaultContractId = process.env.DEFAULT_CONTRACT_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DEFAULT_CONTRACT_ID;
  });

  afterAll(() => {
    if (originalDefaultContractId === undefined) {
      delete process.env.DEFAULT_CONTRACT_ID;
    } else {
      process.env.DEFAULT_CONTRACT_ID = originalDefaultContractId;
    }
  });

  it('responde 404 e nao clona quando a clonagem completa nao encontra origem elegivel', async () => {
    mockGetAutomaticCloneSourceContract.mockResolvedValue(null);

    const response = await request(app).post('/contracts/clone-data').send({});

    expect(response.status).toBe(404);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: 'Nenhum contrato de origem com dados clonáveis foi encontrado',
      })
    );
    expect(mockGetAutomaticCloneSourceContract).toHaveBeenCalledWith(
      'target-contract',
      undefined
    );
    expect(mockCloneContractData).not.toHaveBeenCalled();
  });

  it('preserva os seis contadores consumidos pela tela no sucesso', async () => {
    mockGetAutomaticCloneSourceContract.mockResolvedValue({ id: 'source-contract' });
    mockCloneContractData.mockResolvedValue(responseCounters);

    const response = await request(app).post('/contracts/clone-data').send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        data: responseCounters,
        message: 'Dados clonados com sucesso',
      })
    );
    expect(Object.keys(response.body.data).sort()).toEqual(expectedCounterKeys);
    expect(mockCloneContractData).toHaveBeenCalledWith({
      sourceContractId: 'source-contract',
      targetContractId: 'target-contract',
      professorId: 'master-1',
      copyParameters: true,
      copyExercises: true,
      copyAssessmentTypes: true,
    });
  });

  it('mantem sucesso idempotente quando todos os itens existentes sao retornados como skipped', async () => {
    const idempotentResult = {
      parametersCreated: 0,
      parametersSkipped: 2,
      exercisesCreated: 0,
      exercisesSkipped: 5,
      assessmentTypesCreated: 0,
      assessmentTypesSkipped: 1,
    };
    mockGetAutomaticCloneSourceContract.mockResolvedValue({ id: 'source-contract' });
    mockCloneContractData.mockResolvedValue(idempotentResult);

    const response = await request(app).post('/contracts/clone-data').send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(idempotentResult);
    expect(response.body.data.parametersCreated).toBe(0);
    expect(response.body.data.exercisesCreated).toBe(0);
    expect(response.body.data.assessmentTypesCreated).toBe(0);
    expect(response.body.data.parametersSkipped).toBeGreaterThan(0);
    expect(response.body.data.exercisesSkipped).toBeGreaterThan(0);
    expect(response.body.data.assessmentTypesSkipped).toBeGreaterThan(0);
  });
});
