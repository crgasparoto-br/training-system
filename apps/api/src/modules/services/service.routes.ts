import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { CreateServiceSchema, UpdateServiceSchema, sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, masterMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { serviceCatalogService } from './service.service.js';

const router: Router = Router();

router.get('/', authMiddleware, professorMiddleware, async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    const includeInactive = req.query.includeInactive === 'true';

    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    const items = await serviceCatalogService.listByContract(contractId, includeInactive);
    return sendSuccess(res, items, 'Serviços recuperados com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao carregar serviços', 500);
  }
});

router.post('/', authMiddleware, masterMiddleware, async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    const validated = CreateServiceSchema.parse(req.body);

    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    const item = await serviceCatalogService.create(contractId, validated);
    return sendSuccess(res, item, 'Serviço criado com sucesso', 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }

    return sendError(res, error.message || 'Erro ao criar serviço', 400);
  }
});

router.put('/:id', authMiddleware, masterMiddleware, async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId as string | undefined;
    const { id } = req.params;
    const validated = UpdateServiceSchema.parse(req.body);

    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    const item = await serviceCatalogService.update(contractId, id, validated);
    return sendSuccess(res, item, 'Serviço atualizado com sucesso');
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Dados inválidos', 400, error.errors);
    }

    return sendError(res, error.message || 'Erro ao atualizar serviço', 400);
  }
});

export default router;
