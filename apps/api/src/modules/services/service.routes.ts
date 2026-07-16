import { Router, type Request, type Response } from 'express';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, masterMiddleware } from '../auth/auth.middleware.js';
import { screenAccessMiddleware } from '../access-control/access-control.middleware.js';
import {
  SERVICE_CATALOG_BOOTSTRAP_UNAVAILABLE_MESSAGE,
  ServiceCatalogBootstrapUnavailableError,
  isServiceCatalogTransactionUnavailable,
} from './service.bootstrap-errors.js';
import legacyServiceCatalogRoutes from './service.routes-base.js';
import { serviceCatalogService } from './service.service.js';

const router: Router = Router();
const catalogWriteAccess = [
  authMiddleware,
  screenAccessMiddleware(['settings.services']),
  masterMiddleware,
] as const;

function getContractId(req: Request) {
  const contractId = (req as any).user?.contractId as string | undefined;
  if (!contractId) throw new Error('Contrato não encontrado');
  return contractId;
}

router.post('/catalog/bootstrap', ...catalogWriteAccess, async (req: Request, res: Response) => {
  try {
    const contractId = getContractId(req);
    const dryRun = req.body?.dryRun === true;
    const result = await serviceCatalogService.bootstrapReferenceCatalog(contractId, dryRun);
    return sendSuccess(
      res,
      result,
      dryRun ? 'Simulação da carga concluída' : 'Catálogo ACESSO 2026 carregado com sucesso'
    );
  } catch (error) {
    if (
      error instanceof ServiceCatalogBootstrapUnavailableError ||
      isServiceCatalogTransactionUnavailable(error)
    ) {
      const technicalError =
        error instanceof ServiceCatalogBootstrapUnavailableError
          ? error.technicalCause
          : error;
      console.error('[service-catalog-bootstrap] transaction unavailable', technicalError);
      return sendError(res, SERVICE_CATALOG_BOOTSTRAP_UNAVAILABLE_MESSAGE, 503);
    }

    const message = error instanceof Error ? error.message : 'Erro ao carregar catálogo de referência';
    const status = message.includes('não encontrado') ? 404 : 400;
    return sendError(res, message || 'Erro ao carregar catálogo de referência', status);
  }
});

router.use(legacyServiceCatalogRoutes);

export default router;
