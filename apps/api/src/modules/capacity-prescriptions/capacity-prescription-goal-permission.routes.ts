import { Router, type NextFunction, type Request, type Response } from 'express';
import { sendError } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import {
  CAPACITY_GOAL_CLASSIFICATION_READ_BLOCKS,
  CAPACITY_GOAL_CLASSIFICATION_WRITE_BLOCKS,
  canProfessorAccessCapacityBlocks,
} from './capacity-prescription-access-policy.js';
import { capacityPrescriptionBoundaryPrisma as prisma } from './capacity-prescription-source-permission.routes.js';

const router: Router = Router();

function requireGoalClassificationBlocks(blockKeys: readonly string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contractId = req.user?.contractId;
      const professorId = req.user?.professorId;
      if (!contractId || !professorId) return sendError(res, 'Não autenticado', 401);

      const professor = await prisma.professor.findFirst({
        where: { id: professorId, contractId },
        include: { collaboratorFunction: true },
      });
      if (
        !professor ||
        !(await canProfessorAccessCapacityBlocks(professor, blockKeys))
      ) {
        return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
      }
      return next();
    } catch (error) {
      console.error('Erro ao validar acesso à classificação de objetivos:', error);
      return sendError(res, 'Erro ao verificar permissão', 500);
    }
  };
}

router.get(
  '/alunos/:alunoId/goal-classifications',
  authMiddleware,
  professorMiddleware,
  requireGoalClassificationBlocks(CAPACITY_GOAL_CLASSIFICATION_READ_BLOCKS)
);

router.put(
  '/alunos/:alunoId/goals/:goalId/classification',
  authMiddleware,
  professorMiddleware,
  requireGoalClassificationBlocks(CAPACITY_GOAL_CLASSIFICATION_WRITE_BLOCKS)
);

export default router;
