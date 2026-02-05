import { Router, Request, Response } from 'express';
import { educatorService } from './educator.service';
import { authMiddleware, masterMiddleware } from '../auth/auth.middleware';
import { CreateEducatorSchema } from '@corrida/utils';
import { sendSuccess, sendError } from '@corrida/utils';
import { z } from 'zod';

const router = Router();

router.use(authMiddleware);
router.use(masterMiddleware);

/**
 * GET /api/v1/educators
 * Listar educadores do contrato
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId;

    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    const educators = await educatorService.listByContract(contractId);

    return sendSuccess(res, educators, 'Educadores recuperados com sucesso');
  } catch (error: any) {
    console.error('Erro ao listar educadores:', error);
    return sendError(res, 'Erro ao listar educadores', 500);
  }
});

/**
 * POST /api/v1/educators
 * Criar novo educador (apenas master de academia)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const validation = CreateEducatorSchema.safeParse(req.body);

    if (!validation.success) {
      const errors = validation.error.errors.map((e) => e.message).join(', ');
      return sendError(res, errors, 400);
    }

    const contractId = (req as any).user.contractId;

    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    const educator = await educatorService.create({
      contractId,
      ...validation.data,
    });

    return sendSuccess(res, educator, 'Educador criado com sucesso', 201);
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao criar educador', 400);
  }
});

/**
 * PUT /api/v1/educators/:id
 * Atualizar educador
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractId = (req as any).user.contractId;

    const updateSchema = z.object({
      name: z.string().min(3).optional(),
      email: z.string().email().optional(),
      password: z.string().min(8).optional(),
    });

    const validation = updateSchema.safeParse(req.body);

    if (!validation.success) {
      const errors = validation.error.errors.map((e) => e.message).join(', ');
      return sendError(res, errors, 400);
    }

    const educator = await educatorService.update(contractId, id, validation.data);

    return sendSuccess(res, educator, 'Educador atualizado com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao atualizar educador', 400);
  }
});

/**
 * POST /api/v1/educators/:id/deactivate
 * Desativar educador
 */
router.post('/:id/deactivate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractId = (req as any).user.contractId;

    await educatorService.deactivate(contractId, id);

    return sendSuccess(res, null, 'Educador desativado com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao desativar educador', 400);
  }
});

/**
 * POST /api/v1/educators/:id/reset-password
 * Reset rápido de senha do educador
 */
router.post('/:id/reset-password', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractId = (req as any).user.contractId;

    const tempPassword = await educatorService.resetPassword(contractId, id);

    return sendSuccess(
      res,
      { tempPassword },
      'Senha temporária gerada com sucesso'
    );
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao resetar senha', 400);
  }
});

export default router;
