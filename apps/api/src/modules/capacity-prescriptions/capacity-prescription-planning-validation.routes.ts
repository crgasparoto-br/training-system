import { Router, type NextFunction, type Request, type Response } from 'express';
import { sendError } from '@corrida/utils';
import { canProfessorAccessBlock } from '../access-control/access-control.service.js';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import {
  CapacityPlanningValidationError,
  normalizeCapacityPlanningParameters,
} from './capacity-prescription-planning-validation.js';
import { capacityPrescriptionBoundaryPrisma as prisma } from './capacity-prescription-source-permission.routes.js';

const router: Router = Router();

router.post(
  '/alunos/:alunoId/planning',
  authMiddleware,
  professorMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
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
        !(await canProfessorAccessBlock(professor, 'plans.capacityPrescriptions.manage'))
      ) {
        return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
      }

      const body = req.body as Record<string, unknown>;
      const level = typeof body.level === 'string' ? body.level : null;
      const rawLoadCode = typeof body.loadCode === 'string' ? body.loadCode.trim() : '';

      if (rawLoadCode && level !== 'micro') {
        return sendError(res, 'Código de carga só pode ser informado para microciclo', 400);
      }

      if (rawLoadCode) {
        const loadCode = rawLoadCode.toUpperCase();
        const currentLoad = await prisma.capacityTechnicalCatalogItem.findFirst({
          where: {
            contractId,
            category: 'microcycle_load',
            code: loadCode,
            isCurrent: true,
          },
          select: { code: true },
        });
        if (!currentLoad) {
          return sendError(res, 'Código de carga do microciclo inválido ou inativo', 400);
        }
        body.loadCode = currentLoad.code;
      }

      body.capacityParameters = normalizeCapacityPlanningParameters(body.capacityParameters);
      return next();
    } catch (error) {
      if (error instanceof CapacityPlanningValidationError) {
        return sendError(res, error.message, 400);
      }
      console.error('Erro ao validar parâmetros do planejamento por capacidades:', error);
      return sendError(res, 'Erro ao validar planejamento', 500);
    }
  }
);

export default router;
