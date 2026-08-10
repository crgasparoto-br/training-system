import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../auth/auth.middleware.js';
import {
  normalizeRequestedStudentContractId,
  resolveActiveStudentMembership,
  StudentAccountContextError,
} from '../alunos/student-account-context.service.js';
import {
  ensureDefaultSubjectiveScalesForContract,
  subjectiveScaleService,
} from './subjective-scale.service.js';

const router: Router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

const typeSchema = z.enum(['PSE', 'PSR']);

router.get('/', async (req: Request, res: Response) => {
  try {
    let contractId = (req as any).user.contractId as string | undefined;

    if (!contractId && (req as any).user?.userId) {
      const user = await prisma.user.findUnique({
        where: { id: (req as any).user.userId },
        include: { professor: true },
      });
      contractId = user?.professor?.contractId;
      if (!contractId && user?.type === 'aluno') {
        const membership = await resolveActiveStudentMembership(
          user.id,
          normalizeRequestedStudentContractId(req.header('x-contract-id'))
        );
        contractId = membership.contractId;
      }
    }

    if (!contractId) {
      return sendError(res, 'Contrato n?o encontrado', 404);
    }

    await ensureDefaultSubjectiveScalesForContract(contractId);

    const typeParam = req.query.type;
    const typeValue = Array.isArray(typeParam) ? typeParam[0] : typeParam;
    const type = typeValue ? typeSchema.parse(typeValue) : undefined;

    const items = await subjectiveScaleService.listByContract(contractId, type);
    return sendSuccess(res, items, 'Escalas carregadas');
  } catch (error: any) {
    if (error instanceof StudentAccountContextError) {
      return sendError(
        res,
        error.message,
        error.code === 'STUDENT_CONTRACT_CONTEXT_REQUIRED' ? 409 : 404
      );
    }
    if (error instanceof z.ZodError) {
      return sendError(res, 'Tipo de escala inválido', 400, error.errors);
    }
    console.error('Erro ao listar escalas subjetivas:', error);
    return sendError(res, 'Erro ao listar escalas subjetivas', 500);
  }
});

export default router;

