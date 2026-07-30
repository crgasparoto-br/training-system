import { PrismaClient } from '@prisma/client';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { CapacityPrescriptionSourceRef } from '@corrida/types';
import { sendError } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import {
  assertCapacitySourcePermissions,
  CapacitySourcePermissionError,
} from './capacity-prescription-source-permission.service.js';

const router: Router = Router();
export const capacityPrescriptionBoundaryPrisma = new PrismaClient();
const prisma = capacityPrescriptionBoundaryPrisma;

router.post(
  '/alunos/:alunoId',
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
      if (!professor) {
        return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
      }

      const body = req.body as Record<string, unknown>;
      const sourceRefs = Array.isArray(body.sourceRefs)
        ? (body.sourceRefs as CapacityPrescriptionSourceRef[])
        : [];
      const linkedGoalIds = Array.isArray(body.linkedProntuarioGoalIds)
        ? body.linkedProntuarioGoalIds.filter(
            (goalId): goalId is string => typeof goalId === 'string' && Boolean(goalId.trim())
          )
        : [];

      await assertCapacitySourcePermissions({
        client: prisma,
        professor,
        contractId,
        alunoId: req.params.alunoId,
        sourceRefs,
        linkedGoalIds,
      });

      return next();
    } catch (error) {
      if (error instanceof CapacitySourcePermissionError) {
        return sendError(res, error.message, 403);
      }
      console.error('Erro ao validar permissão das fontes da prescrição:', error);
      return sendError(res, 'Erro ao verificar permissão', 500);
    }
  }
);

export default router;
