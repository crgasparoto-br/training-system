import express from 'express';

const request = require('supertest');
const mockFindUnique = jest.fn();
const mockInstallContractDefaults = jest.fn();
const mockCloneContractData = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    companyContract: { findUnique: mockFindUnique },
  })),
}));

jest.mock('../auth/auth.middleware', () => ({
  masterMiddleware: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

jest.mock('./contract-defaults.service', () => ({
  installContractDefaults: mockInstallContractDefaults,
}));

jest.mock('./contract-data.service', () => ({
  cloneContractData: mockCloneContractData,
}));

const router = require('./contract-defaults.routes').default;

const installResult = {
  trainingParameters: { installed: 2, skipped: 24, total: 26 },
  exercises: { installed: 3, skipped: 194, total: 197 },
  assessmentTypes: { installed: 1, skipped: 1, total: 2 },
};

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const missingContract = req.get('x-test-missing-contract') === 'true';
    (req as any).user = {
      contractId: missingContract ? undefined : 'session-contract',
      professorId: 'professor-master',
    };
    next();
  });
  app.use('/contracts', router);
  return app;
}

describe('contract defaults routes', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockInstallContractDefaults.mockResolvedValue(installResult);
    mockFindUnique.mockResolvedValue({ id: 'source-contract' });
    mockCloneContractData.mockResolvedValue({
      parametersCreated: 1,
      parametersSkipped: 0,
      exercisesCreated: 1,
      exercisesSkipped: 0,
      assessmentTypesCreated: 1,
      assessmentTypesSkipped: 0,
    });
  });

  it('usa exclusivamente o contrato da sessão e ignora tentativa de override no body', async () => {
    const response = await request(app)
      .post('/contracts/install-defaults')
      .send({ contractId: 'attacker-contract', targetContractId: 'attacker-contract' });

    expect(response.status).toBe(200);
    expect(mockInstallContractDefaults).toHaveBeenCalledWith('session-contract');
    expect(mockInstallContractDefaults).not.toHaveBeenCalledWith('attacker-contract');
  });

  it('falha sem contrato autenticado antes de instalar qualquer padrão', async () => {
    const response = await request(app)
      .post('/contracts/install-defaults')
      .set('x-test-missing-contract', 'true')
      .send({ targetContractId: 'attacker-contract' });

    expect(response.status).toBe(404);
    expect(mockInstallContractDefaults).not.toHaveBeenCalled();
  });

  it('exige origem explícita na rota de cópia entre contratos', async () => {
    const response = await request(app).post('/contracts/copy-data').send({});

    expect(response.status).toBe(400);
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockCloneContractData).not.toHaveBeenCalled();
  });

  it('mantém source explícito e força o target da sessão na cópia manual', async () => {
    const response = await request(app)
      .post('/contracts/copy-data')
      .send({
        sourceContractId: 'source-contract',
        targetContractId: 'attacker-contract',
        copyParameters: true,
        copyExercises: false,
        copyAssessmentTypes: true,
      });

    expect(response.status).toBe(200);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'source-contract' },
      select: { id: true },
    });
    expect(mockCloneContractData).toHaveBeenCalledWith({
      sourceContractId: 'source-contract',
      targetContractId: 'session-contract',
      professorId: 'professor-master',
      copyParameters: true,
      copyExercises: false,
      copyAssessmentTypes: true,
    });
  });

  it('mantém /clone-data compatível sem origem, instalando defaults e preservando contadores legados', async () => {
    const response = await request(app).post('/contracts/clone-data').send({});

    expect(response.status).toBe(200);
    expect(mockInstallContractDefaults).toHaveBeenCalledWith('session-contract');
    expect(mockCloneContractData).not.toHaveBeenCalled();
    expect(response.body.data).toEqual(
      expect.objectContaining({
        parametersCreated: 2,
        parametersSkipped: 24,
        exercisesCreated: 3,
        exercisesSkipped: 194,
        assessmentTypesCreated: 1,
        assessmentTypesSkipped: 1,
        defaults: installResult,
      })
    );
  });

  it('mantém /clone-data compatível com cópia somente quando a origem é explícita', async () => {
    const response = await request(app)
      .post('/contracts/clone-data')
      .send({ sourceContractId: 'source-contract', targetContractId: 'attacker-contract' });

    expect(response.status).toBe(200);
    expect(mockInstallContractDefaults).not.toHaveBeenCalled();
    expect(mockCloneContractData).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceContractId: 'source-contract',
        targetContractId: 'session-contract',
      })
    );
  });
});
