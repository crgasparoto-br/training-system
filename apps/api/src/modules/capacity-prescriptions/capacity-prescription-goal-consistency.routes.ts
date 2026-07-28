import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  PHYSICAL_CAPACITY_TYPES,
  type CapacityPrescriptionSourceRef,
  type PhysicalCapacityType,
} from '@corrida/types';
import { sendError } from '@corrida/utils';
import { canProfessorAccessBlock } from '../access-control/access-control.service.js';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { capacityPrescriptionBoundaryPrisma as prisma } from './capacity-prescription-source-permission.routes.js';

const router: Router = Router();
const capacities = new Set<string>(PHYSICAL_CAPACITY_TYPES);

function normalizedIds(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ).sort();
}

export function equalGoalIdSets(left: string[], right: string[]) {
  const normalizedLeft = normalizedIds(left);
  const normalizedRight = normalizedIds(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
}

router.post(
  '/alunos/:alunoId',
  authMiddleware,
  professorMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contractId = req.user?.contractId;
      const professorId = req.user?.professorId;
      if (!contractId || !professorId) return sendError(res, 'Não autenticado', 401);

      const body = req.body as Record<string, unknown>;
      if (typeof body.capacity !== 'string' || !capacities.has(body.capacity)) return next();
      const capacity = body.capacity as PhysicalCapacityType;

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

      const sourceGoalIds = normalizedIds(
        (Array.isArray(body.sourceRefs) ? (body.sourceRefs as CapacityPrescriptionSourceRef[]) : [])
          .filter((source) => source?.type === 'prontuario_goal')
          .map((source) => source.id)
      );
      const linkedGoalIds = normalizedIds(
        Array.isArray(body.linkedProntuarioGoalIds) ? body.linkedProntuarioGoalIds : []
      );

      const canAccessGoals = await canProfessorAccessBlock(
        professor,
        'physicalAssessment.prnt.goals'
      );
      if (!canAccessGoals) {
        if (sourceGoalIds.length || linkedGoalIds.length) {
          return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
        }
        return next();
      }

      if (!equalGoalIdSets(sourceGoalIds, linkedGoalIds)) {
        return sendError(
          res,
          'Os objetivos do prontuário devem coincidir com os vínculos da versão',
          409
        );
      }

      const classifications = await prisma.prontuarioGoalCapacityClassification.findMany({
        where: {
          contractId,
          alunoId: req.params.alunoId,
          capacities: { has: capacity },
        },
        select: { goalId: true },
      });
      const classifiedGoalIds = classifications.map((classification) => classification.goalId);
      if (!equalGoalIdSets(linkedGoalIds, classifiedGoalIds)) {
        return sendError(
          res,
          'Salve as classificações dos objetivos antes de versionar a capacidade',
          409
        );
      }

      return next();
    } catch (error) {
      console.error('Erro ao validar consistência dos objetivos da prescrição:', error);
      return sendError(res, 'Erro ao validar objetivos da prescrição', 500);
    }
  }
);

export default router;
