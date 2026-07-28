import { PrismaClient } from '@prisma/client';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { sendError } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import {
  assertCapacitySourceIntegrity,
  capacitySourceRefsFromBody,
  CapacitySourceIntegrityError,
} from './capacity-prescription-source-integrity.service.js';

const router: Router = Router();
const prisma = new PrismaClient();

router.post(
  '/alunos/:alunoId',
  authMiddleware,
  professorMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contractId = req.user?.contractId;
      const professorId = req.user?.professorId;
      if (!contractId || !professorId) return sendError(res, 'Não autenticado', 401);

      const sourceRefs = capacitySourceRefsFromBody(req.body);
      if (!sourceRefs) return next();

      await assertCapacitySourceIntegrity({
        client: prisma,
        contractId,
        alunoId: req.params.alunoId,
        sourceRefs,
      });
      return next();
    } catch (error) {
      if (error instanceof CapacitySourceIntegrityError) {
        return sendError(res, error.message, 400);
      }
      console.error('Erro ao validar integridade das fontes da prescrição:', error);
      return sendError(res, 'Erro ao validar fontes técnicas', 500);
    }
  }
);

export default router;
