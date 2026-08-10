import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  CAPACITY_PRESCRIPTION_STATUSES,
  PHYSICAL_CAPACITY_TYPES,
  type PhysicalCapacityType,
} from '@corrida/types';
import { sendError } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { capacityPrescriptionBoundaryPrisma as prisma } from './capacity-prescription-source-permission.routes.js';

const router: Router = Router();
const capacities = new Set<string>(PHYSICAL_CAPACITY_TYPES);
const statuses = new Set<string>(CAPACITY_PRESCRIPTION_STATUSES);

router.post(
  '/alunos/:alunoId',
  authMiddleware,
  professorMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contractId = req.user?.contractId;
      if (!contractId) return sendError(res, 'Não autenticado', 401);

      const body = req.body as Record<string, unknown>;
      if (typeof body.capacity !== 'string' || !capacities.has(body.capacity)) return next();

      const hasExplicitStatus = body.status !== undefined;
      if (
        hasExplicitStatus &&
        (typeof body.status !== 'string' || !statuses.has(body.status))
      ) {
        return next();
      }

      const needsStatus = !hasExplicitStatus;
      const needsExpectedVersion = body.expectedCurrentVersion === undefined;
      if (!needsStatus && !needsExpectedVersion) return next();

      const capacity = body.capacity as PhysicalCapacityType;
      const existing = await prisma.capacityPrescription.findUnique({
        where: {
          contractId_alunoId_capacity: {
            contractId,
            alunoId: req.params.alunoId,
            capacity,
          },
        },
        select: { status: true, currentVersion: true },
      });

      if (needsExpectedVersion && existing) {
        return sendError(res, 'A prescrição foi alterada por outro usuário', 409);
      }

      if (needsStatus) {
        body.status = existing?.status ?? 'planned';
      }
      if (needsExpectedVersion) {
        body.expectedCurrentVersion = 0;
      }
      return next();
    } catch (error) {
      console.error('Erro ao normalizar status da prescrição por capacidade:', error);
      return sendError(res, 'Erro ao validar status da prescrição', 500);
    }
  }
);

export default router;
