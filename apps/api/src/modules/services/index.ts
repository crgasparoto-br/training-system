import { Router } from 'express';
import serviceCatalogRoutes from './service.routes.js';
import serviceImpactRoutes from './service-impact.routes.js';

export const serviceRoutes: Router = Router();
serviceRoutes.use(serviceImpactRoutes);
serviceRoutes.use(serviceCatalogRoutes);

export { serviceCatalogService } from './service.service.js';
export { getServiceCatalogImpact } from './service-impact.service.js';
