import { Router, type Request, type Response } from 'express';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware } from '../auth/auth.middleware.js';
import { screenAccessMiddleware } from '../access-control/access-control.middleware.js';
import { getServiceCatalogImpact } from './service-impact.service.js';

const router: Router = Router();

router.get(
  '/catalog/:id/impact',
  authMiddleware,
  screenAccessMiddleware(['settings.services']),
  async (req: Request, res: Response) => {
    try {
      const contractId = (req as any).user?.contractId as string | undefined;
      if (!contractId) {
        return sendError(res, 'Contrato não encontrado', 404);
      }

      const impact = await getServiceCatalogImpact(contractId, req.params.id);
      return sendSuccess(res, impact, 'Impacto do serviço recuperado com sucesso');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao calcular impacto do serviço';
      const status = message.includes('não encontrado') ? 404 : 400;
      return sendError(res, message, status);
    }
  }
);

export default router;
