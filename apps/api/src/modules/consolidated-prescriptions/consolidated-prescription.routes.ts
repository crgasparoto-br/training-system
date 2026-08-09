import { PrismaClient } from '@prisma/client';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import type {
  AccessDataScope,
  CreateConsolidatedPrescriptionDraftPayload,
  UpdateConsolidatedPrescriptionCompositionPayload,
} from '@corrida/types';
import {
  canProfessorAccessBlock,
  getEffectiveDataScopeForProfessor,
} from '../access-control/access-control.service.js';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import {
  ConsolidatedPrescriptionDomainError,
  consolidatedPrescriptionService,
} from './consolidated-prescription.service.js';

const router: Router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);
router.use(professorMiddleware);

const capacityInputSchema = z
  .object({
    capacityPrescriptionVersionId: z.string().trim().min(1),
    position: z.number().int().nonnegative().optional().nullable(),
  })
  .strict();

const dataRefSchema = z
  .object({
    role: z.enum(['assessment', 'routine', 'manual_observation', 'exercise_substitution']),
    sourceType: z.string().trim().min(1),
    sourceId: z.string().trim().min(1),
    label: z.string().trim().optional().nullable(),
    assessedAt: z.string().datetime().optional().nullable(),
    origin: z.string().trim().optional().nullable(),
    sourceVersion: z.union([z.number().int().nonnegative(), z.string().trim().min(1)]).optional().nullable(),
    responsibleProfessorId: z.string().trim().optional().nullable(),
    context: z.record(z.unknown()).optional().nullable(),
  })
  .strict();

const compositionSchema = z
  .object({
    responsibleProfessorId: z.string().trim().optional().nullable(),
    capacityBlocks: z.array(capacityInputSchema).min(1),
    dataRefs: z.array(dataRefSchema).optional(),
    technicalObservation: z.string().trim().optional().nullable(),
    professorJustification: z.string().trim().min(1),
    studentInstruction: z.string().trim().optional().nullable(),
  })
  .strict();

const updateCompositionSchema = compositionSchema
  .extend({ expectedCurrentVersion: z.number().int().nonnegative() })
  .strict();
const versionCommandSchema = z
  .object({ expectedCurrentVersion: z.number().int().nonnegative() })
  .strict();
const blockSchema = versionCommandSchema
  .extend({ reason: z.string().trim().min(1) })
  .strict();
const unblockSchema = versionCommandSchema
  .extend({
    targetStatus: z.enum(['draft', 'ready_for_review']),
    reason: z.string().trim().optional().nullable(),
  })
  .strict();
const revisionSchema = versionCommandSchema
  .extend({ reason: z.string().trim().optional().nullable() })
  .strict();

type ConsolidatedActor = {
  contractId: string;
  professorId: string;
  dataScope: AccessDataScope;
};
type ConsolidatedRequest = Request & { consolidatedActor?: ConsolidatedActor };

function requireConsolidatedBlock(blockKey: string) {
  return async (req: ConsolidatedRequest, res: Response, next: NextFunction) => {
    try {
      const contractId = req.user?.contractId;
      const professorId = req.user?.professorId;
      if (!contractId || !professorId) return sendError(res, 'Não autenticado', 401);

      const professor = await prisma.professor.findFirst({
        where: { id: professorId, contractId },
        include: { collaboratorFunction: true },
      });
      if (!professor || !(await canProfessorAccessBlock(professor, blockKey))) {
        return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
      }
      const dataScope = await getEffectiveDataScopeForProfessor(professor, 'plans');
      if (!dataScope) return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);

      req.consolidatedActor = { contractId, professorId, dataScope };
      return next();
    } catch (error) {
      console.error('Erro ao validar acesso à montagem consolidada:', error);
      return sendError(res, 'Erro ao verificar permissão', 500);
    }
  };
}

function actorFromRequest(req: ConsolidatedRequest) {
  if (!req.consolidatedActor) {
    throw new ConsolidatedPrescriptionDomainError('NOT_FOUND', 'Recurso não encontrado');
  }
  return req.consolidatedActor;
}

