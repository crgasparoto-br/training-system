import { Router, type Request, type Response } from 'express';
import {
  academyMasterMiddleware,
  authMiddleware,
  professorMiddleware,
} from '../auth/auth.middleware';
import { sendError, sendSuccess } from '@corrida/utils';
import { hourlyRateLevelService } from './hourly-rate-level.service.js';

const router: Router = Router();

router.use(authMiddleware);

router.get('/', professorMiddleware, async (req: Request, res: Response) => {
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

router.post('/', academyMasterMiddleware, async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;

    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    const items = await hourlyRateLevelService.createByContract(contractId);
    return sendSuccess(res, items, 'Nível de valor/hora criado com sucesso', 201);
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao criar nível de valor/hora', 400);
  }
});

router.put('/', academyMasterMiddleware, async (req: Request, res: Response) => {
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
      id: typeof level?.id === 'string' ? level.id.trim() : '',
      code: typeof level?.code === 'string' ? level.code.trim().toLowerCase() : '',
      label: typeof level?.label === 'string' ? level.label.trim() : '',
      order: typeof level?.order === 'number' && Number.isFinite(level.order) ? level.order : 0,
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

router.delete('/:id', academyMasterMiddleware, async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    const levelId = typeof req.params.id === 'string' ? req.params.id.trim() : '';

    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    if (!levelId) {
      return sendError(res, 'Nível de valor/hora não encontrado', 404);
    }

    const items = await hourlyRateLevelService.deleteByContract(contractId, levelId);
    return sendSuccess(res, items, 'Nível de valor/hora excluído com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao excluir nível de valor/hora', 400);
  }
});

export default router;
