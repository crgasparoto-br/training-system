import { bootstrapReferenceCatalog } from './service.bootstrap.js';
import { serviceCatalogService as baseServiceCatalogService } from './service.service-base.js';

export const serviceCatalogService = Object.assign(baseServiceCatalogService, {
  bootstrapReferenceCatalog,
});
