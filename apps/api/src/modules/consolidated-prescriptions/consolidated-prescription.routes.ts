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
  canProfessorAccessScreen,
  getEffectiveDataScopeForProfessor,
} from '../access-control/access-control.service.js';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { combinedConflictSourceService, CombinedConflictSourceError } from './combined-training-conflicts.service.js';
import { combinedFutureTemporalService } from './combined-future-temporal.service.js';
import { FutureTemporalInputError } from './combined-future-temporal.domain.js';
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

const futureWindowSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
}).strict();
const futureTemporalPreviewSchema = z.object({
  expectedCurrentVersion: z.number().int().positive(),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  timeZone: z.string().min(1).max(90),
  bindings: z.array(z.object({
    bookingId: z.string().trim().min(1).max(128),
    capacityPrescriptionVersionId: z.string().trim().min(1).max(128),
    expectedBookingUpdatedAt: z.string().datetime(),
  }).strict()).max(320),
}).strict();

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
  '/alunos/:alunoId/assemblies',
  requireConsolidatedBlock('plans.consolidatedPrescriptions.view'),
  async (req: ConsolidatedRequest, res: Response) => {
    try {
      const actor = await ensureAlunoScope(req, res);
      if (!actor) return;
      const current = await consolidatedPrescriptionService.getCurrent(
        contextFor(actor, req.params.alunoId)
      );
      return sendSuccess(
        res,
        current ? [current] : [],
        'Montagens consolidadas do aluno carregadas'
      );
    } catch (error) {
      return handleError(res, error, 'Erro ao listar montagens consolidadas do aluno');
    }
  }
);

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


/** Explicit booking-to-capacity mapping is required: a calendar appointment is not a workout by default. */
async function ensureAgendaAccess(req: ConsolidatedRequest, res: Response) {
  const actor = await ensureAlunoScope(req, res);
  if (!actor) return null;
  const professor = await prisma.professor.findFirst({
    where: { id: actor.professorId, contractId: actor.contractId },
    include: { collaboratorFunction: true },
  });
  if (!professor || !(await canProfessorAccessScreen(professor, 'agenda'))) {
    sendError(res, 'Perfil sem permissão para consultar a agenda desta revisão', 403);
    return null;
  }
  return actor;
}

router.get(
  '/alunos/:alunoId/combined-future-bookings',
  requireConsolidatedBlock('plans.consolidatedPrescriptions.view'),
  async (req: ConsolidatedRequest, res: Response) => {
    try {
      const actor = await ensureAgendaAccess(req, res);
      if (!actor) return;
      const range = futureWindowSchema.parse(req.query);
      const bookings = await combinedFutureTemporalService.getCandidates(
        { alunoId: req.params.alunoId, contractId: actor.contractId },
        range.start, range.end
      );
      return sendSuccess(res, bookings, 'Agendamentos futuros elegíveis para vínculo explícito');
    } catch (error) {
      if (error instanceof FutureTemporalInputError) return sendError(res, error.message, 400);
      return handleError(res, error, 'Erro ao consultar agendamentos futuros');
    }
  }
);

/** Read-only, optimistic-versioned UTC preview. No agenda, training or approval write is performed. */
router.post(
  '/alunos/:alunoId/combined-future-temporal-preview',
  requireConsolidatedBlock('plans.consolidatedPrescriptions.view'),
  async (req: ConsolidatedRequest, res: Response) => {
    try {
      const actor = await ensureAgendaAccess(req, res);
      if (!actor) return;
      const command = futureTemporalPreviewSchema.parse(req.body);
      const preview = await combinedFutureTemporalService.preview(
        { alunoId: req.params.alunoId, contractId: actor.contractId }, command
      );
      return sendSuccess(res, preview, 'Evidência temporal futura de vínculos selecionados');
    } catch (error) {
      if (error instanceof FutureTemporalInputError) return sendError(res, error.message, 400);
      return handleError(res, error, 'Erro ao conferir horários futuros');
    }
  }
);

/** #403: read-only technical preview; both clinical evidence grants are mandatory. */
router.get(
  '/alunos/:alunoId/combined-conflicts',
  requireConsolidatedBlock('plans.consolidatedPrescriptions.view'),
  async (req: ConsolidatedRequest, res: Response) => {
    try {
      const actor = await ensureAlunoScope(req, res);
      if (!actor) return;
      const professor = await prisma.professor.findFirst({
        where: { id: actor.professorId, contractId: actor.contractId },
        include: { collaboratorFunction: true },
      });
      if (!professor ||
          !(await canProfessorAccessBlock(professor, 'students.details.preWorkoutCheckIn')) ||
          !(await canProfessorAccessBlock(professor, 'students.details.postWorkoutFeedback'))) {
        return sendError(res, 'Sem permissão para os sinais sensíveis do treino', 403);
      }
      const period = z.object({
        start: z.string().datetime(),
        end: z.string().datetime(),
      }).strict().parse(req.query);
      const result = await combinedConflictSourceService.getReport({
        alunoId: req.params.alunoId, contractId: actor.contractId,
        start: period.start, end: period.end,
      });
      if (!result) return sendError(res, 'Recurso não encontrado', 404);
      return sendSuccess(res, result, 'Prévia técnica dos conflitos combinados carregada');
    } catch (error) {
      if (error instanceof CombinedConflictSourceError) return sendError(res, error.message, 400);
      return handleError(res, error, 'Erro ao consultar conflitos combinados');
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
