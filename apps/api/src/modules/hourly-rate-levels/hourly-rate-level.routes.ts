import { Router, type Request, type Response } from 'express';
import { academyMasterMiddleware, authMiddleware } from '../auth/auth.middleware';
import { sendError, sendSuccess } from '@corrida/utils';
import { hourlyRateLevelService } from './hourly-rate-level.service.js';

const router: Router = Router();

router.use(authMiddleware);
router.use(academyMasterMiddleware);

router.get('/', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;

    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    const items = await hourlyRateLevelService.listByContract(contractId);
    return sendSuccess(res, items, 'Níveis de valor/hora carregados com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao carregar níveis de valor/hora', 500);
  }
});

router.put('/', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    const levels = Array.isArray(req.body?.levels) ? req.body.levels : null;

    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    if (!levels) {
      return sendError(res, 'Envie as faixas dos níveis de valor/hora', 400);
    }

    const normalizedLevels = levels.map((level: any) => ({
      code: typeof level?.code === 'string' ? level.code.trim().toLowerCase() : '',
      minValue:
        level?.minValue === null || level?.minValue === undefined || level?.minValue === ''
          ? null
          : Number(level.minValue),
      maxValue:
        level?.maxValue === null || level?.maxValue === undefined || level?.maxValue === ''
          ? null
          : Number(level.maxValue),
    }));

    const items = await hourlyRateLevelService.updateByContract(contractId, normalizedLevels as any);
    return sendSuccess(res, items, 'Níveis de valor/hora atualizados com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao atualizar níveis de valor/hora', 400);
  }
});

export default router;