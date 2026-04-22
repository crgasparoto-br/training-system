import { Router, Request, Response } from 'express';
import { professorService } from './professor.service';
import { academyMasterMiddleware, authMiddleware } from '../auth/auth.middleware';
import { CreateProfessorSchema, UpdateProfessorSchema } from '@corrida/utils';
import { sendSuccess, sendError } from '@corrida/utils';

const router: Router = Router();

router.use(authMiddleware);
router.use(academyMasterMiddleware);

/**
 * GET /api/v1/professores
 * Listar professores do contrato
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const contractId = (req as any).user.contractId;
    const rawStatus = req.query.status as string | undefined;
    const status = rawStatus === 'active' || rawStatus === 'inactive' ? rawStatus : 'all';

    if (!contractId) {
      return sendError(res, 'Contrato nÃ£o encontrado', 404);
    }

    const professores = await professorService.listByContract(contractId, status);

    return sendSuccess(res, professores, 'Professores recuperados com sucesso');
  } catch (error: any) {
    console.error('Erro ao listar professores:', error);
    return sendError(res, 'Erro ao listar professores', 500);
  }
});

/**
 * POST /api/v1/professores
 * Criar novo professor (apenas master de academia)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const validation = CreateProfessorSchema.safeParse(req.body);

    if (!validation.success) {
      const errors = validation.error.errors.map((e) => e.message).join(', ');
      return sendError(res, errors, 400);
    }

    const contractId = (req as any).user.contractId;
    const actorProfessorId = (req as any).user.professorId;

    if (!contractId) {
      return sendError(res, 'Contrato nÃ£o encontrado', 404);
    }

    const professor = await professorService.create({
      contractId,
      actorProfessorId,
      ...validation.data,
    });

    return sendSuccess(res, professor, 'Professor criado com sucesso', 201);
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao criar professor', 400);
  }
});

/**
 * PUT /api/v1/professores/:id
 * Atualizar professor
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractId = (req as any).user.contractId;
    const actorProfessorId = (req as any).user.professorId;

    const validation = UpdateProfessorSchema.safeParse(req.body);

    if (!validation.success) {
      const errors = validation.error.errors.map((e) => e.message).join(', ');
      return sendError(res, errors, 400);
    }

    const professor = await professorService.update(contractId, id, {
      actorProfessorId,
      ...validation.data,
    });

    return sendSuccess(res, professor, 'Professor atualizado com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao atualizar professor', 400);
  }
});

/**
 * POST /api/v1/professores/:id/legal-financial/validate
 * Validar bloco juridico e financeiro do colaborador
 */
router.post('/:id/legal-financial/validate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractId = (req as any).user.contractId;
    const validatorProfessorId = (req as any).user.professorId;

    const professor = await professorService.validateLegalFinancial(
      contractId,
      id,
      validatorProfessorId
    );

    return sendSuccess(res, professor, 'Dados juridicos e financeiros validados com sucesso');
  } catch (error: any) {
    return sendError(
      res,
      error.message || 'Erro ao validar dados juridicos e financeiros',
      400
    );
  }
});

/**
 * POST /api/v1/professores/:id/deactivate
 * Desativar professor
 */
router.post('/:id/deactivate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractId = (req as any).user.contractId;

    await professorService.deactivate(contractId, id);

    return sendSuccess(res, null, 'Professor desativado com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao desativar professor', 400);
  }
});

/**
 * POST /api/v1/professores/:id/activate
 * Reativar professor
 */
router.post('/:id/activate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractId = (req as any).user.contractId;

    await professorService.activate(contractId, id);

    return sendSuccess(res, null, 'Professor reativado com sucesso');
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao reativar professor', 400);
  }
});

/**
 * POST /api/v1/professores/:id/reset-password
 * Reset rÃ¡pido de senha do professor
 */
router.post('/:id/reset-password', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractId = (req as any).user.contractId;

    const tempPassword = await professorService.resetPassword(contractId, id);

    return sendSuccess(
      res,
      { tempPassword },
      'Senha temporÃ¡ria gerada com sucesso'
    );
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao resetar senha', 400);
  }
});

export default router;

