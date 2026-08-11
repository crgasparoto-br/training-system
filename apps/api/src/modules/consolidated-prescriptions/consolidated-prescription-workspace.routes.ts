import { PrismaClient } from '@prisma/client';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { sendError, sendSuccess } from '@corrida/utils';
import type { AccessDataScope, ConsolidatedPrescriptionCapacityCandidate } from '@corrida/types';
import {
  canProfessorAccessBlock,
  getEffectiveDataScopeForProfessor,
} from '../access-control/access-control.service.js';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { consolidatedPrescriptionService } from './consolidated-prescription.service.js';
import { consolidatedPrescriptionReadService } from './consolidated-prescription-read.service.js';

const router: Router = Router();
const prisma = new PrismaClient();

type ConsolidatedActor = {
  contractId: string;
  professorId: string;
  dataScope: AccessDataScope;
};

type ConsolidatedRequest = Request & { consolidatedActor?: ConsolidatedActor };

function requireWorkspaceView(req: ConsolidatedRequest, res: Response, next: NextFunction) {
  void (async () => {
    try {
      const contractId = req.user?.contractId;
      const professorId = req.user?.professorId;
      if (!contractId || !professorId) {
        sendError(res, 'Não autenticado', 401);
        return;
      }

      const professor = await prisma.professor.findFirst({
        where: { id: professorId, contractId },
        include: { collaboratorFunction: true },
      });
      if (
        !professor ||
        !(await canProfessorAccessBlock(professor, 'plans.consolidatedPrescriptions.view'))
      ) {
        sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
        return;
      }

      const dataScope = await getEffectiveDataScopeForProfessor(professor, 'plans');
      if (!dataScope) {
        sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
        return;
      }

      req.consolidatedActor = { contractId, professorId, dataScope };
      next();
    } catch (error) {
      console.error('Erro ao validar acesso ao workspace da montagem consolidada:', error);
      sendError(res, 'Erro ao verificar permissão', 500);
    }
  })();
}

async function alunoAllowed(actor: ConsolidatedActor, alunoId: string) {
  const aluno = await prisma.aluno.findFirst({
    where: { id: alunoId, contractId: actor.contractId },
    select: { id: true, professorId: true },
  });
  if (!aluno) return false;
  if (actor.dataScope === 'contract') return true;
  if (!aluno.professorId) return false;
  if (aluno.professorId === actor.professorId) return true;
  if (actor.dataScope !== 'managed') return false;

  const responsibleProfessor = await prisma.professor.findFirst({
    where: { id: aluno.professorId, contractId: actor.contractId },
    select: { responsibleManagerId: true },
  });
  return responsibleProfessor?.responsibleManagerId === actor.professorId;
}

router.get(
  '/alunos/:alunoId/workspace',
  authMiddleware,
  professorMiddleware,
  requireWorkspaceView,
  async (req: ConsolidatedRequest, res: Response) => {
    try {
      const actor = req.consolidatedActor;
      if (!actor || !(await alunoAllowed(actor, req.params.alunoId))) {
        return sendError(res, 'Recurso não encontrado', 404);
      }

      const context = {
        contractId: actor.contractId,
        alunoId: req.params.alunoId,
        actorProfessorId: actor.professorId,
      };
      const current = await consolidatedPrescriptionService.getCurrent(context);
      const workspace = await consolidatedPrescriptionReadService.getWorkspaceContext(
        context,
        current?.latestVersion.responsibleProfessorId ?? null
      );
      if (!workspace) return sendError(res, 'Recurso não encontrado', 404);

      let capacityCandidates: ConsolidatedPrescriptionCapacityCandidate[] = [];
      let capacityCandidatesError: string | null = null;
      try {
        capacityCandidates = await consolidatedPrescriptionReadService.listCapacityCandidates(context);
      } catch (error) {
        console.error('Erro parcial ao carregar candidatos de capacidade da montagem:', error);
        capacityCandidatesError = 'Não foi possível carregar a elegibilidade das capacidades. A montagem e o histórico permanecem disponíveis; tente recarregar antes de editar.';
      }
      return sendSuccess(
        res,
        { ...workspace, capacityCandidates, capacityCandidatesError },
        'Contexto autoritativo da montagem consolidada carregado'
      );
    } catch (error) {
      console.error('Erro ao carregar workspace da montagem consolidada:', error);
      return sendError(res, 'Erro ao carregar contexto da montagem consolidada', 500);
    }
  }
);

export default router;
