import { PrismaClient } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import type { AccessDataScope } from '@corrida/types';
import {
  canProfessorAccessBlock,
  getEffectiveDataScopeForProfessor,
} from '../access-control/access-control.service.js';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { CapacityPrescriptionDomainError } from './capacity-prescription.service.js';
import { capacityResistedTechnicalExerciseVersionService } from './capacity-resisted-technical-exercise-version.service.js';

const router: Router = Router();
const prisma = new PrismaClient();

const commandSchema = z
  .object({
    expectedCurrentVersion: z.number().int().nonnegative(),
    technicalCatalogItemIds: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

function handleError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) return sendError(res, 'Dados inválidos', 400, error.errors);
  if (error instanceof CapacityPrescriptionDomainError) {
    if (error.code === 'NOT_FOUND') return sendError(res, 'Recurso não encontrado', 404);
    if (error.code === 'FORBIDDEN') return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
    if (error.code === 'CONFLICT') return sendError(res, error.message, 409);
    return sendError(res, error.message, 400);
  }
  console.error('Erro ao vincular exercícios técnicos à capacidade resistida:', error);
  return sendError(res, 'Erro ao vincular exercícios técnicos à capacidade resistida', 500);
}

async function assertAlunoScope(
  contractId: string,
  professorId: string,
  dataScope: AccessDataScope,
  alunoId: string
) {
  const aluno = await prisma.aluno.findFirst({
    where: { id: alunoId, contractId },
    select: { id: true, professorId: true },
  });
  if (!aluno) return false;
  if (dataScope === 'contract' || aluno.professorId === professorId) return true;
  if (dataScope !== 'managed' || !aluno.professorId) return false;
  const responsible = await prisma.professor.findFirst({
    where: { id: aluno.professorId, contractId },
    select: { responsibleManagerId: true },
  });
  return responsible?.responsibleManagerId === professorId;
}

router.patch(
  '/alunos/:alunoId/resisted/:prescriptionId/technical-exercises',
  authMiddleware,
  professorMiddleware,
  async (req: Request, res: Response) => {
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
      const dataScope = await getEffectiveDataScopeForProfessor(professor, 'plans');
      if (
        !dataScope ||
        !(await assertAlunoScope(contractId, professorId, dataScope, req.params.alunoId))
      ) {
        return sendError(res, 'Recurso não encontrado', 404);
      }

      const command = commandSchema.parse(req.body);
      const updated =
        await capacityResistedTechnicalExerciseVersionService.versionTechnicalExercises(
          {
            contractId,
            actorProfessorId: professorId,
            alunoId: req.params.alunoId,
          },
          req.params.prescriptionId,
          command.expectedCurrentVersion,
          command.technicalCatalogItemIds
        );
      return sendSuccess(res, updated, 'Referências técnicas de exercícios versionadas', 201);
    } catch (error) {
      return handleError(res, error);
    }
  }
);

export default router;
