import { Router, type Request, type Response } from 'express';
import {
  collaboratorFunctionService,
} from './collaborator-function.service';
import { academyMasterMiddleware, authMiddleware } from '../auth/auth.middleware';
import {
  CreateCollaboratorFunctionSchema,
  UpdateCollaboratorFunctionSchema,
  sendError,
  sendSuccess,
} from '@corrida/utils';

const router: Router = Router();

router.use(authMiddleware);
router.use(academyMasterMiddleware);

router.get('/', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId;

    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    const items = await collaboratorFunctionService.listByContract(contractId);
    return sendSuccess(res, items, 'Funções recuperadas com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao carregar funções', 500);
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId;
    const validation = CreateCollaboratorFunctionSchema.safeParse(req.body);

    if (!validation.success) {
      const errors = validation.error.errors.map((item) => item.message).join(', ');
      return sendError(res, errors, 400);
    }

    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    const item = await collaboratorFunctionService.create(contractId, validation.data);
    return sendSuccess(res, item, 'Função criada com sucesso', 201);
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao criar função', 400);
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId;
    const { id } = req.params;
    const validation = UpdateCollaboratorFunctionSchema.safeParse(req.body);

    if (!validation.success) {
      const errors = validation.error.errors.map((item) => item.message).join(', ');
      return sendError(res, errors, 400);
    }

    if (!contractId) {
      return sendError(res, 'Contrato não encontrado', 404);
    }

    const item = await collaboratorFunctionService.update(contractId, id, validation.data);
    return sendSuccess(res, item, 'Função atualizada com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao atualizar função', 400);
  }
});

export default router;