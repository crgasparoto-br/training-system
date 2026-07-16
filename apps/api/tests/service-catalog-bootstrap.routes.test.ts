import express from 'express';
import {
  SERVICE_CATALOG_BOOTSTRAP_UNAVAILABLE_MESSAGE,
  ServiceCatalogBootstrapUnavailableError,
} from '../src/modules/services/service.bootstrap-errors.js';

const request = require('supertest');

const mockBootstrapReferenceCatalog = jest.fn();

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: 'user-1',
      email: 'master@example.com',
      type: 'professor',
      professorId: 'professor-1',
      professorRole: 'master',
      contractId: 'contract-1',
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
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../src/modules/services/service.service', () => ({
  serviceCatalogService: {
    bootstrapReferenceCatalog: mockBootstrapReferenceCatalog,
  },
}));

const serviceCatalogRouter = require('../src/modules/services/service.routes').default;

describe('service catalog bootstrap route failures', () => {
  const app = express();
  app.use(express.json());
  app.use('/services', serviceCatalogRouter);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 503 with a safe message and keeps the technical error only in logs', async () => {
    const technicalError = new Error(
      'Invalid prisma invocation: Transaction not found for internal transaction tx-secret'
    );
    mockBootstrapReferenceCatalog.mockRejectedValue(
      new ServiceCatalogBootstrapUnavailableError(technicalError)
    );
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(app)
      .post('/services/catalog/bootstrap')
      .send({ dryRun: false });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe(SERVICE_CATALOG_BOOTSTRAP_UNAVAILABLE_MESSAGE);
    expect(JSON.stringify(response.body)).not.toContain('tx-secret');
    expect(JSON.stringify(response.body)).not.toContain('Prisma');
    expect(consoleError).toHaveBeenCalledWith(
      '[service-catalog-bootstrap] transaction unavailable',
      technicalError
    );

    consoleError.mockRestore();
  });
});