async function assertAlunoDataScope(actor: ConsolidatedActor, alunoId: string) {
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

function contextFor(actor: ConsolidatedActor, alunoId: string) {
  return {
    contractId: actor.contractId,
    alunoId,
    actorProfessorId: actor.professorId,
  };
}

function handleError(res: Response, error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return sendError(res, 'Dados inválidos', 400, error.errors);
  if (error instanceof ConsolidatedPrescriptionDomainError) {
    if (error.code === 'NOT_FOUND') return sendError(res, 'Recurso não encontrado', 404);
    if (error.code === 'CONFLICT') {
      return sendError(res, error.message, 409, error.details ? [error.details] : undefined);
    }
    return sendError(res, error.message, 400, error.details ? [error.details] : undefined);
  }
  console.error(fallback, error);
  return sendError(res, fallback, 500);
}

async function ensureAlunoScope(req: ConsolidatedRequest, res: Response) {
  const actor = actorFromRequest(req);
  const allowed = await assertAlunoDataScope(actor, req.params.alunoId);
  if (!allowed) {
    sendError(res, 'Recurso não encontrado', 404);
    return null;
  }
  return actor;
}

router.get(
  '/alunos/:alunoId',
  requireConsolidatedBlock('plans.consolidatedPrescriptions.view'),
  async (req: ConsolidatedRequest, res: Response) => {
    try {
      const actor = await ensureAlunoScope(req, res);
      if (!actor) return;
      const current = await consolidatedPrescriptionService.getCurrent(
        contextFor(actor, req.params.alunoId)
      );
      return sendSuccess(res, current, 'Montagem consolidada carregada');
    } catch (error) {
      return handleError(res, error, 'Erro ao carregar montagem consolidada');
    }
  }
);

router.post(
  '/alunos/:alunoId',
  requireConsolidatedBlock('plans.consolidatedPrescriptions.manage'),
  async (req: ConsolidatedRequest, res: Response) => {
    try {
      const actor = await ensureAlunoScope(req, res);
      if (!actor) return;
      const payload = compositionSchema.parse(req.body) as unknown as CreateConsolidatedPrescriptionDraftPayload;
      const created = await consolidatedPrescriptionService.createDraft(
        contextFor(actor, req.params.alunoId),
        payload
      );
      return sendSuccess(res, created, 'Rascunho da montagem consolidada criado', 201);
    } catch (error) {
      return handleError(res, error, 'Erro ao criar montagem consolidada');
    }
  }
);

router.patch(
  '/alunos/:alunoId/composition',
  requireConsolidatedBlock('plans.consolidatedPrescriptions.manage'),
  async (req: ConsolidatedRequest, res: Response) => {
    try {
      const actor = await ensureAlunoScope(req, res);
      if (!actor) return;
      const payload = updateCompositionSchema.parse(
        req.body
      ) as unknown as UpdateConsolidatedPrescriptionCompositionPayload;
      const updated = await consolidatedPrescriptionService.updateComposition(
        contextFor(actor, req.params.alunoId),
        payload
      );
      return sendSuccess(res, updated, 'Montagem consolidada versionada');
    } catch (error) {
      return handleError(res, error, 'Erro ao atualizar montagem consolidada');
    }
  }
);

router.get(
  '/alunos/:alunoId/conflicts',
  requireConsolidatedBlock('plans.consolidatedPrescriptions.view'),
  async (req: ConsolidatedRequest, res: Response) => {
    try {
      const actor = await ensureAlunoScope(req, res);
      if (!actor) return;
      const report = await consolidatedPrescriptionService.getConflictReport(
        contextFor(actor, req.params.alunoId)
      );
      return sendSuccess(res, report, 'Conflitos da montagem consolidados');
    } catch (error) {
      return handleError(res, error, 'Erro ao consultar conflitos da montagem');
    }
  }
);

router.post(
  '/alunos/:alunoId/conflicts/recalculate',
  requireConsolidatedBlock('plans.consolidatedPrescriptions.manage'),
  async (req: ConsolidatedRequest, res: Response) => {
    try {
      const actor = await ensureAlunoScope(req, res);
      if (!actor) return;
      const command = versionCommandSchema.parse(req.body);
      const result = await consolidatedPrescriptionService.recalculateConflicts(
        contextFor(actor, req.params.alunoId),
        command
      );
      return sendSuccess(res, result, 'Conflitos reavaliados');
    } catch (error) {
      return handleError(res, error, 'Erro ao recalcular conflitos da montagem');
    }
  }
);

router.post(
  '/alunos/:alunoId/send-for-review',
  requireConsolidatedBlock('plans.consolidatedPrescriptions.manage'),
  async (req: ConsolidatedRequest, res: Response) => {
    try {
      const actor = await ensureAlunoScope(req, res);
      if (!actor) return;
      const command = versionCommandSchema.parse(req.body);
      const result = await consolidatedPrescriptionService.sendForReview(
        contextFor(actor, req.params.alunoId),
        command
      );
      return sendSuccess(res, result, 'Montagem processada para revisão');
    } catch (error) {
      return handleError(res, error, 'Erro ao enviar montagem para revisão');
    }
  }
);

router.post(
  '/alunos/:alunoId/approve',
  requireConsolidatedBlock('plans.consolidatedPrescriptions.approve'),
  async (req: ConsolidatedRequest, res: Response) => {
    try {
      const actor = await ensureAlunoScope(req, res);
      if (!actor) return;
      const command = versionCommandSchema.parse(req.body);
      const result = await consolidatedPrescriptionService.approve(
        contextFor(actor, req.params.alunoId),
        command
      );
      return sendSuccess(res, result, 'Decisão de aprovação processada');
    } catch (error) {
      return handleError(res, error, 'Erro ao aprovar montagem consolidada');
    }
  }
);

router.post(
  '/alunos/:alunoId/block',
  requireConsolidatedBlock('plans.consolidatedPrescriptions.manage'),
  async (req: ConsolidatedRequest, res: Response) => {
    try {
      const actor = await ensureAlunoScope(req, res);
      if (!actor) return;
      const command = blockSchema.parse(req.body);
      const result = await consolidatedPrescriptionService.block(
        contextFor(actor, req.params.alunoId),
        command
      );
      return sendSuccess(res, result, 'Montagem consolidada bloqueada');
    } catch (error) {
      return handleError(res, error, 'Erro ao bloquear montagem consolidada');
    }
  }
);

router.post(
  '/alunos/:alunoId/unblock',
  requireConsolidatedBlock('plans.consolidatedPrescriptions.manage'),
  async (req: ConsolidatedRequest, res: Response) => {
    try {
      const actor = await ensureAlunoScope(req, res);
      if (!actor) return;
      const command = unblockSchema.parse(req.body);
      const result = await consolidatedPrescriptionService.unblock(
        contextFor(actor, req.params.alunoId),
        command
      );
      return sendSuccess(res, result, 'Montagem consolidada desbloqueada');
    } catch (error) {
      return handleError(res, error, 'Erro ao desbloquear montagem consolidada');
    }
  }
);

router.post(
  '/alunos/:alunoId/revisions',
  requireConsolidatedBlock('plans.consolidatedPrescriptions.manage'),
  async (req: ConsolidatedRequest, res: Response) => {
    try {
      const actor = await ensureAlunoScope(req, res);
      if (!actor) return;
      const command = revisionSchema.parse(req.body);
      const result = await consolidatedPrescriptionService.createRevision(
        contextFor(actor, req.params.alunoId),
        command
      );
      return sendSuccess(res, result, 'Nova revisão da montagem consolidada criada', 201);
    } catch (error) {
      return handleError(res, error, 'Erro ao criar revisão da montagem consolidada');
    }
  }
);

router.get(
  '/alunos/:alunoId/history',
  requireConsolidatedBlock('plans.consolidatedPrescriptions.view'),
  async (req: ConsolidatedRequest, res: Response) => {
    try {
      const actor = await ensureAlunoScope(req, res);
      if (!actor) return;
      const history = await consolidatedPrescriptionService.getHistory(
        contextFor(actor, req.params.alunoId)
      );
      return sendSuccess(res, history, 'Histórico e auditoria da montagem carregados');
    } catch (error) {
      return handleError(res, error, 'Erro ao carregar histórico da montagem');
    }
  }
);

export default router;
