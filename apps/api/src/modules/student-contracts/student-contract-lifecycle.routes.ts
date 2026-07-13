import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { blockAccessMiddleware } from '../access-control/access-control.middleware.js';
import { serializeStudentContractActivation } from './student-contract-activation-response.js';
import { studentContractLifecycleService } from './student-contract-lifecycle.service.js';

const router: Router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);
router.use(professorMiddleware);

router.post(
  '/:id/contracts/:studentContractId/activate',
  blockAccessMiddleware('students.actions.manageFinancialContract'),
  async (req: Request, res: Response) => {
    try {
      const { id: alunoId, studentContractId } = req.params;
      const companyContractId = (req as any).user.contractId as string | undefined;
      const professorId = (req as any).user.professorId as string | undefined;
      const professorRole = (req as any).user.professorRole as 'master' | 'professor' | undefined;

      if (!companyContractId || !professorId) {
        return sendError(res, 'Contexto do professor não encontrado', 404);
      }

      const candidate = await prisma.studentContract.findFirst({
        where: {
          id: studentContractId,
          alunoId,
          contract: {
            companyContractId,
          },
        },
        include: {
          aluno: {
            select: {
              professorId: true,
              professor: {
                select: {
                  responsibleManagerId: true,
                },
              },
            },
          },
        },
      });

      if (!candidate) {
        return sendError(res, 'Vínculo de contrato do aluno não encontrado', 404);
      }

      const canManageAluno =
        professorRole === 'master' ||
        candidate.aluno.professorId === professorId ||
        candidate.aluno.professor.responsibleManagerId === professorId;

      if (!canManageAluno) {
        return sendError(res, 'Aluno não encontrado ou não pertence ao seu acesso', 404);
      }

      const lifecycleResult = await studentContractLifecycleService.prepareOrActivateStudentContract(
        studentContractId
      );
      const result = serializeStudentContractActivation(lifecycleResult);

      return sendSuccess(
        res,
        result,
        result.reason === 'awaiting_signature'
          ? 'Substituição preparada. O contrato vigente será mantido até a assinatura do novo documento.'
          : result.reason === 'scheduled_start'
            ? 'Contrato assinado e programado. O vigente será mantido até a data de início.'
            : 'Contrato assinado e colocado em vigor com sucesso.'
      );
    } catch (error: any) {
      return sendError(res, error.message || 'Erro ao processar vigência do contrato', 400);
    }
  }
);

export default router;
