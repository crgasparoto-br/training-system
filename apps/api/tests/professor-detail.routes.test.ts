import express from 'express';

const request = require('supertest');

const mockFindByAccessScope = jest.fn();
const mockGetMostPermissiveDataScope = jest.fn();
let mockScreenAllowed = true;

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
    (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!mockScreenAllowed) {
        res.status(403).json({ success: false, error: 'Acesso negado' });
        return;
      }
      next();
    },
  getMostPermissiveDataScopeForProfessor: (...args: unknown[]) =>
    mockGetMostPermissiveDataScope(...args),
}));

jest.mock('../src/modules/professores/professor-access-query.service', () => ({
  professorAccessQueryService: {
    findByAccessScope: (...args: unknown[]) => mockFindByAccessScope(...args),
  },
}));

const router = require('../src/modules/professores/professor-detail.routes').default;

describe('professor detail routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/professores', router);
  app.put('/professores/:id', (_req, res) => res.status(204).end());

  beforeEach(() => {
    jest.clearAllMocks();
    mockScreenAllowed = true;
    mockGetMostPermissiveDataScope.mockResolvedValue('managed');
    mockFindByAccessScope.mockImplementation(
      async (_contractId, _actorProfessorId, _scope, professorId) =>
        professorId === 'professor-visible'
          ? { id: 'professor-visible', user: { profile: { name: 'Colaborador visível' } } }
          : null
    );
  });

  it('consulta o colaborador dentro do contrato e do escopo efetivo', async () => {
    const response = await request(app).get('/professores/professor-visible');

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe('professor-visible');
    expect(mockFindByAccessScope).toHaveBeenCalledWith(
      'contract-1',
      'professor-actor',
      'managed',
      'professor-visible'
    );
  });

  it('retorna a mesma resposta para id inexistente ou fora do escopo', async () => {
    const missingResponse = await request(app).get('/professores/professor-missing');

    mockFindByAccessScope.mockResolvedValue(null);
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
    expect(mockFindByAccessScope).not.toHaveBeenCalled();
  });

  it('nega a leitura individual sem permissão de tela', async () => {
    mockScreenAllowed = false;

    const response = await request(app).get('/professores/professor-visible');

    expect(response.status).toBe(403);
    expect(mockGetMostPermissiveDataScope).not.toHaveBeenCalled();
    expect(mockFindByAccessScope).not.toHaveBeenCalled();
  });

  it('permite que a atualização continue somente para registro acessível', async () => {
    const response = await request(app)
      .put('/professores/professor-visible')
      .send({ name: 'Atualizado' });

    expect(response.status).toBe(204);
    expect(mockGetMostPermissiveDataScope).toHaveBeenCalledWith(
      expect.anything(),
      ['collaborators.registration']
    );
  });

  it('retorna 404 uniforme ao atualizar id inexistente ou de outro tenant', async () => {
    const missingResponse = await request(app)
      .put('/professores/professor-missing')
      .send({ name: 'Atualizado' });

    mockFindByAccessScope.mockResolvedValue(null);
    const crossContractResponse = await request(app)
      .put('/professores/professor-visible')
      .set('x-test-contract', 'contract-2')
      .send({ name: 'Atualizado' });

    expect(missingResponse.status).toBe(404);
    expect(crossContractResponse.status).toBe(404);
    expect(missingResponse.body.error).toBe('Colaborador não encontrado');
    expect(crossContractResponse.body.error).toBe('Colaborador não encontrado');
  });
});
