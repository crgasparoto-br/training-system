import express from 'express';

const request = require('supertest');

const mockGetAutomaticCloneSourceContract = jest.fn();
const mockGetFirstSourceContract = jest.fn();
const mockCloneContractData = jest.fn();
let mockCurrentProfessorRole: 'master' | 'professor' = 'master';

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
      professorId: mockCurrentProfessorRole === 'master' ? 'master-1' : 'professor-1',
      professorRole: mockCurrentProfessorRole,
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
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if ((req as any).user?.professorRole !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professor master pode acessar este recurso',
      });
    }
    next();
  },
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
    mockCurrentProfessorRole = 'master';
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

  it('ignora targetContractId e contractId enviados no body e usa o contrato autenticado', async () => {
    mockGetAutomaticCloneSourceContract.mockResolvedValue({ id: 'source-contract' });
    mockCloneContractData.mockResolvedValue(responseCounters);

    const response = await request(app).post('/contracts/clone-data').send({
      targetContractId: 'attacker-contract',
      contractId: 'attacker-contract',
    });

    expect(response.status).toBe(200);
    expect(mockGetAutomaticCloneSourceContract).toHaveBeenCalledWith(
      'target-contract',
      undefined
    );
    expect(mockCloneContractData).toHaveBeenCalledWith(
      expect.objectContaining({
        targetContractId: 'target-contract',
        professorId: 'master-1',
      })
    );
  });

  it('nega professor nao-master antes de resolver origem ou clonar dados', async () => {
    mockCurrentProfessorRole = 'professor';

    const response = await request(app).post('/contracts/clone-data').send({});

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      error: 'Apenas professor master pode acessar este recurso',
    });
    expect(mockGetAutomaticCloneSourceContract).not.toHaveBeenCalled();
    expect(mockGetFirstSourceContract).not.toHaveBeenCalled();
    expect(mockCloneContractData).not.toHaveBeenCalled();
  });

  it('preserva sourceContractId explicito e nao executa selecao automatica', async () => {
    mockCloneContractData.mockResolvedValue(responseCounters);

    const response = await request(app).post('/contracts/clone-data').send({
      sourceContractId: 'explicit-source',
    });

    expect(response.status).toBe(200);
    expect(mockGetAutomaticCloneSourceContract).not.toHaveBeenCalled();
    expect(mockGetFirstSourceContract).not.toHaveBeenCalled();
    expect(mockCloneContractData).toHaveBeenCalledWith({
      sourceContractId: 'explicit-source',
      targetContractId: 'target-contract',
      professorId: 'master-1',
      copyParameters: true,
      copyExercises: true,
      copyAssessmentTypes: true,
    });
  });

  it('mantem rejeicao quando sourceContractId explicito aponta para o contrato autenticado', async () => {
    const response = await request(app).post('/contracts/clone-data').send({
      sourceContractId: 'target-contract',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: 'Contrato de origem deve ser diferente do contrato atual',
      })
    );
    expect(mockGetAutomaticCloneSourceContract).not.toHaveBeenCalled();
    expect(mockCloneContractData).not.toHaveBeenCalled();
  });

  it('preserva DEFAULT_CONTRACT_ID no fallback legado de clonagem parcial', async () => {
    process.env.DEFAULT_CONTRACT_ID = 'configured-default';
    mockCloneContractData.mockResolvedValue(responseCounters);

    const response = await request(app).post('/contracts/clone-data').send({
      copyExercises: false,
    });

    expect(response.status).toBe(200);
    expect(mockGetAutomaticCloneSourceContract).not.toHaveBeenCalled();
    expect(mockGetFirstSourceContract).not.toHaveBeenCalled();
    expect(mockCloneContractData).toHaveBeenCalledWith({
      sourceContractId: 'configured-default',
      targetContractId: 'target-contract',
      professorId: 'master-1',
      copyParameters: true,
      copyExercises: false,
      copyAssessmentTypes: true,
    });
  });

  it('preserva contrato mais antigo no fallback legado parcial quando nao ha default', async () => {
    mockGetFirstSourceContract.mockResolvedValue({ id: 'legacy-oldest-source' });
    mockCloneContractData.mockResolvedValue(responseCounters);

    const response = await request(app).post('/contracts/clone-data').send({
      copyAssessmentTypes: false,
    });

    expect(response.status).toBe(200);
    expect(mockGetAutomaticCloneSourceContract).not.toHaveBeenCalled();
    expect(mockGetFirstSourceContract).toHaveBeenCalledWith('target-contract');
    expect(mockCloneContractData).toHaveBeenCalledWith({
      sourceContractId: 'legacy-oldest-source',
      targetContractId: 'target-contract',
      professorId: 'master-1',
      copyParameters: true,
      copyExercises: true,
      copyAssessmentTypes: false,
    });
  });
});
