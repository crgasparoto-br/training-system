import express from 'express';

const request = require('supertest');

const mockListByAccessScope = jest.fn();
const mockGetMostPermissiveDataScope = jest.fn();

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    (req as any).user = {
      userId: 'user-1',
      professorId: 'professor-actor',
      professorRole: 'professor',
      collaboratorFunctionId: 'function-1',
      collaboratorFunctionCode: 'manager',
      contractId: req.get('x-test-contract') ?? 'contract-1',
      type: 'professor',
    };
    next();
  },
}));

jest.mock('../src/modules/access-control/index', () => ({
  screenAccessMiddleware:
    () =>
    (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
  getMostPermissiveDataScopeForProfessor: (...args: unknown[]) =>
    mockGetMostPermissiveDataScope(...args),
}));

jest.mock('../src/modules/professores/professor.service', () => ({
  professorService: {
    listByAccessScope: (...args: unknown[]) => mockListByAccessScope(...args),
  },
}));

const router = require('../src/modules/professores/professor-detail.routes').default;

describe('professor detail routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/professores', router);

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMostPermissiveDataScope.mockResolvedValue('managed');
    mockListByAccessScope.mockResolvedValue([
      { id: 'professor-visible', user: { profile: { name: 'Colaborador visível' } } },
    ]);
  });

  it('consulta o colaborador dentro do contrato e do escopo efetivo', async () => {
    const response = await request(app).get('/professores/professor-visible');

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe('professor-visible');
    expect(mockListByAccessScope).toHaveBeenCalledWith(
      'contract-1',
      'professor-actor',
      'managed',
      'all'
    );
  });

  it('retorna a mesma resposta para id inexistente ou fora do escopo', async () => {
    const missingResponse = await request(app).get('/professores/professor-missing');

    mockListByAccessScope.mockResolvedValue([]);
    const crossContractResponse = await request(app)
      .get('/professores/professor-visible')
      .set('x-test-contract', 'contract-2');

    expect(missingResponse.status).toBe(404);
    expect(crossContractResponse.status).toBe(404);
    expect(missingResponse.body.error).toBe(crossContractResponse.body.error);
  });

  it('não consulta dados quando nenhum escopo é permitido', async () => {
    mockGetMostPermissiveDataScope.mockResolvedValue(null);

    const response = await request(app).get('/professores/professor-visible');

    expect(response.status).toBe(404);
    expect(mockListByAccessScope).not.toHaveBeenCalled();
  });
});
