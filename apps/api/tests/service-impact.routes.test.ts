import express from 'express';

const request = require('supertest');

let mockHasAccess = true;
let mockContractId: string | undefined = 'contract-1';

const mockGetServiceCatalogImpact = jest.fn();
const mockGetCommercialOptionImpact = jest.fn();
const mockAssertActiveCatalogComponentTarget = jest.fn();
const mockUpdateCatalogServiceWithImpact = jest.fn();
const mockUpdateCommercialOptionWithImpact = jest.fn();
const mockCreatePlanComponent = jest.fn();
const mockUpdatePlanComponent = jest.fn();

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

jest.mock('../src/modules/services/service-impact.service', () => ({
  getServiceCatalogImpact: mockGetServiceCatalogImpact,
  getCommercialOptionImpact: mockGetCommercialOptionImpact,
  assertActiveCatalogComponentTarget: mockAssertActiveCatalogComponentTarget,
}));

jest.mock('../src/modules/services/service-catalog-guarded-update.service', () => ({
  updateCatalogServiceWithImpact: mockUpdateCatalogServiceWithImpact,
  updateCommercialOptionWithImpact: mockUpdateCommercialOptionWithImpact,
}));

jest.mock('../src/modules/services/service.service', () => ({
  serviceCatalogService: {
    createPlanComponent: mockCreatePlanComponent,
    updatePlanComponent: mockUpdatePlanComponent,
  },
}));

const serviceImpactRouter = require('../src/modules/services/service-impact.routes').default;

const serviceImpact = {
  contractId: 'contract-1',
  serviceId: 'service-1',
  serviceIsActive: true,
  resourceUpdatedAt: '2026-07-13T12:00:00.000Z',
  alunos: 1,
  studentContracts: 1,
  contractTemplates: 0,
  generatedContracts: 0,
  planComponentsOwned: 0,
  planComponentsTargetingService: 2,
  planComponentsTargetingOptions: 0,
  affectedPlans: 2,
  totalReferences: 4,
  options: [],
};

const optionImpact = {
  contractId: 'contract-1',
  serviceId: 'service-1',
  optionId: 'option-1',
  optionIsActive: true,
  resourceUpdatedAt: '2026-07-13T12:00:00.000Z',
  affectedPlans: 1,
};

describe('service catalog impact routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/services', serviceImpactRouter);

  beforeEach(() => {
    mockHasAccess = true;
    mockContractId = 'contract-1';
    jest.clearAllMocks();
    mockGetServiceCatalogImpact.mockResolvedValue(serviceImpact);
    mockGetCommercialOptionImpact.mockResolvedValue(optionImpact);
    mockAssertActiveCatalogComponentTarget.mockResolvedValue(undefined);
    mockUpdateCatalogServiceWithImpact.mockResolvedValue({
      id: 'service-1',
      isActive: false,
    });
    mockUpdateCommercialOptionWithImpact.mockResolvedValue({
      id: 'option-1',
      isActive: false,
    });
    mockCreatePlanComponent.mockResolvedValue({ id: 'component-1' });
    mockUpdatePlanComponent.mockResolvedValue({ id: 'component-1' });
  });

  it('uses the authenticated contract when reading service impact', async () => {
    const response = await request(app).get('/services/catalog/service-1/impact');

    expect(response.status).toBe(200);
    expect(mockGetServiceCatalogImpact).toHaveBeenCalledWith('contract-1', 'service-1');
    expect(response.body.data.affectedPlans).toBe(2);
  });

  it('does not execute the operation when settings.services is denied', async () => {
    mockHasAccess = false;

    const response = await request(app).get('/services/catalog/service-1/impact');

    expect(response.status).toBe(403);
    expect(mockGetServiceCatalogImpact).not.toHaveBeenCalled();
  });

  it('returns a generic not-found response for an id outside the authenticated contract', async () => {
    mockGetServiceCatalogImpact.mockRejectedValue(new Error('Serviço não encontrado'));

    const response = await request(app).get('/services/catalog/service-from-contract-b/impact');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Serviço não encontrado');
    expect(mockGetServiceCatalogImpact).toHaveBeenCalledWith(
      'contract-1',
      'service-from-contract-b'
    );
  });

  it('rejects invalid service update payload before calling the service', async () => {
    const response = await request(app)
      .put('/services/catalog/service-1')
      .send({ name: 'x' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Dados inválidos');
    expect(mockUpdateCatalogServiceWithImpact).not.toHaveBeenCalled();
  });

  it('returns the guarded conflict when impact confirmation is missing', async () => {
    const conflict = Object.assign(
      new Error('Revise e confirme o impacto atualizado antes de inativar este item'),
      { statusCode: 409 }
    );
    mockUpdateCatalogServiceWithImpact.mockRejectedValue(conflict);

    const response = await request(app)
      .put('/services/catalog/service-1')
      .send({ isActive: false });

    expect(response.status).toBe(409);
    expect(mockUpdateCatalogServiceWithImpact).toHaveBeenCalledWith(
      'contract-1',
      'service-1',
      { isActive: false }
    );
  });

  it('passes the observed version and exact count to the guarded service update', async () => {
    const impactConfirmation = {
      resourceUpdatedAt: '2026-07-13T12:00:00.000Z',
      affectedPlans: 2,
    };

    const response = await request(app)
      .put('/services/catalog/service-1')
      .send({ isActive: false, impactConfirmation });

    expect(response.status).toBe(200);
    expect(mockUpdateCatalogServiceWithImpact).toHaveBeenCalledWith(
      'contract-1',
      'service-1',
      { isActive: false, impactConfirmation }
    );
  });

  it('passes exact impact confirmation to the guarded option update', async () => {
    const impactConfirmation = {
      resourceUpdatedAt: '2026-07-13T12:00:00.000Z',
      affectedPlans: 1,
    };

    const response = await request(app)
      .put('/services/catalog/options/option-1')
      .send({ isActive: false, impactConfirmation });

    expect(response.status).toBe(200);
    expect(mockUpdateCommercialOptionWithImpact).toHaveBeenCalledWith(
      'contract-1',
      'option-1',
      { isActive: false, impactConfirmation }
    );
  });

  it('blocks a new component when its target is inactive or belongs to another contract', async () => {
    mockAssertActiveCatalogComponentTarget.mockRejectedValue(
      new Error('O serviço selecionado está inativo ou não pertence a este contrato')
    );

    const response = await request(app)
      .post('/services/catalog/plan-1/components')
      .send({ targetServiceId: 'service-from-contract-b' });

    expect(response.status).toBe(400);
    expect(mockCreatePlanComponent).not.toHaveBeenCalled();
  });
});
