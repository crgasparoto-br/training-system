import express from 'express';

const request = require('supertest');

let mockHasAccess = true;
let mockContractId: string | undefined = 'contract-1';

const serviceCatalogServiceMock = {
  listCatalog: jest.fn(),
  getCatalogDetail: jest.fn(),
  bootstrapReferenceCatalog: jest.fn(),
  createCatalogService: jest.fn(),
  updateCatalogService: jest.fn(),
  createCommercialOption: jest.fn(),
  updateCommercialOption: jest.fn(),
  reorderCommercialOptions: jest.fn(),
  createPresentationItem: jest.fn(),
  updatePresentationItem: jest.fn(),
  reorderPresentationItems: jest.fn(),
  createPlanComponent: jest.fn(),
  updatePlanComponent: jest.fn(),
  reorderPlanComponents: jest.fn(),
  listByContract: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: 'user-1',
      email: 'master@example.com',
      type: 'professor',
      professorId: 'professor-1',
      professorRole: 'master',
      contractId: mockContractId,
    };
    next();
  },
  masterMiddleware: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

jest.mock('../src/modules/access-control/access-control.middleware', () => ({
  screenAccessMiddleware:
    () => (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!mockHasAccess) {
        return res.status(403).json({ success: false, error: 'Acesso negado' });
      }
      return next();
    },
}));

jest.mock('../src/modules/services/service.service', () => ({
  serviceCatalogService: serviceCatalogServiceMock,
}));

const serviceCatalogRouter = require('../src/modules/services/service.routes').default;

function optionList(ids: string[]) {
  return ids.map((id, displayOrder) => ({ id, displayOrder }));
}

describe('service catalog routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/services', serviceCatalogRouter);

  beforeEach(() => {
    mockHasAccess = true;
    mockContractId = 'contract-1';
    jest.clearAllMocks();
    serviceCatalogServiceMock.listCatalog.mockResolvedValue([]);
    serviceCatalogServiceMock.getCatalogDetail.mockResolvedValue({ id: 'service-1' });
    serviceCatalogServiceMock.createCatalogService.mockResolvedValue({ id: 'service-new' });
    serviceCatalogServiceMock.reorderCommercialOptions.mockImplementation(
      async (_contractId: string, _serviceId: string, ids: string[]) => optionList(ids)
    );
  });

  it('uses the authenticated contract for catalog reads and writes', async () => {
    const listResponse = await request(app).get('/services/catalog?includeInactive=true');
    const createResponse = await request(app)
      .post('/services/catalog')
      .send({
        name: 'Serviço Teste',
        code: 'servico_teste',
        category: 'individual_service',
      });

    expect(listResponse.status).toBe(200);
    expect(createResponse.status).toBe(201);
    expect(serviceCatalogServiceMock.listCatalog).toHaveBeenCalledWith('contract-1', true);
    expect(serviceCatalogServiceMock.createCatalogService).toHaveBeenCalledWith(
      'contract-1',
      expect.objectContaining({ code: 'servico_teste' })
    );
  });

  it('returns 403 and does not execute when settings.services is denied', async () => {
    mockHasAccess = false;

    const response = await request(app).get('/services/catalog');

    expect(response.status).toBe(403);
    expect(serviceCatalogServiceMock.listCatalog).not.toHaveBeenCalled();
  });

  it('returns a safe 503 when the database connection limit is exhausted', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    serviceCatalogServiceMock.listCatalog.mockRejectedValue(
      Object.assign(
        new Error('FATAL: too many connections for role "prisma_migration"'),
        { code: 'P2037' }
      )
    );

    const response = await request(app).get('/services/catalog');

    expect(response.status).toBe(503);
    expect(response.body.error).toBe(
      'O banco de dados está temporariamente sem conexões disponíveis. Tente novamente em instantes.'
    );
    expect(JSON.stringify(response.body)).not.toContain('prisma_migration');
    expect(JSON.stringify(response.body)).not.toContain('P2037');
    consoleSpy.mockRestore();
  });

  it('does not reveal an id from another contract', async () => {
    serviceCatalogServiceMock.getCatalogDetail.mockRejectedValue(
      new Error('Serviço não encontrado')
    );

    const response = await request(app).get(
      '/services/catalog/service-from-contract-b'
    );

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Serviço não encontrado');
    expect(serviceCatalogServiceMock.getCatalogDetail).toHaveBeenCalledWith(
      'contract-1',
      'service-from-contract-b'
    );
  });

  it('returns the standard 400 response for an invalid creation payload', async () => {
    const response = await request(app)
      .post('/services/catalog')
      .send({ name: 'x', code: '', category: 'unknown' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Dados inválidos');
    expect(serviceCatalogServiceMock.createCatalogService).not.toHaveBeenCalled();
  });

  it.each([
    [['option-a', 'option-a'], 'IDs duplicados'],
    [['option-a'], 'sequência completa'],
    [['option-a', 'option-from-contract-b'], 'Item não encontrado'],
  ])('rejects invalid reorder batches: %j', async (ids, message) => {
    serviceCatalogServiceMock.reorderCommercialOptions.mockRejectedValue(
      new Error(message)
    );

    const response = await request(app)
      .put('/services/catalog/service-1/options/reorder')
      .send({ ids });

    expect(response.status).toBe(message.includes('não encontrado') ? 404 : 400);
    expect(response.body.error).toBe(message);
  });

  it('keeps positions contiguous after repeated or competing reorder requests', async () => {
    const first = request(app)
      .put('/services/catalog/service-1/options/reorder')
      .send({ ids: ['option-c', 'option-a', 'option-b'] });
    const second = request(app)
      .put('/services/catalog/service-1/options/reorder')
      .send({ ids: ['option-b', 'option-c', 'option-a'] });

    const [firstResponse, secondResponse] = await Promise.all([first, second]);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    for (const response of [firstResponse, secondResponse]) {
      expect(response.body.data.map((item: { displayOrder: number }) => item.displayOrder)).toEqual([
        0,
        1,
        2,
      ]);
    }
  });
});
