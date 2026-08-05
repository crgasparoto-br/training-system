import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { Router, type NextFunction, type Request, type Response, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type {
  CreateAdipometryDraftWithResponsibleInput,
  UpdateAdipometryDraftWithClearInput,
} from '@corrida/types';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware } from '../auth/auth.middleware.js';
import {
  getProfessionalActor,
  professionalActorMiddleware,
  professionalBlockAccessMiddleware,
  professionalScreenAccessMiddleware,
} from '../access-control/professional-actor.service.js';
import { adipometryAnthropometrySupportService } from './adipometry-anthropometry-support.service.js';
import {
  ADIPOMETRY_CORRECT_BLOCK_KEY,
  ADIPOMETRY_MANAGE_BLOCK_KEY,
  ADIPOMETRY_VIEW_BLOCK_KEY,
  resolveAdipometryDraftMutationBlock,
} from './adipometry-draft-access.middleware.js';
import { mapAdipometryPersistenceError } from './adipometry-http-support.js';
import { AdipometryServiceError, adipometryService } from './adipometry.service.js';
import {
  listAdipometryResponsibleProfessors,
  requireAdipometryResponsibleProfessor,
} from './adipometry-responsible-professor.js';

const prisma = new PrismaClient();
const router: ExpressRouter = Router();
const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

function isStrictDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3]);
}

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isStrictDateOnly, 'Informe uma data válida no formato AAAA-MM-DD.');
const protocolSexSchema = z.enum(['male', 'female']);
const protocolSexSourceSchema = z.enum([
  'profile',
  'professional_confirmation',
  'professional_override',
]);
const measurementsSchema = z.object({
  weightKg: z.number().finite().positive().optional(),
  tricepsMm: z.number().finite().positive().optional(),
  subscapularMm: z.number().finite().positive().optional(),
  suprailiacMm: z.number().finite().positive().optional(),
  abdominalMm: z.number().finite().positive().optional(),
  thighMm: z.number().finite().positive().optional(),
}).strict();
const measurementsPatchSchema = z.object({
  weightKg: z.number().finite().positive().nullable().optional(),
  tricepsMm: z.number().finite().positive().nullable().optional(),
  subscapularMm: z.number().finite().positive().nullable().optional(),
  suprailiacMm: z.number().finite().positive().nullable().optional(),
  abdominalMm: z.number().finite().positive().nullable().optional(),
  thighMm: z.number().finite().positive().nullable().optional(),
}).strict();

function refineDraft(value: {
  protocolCode?: string;
  protocolVersion?: number;
  protocolSexSource?: 'profile' | 'professional_confirmation' | 'professional_override';
  protocolSexOverrideReason?: string | null;
}, ctx: z.RefinementCtx) {
  if ((value.protocolCode === undefined) !== (value.protocolVersion === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe o protocolo e a versão juntos.' });
  }
  if (value.protocolSexSource === 'professional_override' && !value.protocolSexOverrideReason?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['protocolSexOverrideReason'],
      message: 'Informe o motivo da divergência do sexo de referência.',
    });
  }
}

const sharedDraftFields = {
  protocolSex: protocolSexSchema.optional(),
  protocolSexSource: protocolSexSourceSchema.optional(),
  protocolSexOverrideReason: z.string().trim().min(5).max(1000).optional().nullable(),
  protocolCode: z.string().trim().min(1).max(100).optional(),
  protocolVersion: z.number().int().positive().optional(),
  anthropometryAssessmentId: idSchema.optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
};
const createSchema = z.object({
  responsibleProfessorId: idSchema,
  assessmentDate: dateSchema,
  measurements: measurementsSchema.optional(),
  ...sharedDraftFields,
}).strict().superRefine(refineDraft);
const updateSchema = z.object({
  assessmentDate: dateSchema.optional(),
  measurements: measurementsPatchSchema.optional(),
  ...sharedDraftFields,
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  confirmProtocolChange: z.boolean().optional(),
}).strict().superRefine(refineDraft);
const calculateSchema = z.object({
  skinfoldCapacityWarningConfirmed: z.boolean().optional(),
}).strict();
const finalizeSchema = z.object({
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
}).strict();
const correctionSchema = z.object({
  category: z.enum([
    'DATA_ENTRY_ERROR',
    'MEASUREMENT_TRANSCRIPTION_ERROR',
    'EVALUATION_DATE_ERROR',
    'PROTOCOL_SEX_ERROR',
    'PROTOCOL_SELECTION_ERROR',
    'OTHER',
  ]),
  reason: z.string().trim().min(10).max(2000),
}).strict();
const cancelCorrectionSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
}).strict();
const supportQuerySchema = z.object({
  assessmentDate: dateSchema,
  anthropometryAssessmentId: idSchema.optional(),
}).strict();

function context(req: Request) {
  const actor = getProfessionalActor(req);
  if (!actor) {
    throw new AdipometryServiceError('Não autenticado.', 'AUTH_REQUIRED', 401);
  }
  return {
    actor,
    contractId: actor.contractId,
    actorUserId: actor.userId,
  };
}

function parseId(value: string): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) {
    throw new AdipometryServiceError(
      'Identificador inválido.',
      'ADIPOMETRY_INVALID_IDENTIFIER',
      400
    );
  }
  return parsed.data;
}

function sendAdipometryError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    return sendError(res, 'Dados inválidos.', 400, {
      code: 'ADIPOMETRY_INVALID_INPUT',
      fields: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  if (error instanceof AdipometryServiceError) {
    return sendError(res, error.message, error.statusCode, { code: error.code });
  }
  const mapped = mapAdipometryPersistenceError(error);
  if (mapped) {
    return sendError(res, mapped.message, mapped.statusCode, { code: mapped.code });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    return sendError(res, 'Avaliação não encontrada.', 404, {
      code: 'ADIPOMETRY_RESOURCE_NOT_FOUND',
    });
  }
  const correlationId = randomUUID();
  console.error('Falha inesperada na adipometria profissional', {
    correlationId,
    errorType: error instanceof Error ? error.name : typeof error,
  });
  return sendError(res, 'Não foi possível processar a adipometria.', 500, {
    code: 'ADIPOMETRY_UNEXPECTED_ERROR',
    correlationId,
  });
}

async function mutationAccess(req: Request, res: Response, next: NextFunction) {
  const actor = getProfessionalActor(req);
  if (!actor) return sendError(res, 'Não autenticado', 401, { code: 'AUTH_REQUIRED' });
  try {
    const assessment = await prisma.adipometryAssessment.findFirst({
      where: { id: req.params.id, contractId: actor.contractId },
      select: { revisionNumber: true },
    });
    if (!assessment) {
      return sendError(res, 'Avaliação não encontrada.', 404, {
        code: 'ADIPOMETRY_RESOURCE_NOT_FOUND',
      });
    }
    return professionalBlockAccessMiddleware(
      resolveAdipometryDraftMutationBlock(assessment.revisionNumber)
    )(req, res, next);
  } catch (error) {
    return sendAdipometryError(res, error);
  }
}

router.use(authMiddleware);
router.use(professionalActorMiddleware);
router.use(professionalScreenAccessMiddleware('physicalAssessment.protocol'));

router.get(
  '/responsible-professors',
  professionalBlockAccessMiddleware(ADIPOMETRY_VIEW_BLOCK_KEY),
  async (req, res) => {
    try {
      const { contractId } = context(req);
      return sendSuccess(
        res,
        await listAdipometryResponsibleProfessors(contractId),
        'Professores responsáveis carregados.'
      );
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

router.get(
  '/accessible-students',
  professionalBlockAccessMiddleware(ADIPOMETRY_VIEW_BLOCK_KEY),
  async (req, res) => {
    try {
      const { actor, contractId } = context(req);
      let professorIds: string[] | undefined;
      if (actor.actorProfessorId && actor.role !== 'master') {
        const professors = await prisma.professor.findMany({
          where: {
            contractId,
            OR: [
              { id: actor.actorProfessorId },
              { responsibleManagerId: actor.actorProfessorId },
            ],
          },
          select: { id: true },
        });
        professorIds = professors.map((item) => item.id);
      }
      const students = await prisma.aluno.findMany({
        where: {
          contractId,
          status: 'ACTIVE_STUDENT',
          userId: { not: null },
          ...(professorIds ? { professorId: { in: professorIds } } : {}),
        },
        select: {
          id: true,
          user: {
            select: {
              profile: { select: { name: true } },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
      const available = students
        .filter((item) => item.user?.profile?.name)
        .map((item) => ({
          id: item.id,
          user: { profile: { name: item.user!.profile!.name } },
        }));
      return sendSuccess(res, available, 'Alunos acessíveis carregados.');
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

router.get(
  '/protocols/available',
  professionalBlockAccessMiddleware(ADIPOMETRY_VIEW_BLOCK_KEY),
  async (req, res) => {
    try {
      const alunoId = parseId(z.string().parse(req.query.alunoId));
      const assessmentDate = req.query.assessmentDate
        ? dateSchema.parse(req.query.assessmentDate)
        : undefined;
      const { contractId } = context(req);
      return sendSuccess(
        res,
        await adipometryService.listAvailableProtocols(contractId, alunoId, assessmentDate),
        'Protocolos de adipometria carregados.'
      );
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

router.get(
  '/alunos/:alunoId/assessments',
  professionalBlockAccessMiddleware(ADIPOMETRY_VIEW_BLOCK_KEY),
  async (req, res) => {
    try {
      const { contractId } = context(req);
      return sendSuccess(
        res,
        await adipometryService.listAssessments(contractId, parseId(req.params.alunoId)),
        'Histórico de adipometria carregado.'
      );
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

router.get(
  '/assessments/:id',
  professionalBlockAccessMiddleware(ADIPOMETRY_VIEW_BLOCK_KEY),
  async (req, res) => {
    try {
      const { contractId } = context(req);
      return sendSuccess(
        res,
        await adipometryService.getAssessment(contractId, parseId(req.params.id)),
        'Adipometria carregada.'
      );
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

router.get(
  '/alunos/:alunoId/anthropometry-support',
  professionalBlockAccessMiddleware(ADIPOMETRY_VIEW_BLOCK_KEY),
  async (req, res) => {
    try {
      const query = supportQuerySchema.parse(req.query);
      const { contractId } = context(req);
      const support = await adipometryAnthropometrySupportService.getSupport(
        contractId,
        parseId(req.params.alunoId),
        query.assessmentDate,
        query.anthropometryAssessmentId
      );
      return sendSuccess(res, support, 'Antropometria de apoio carregada.');
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

router.post(
  '/alunos/:alunoId/assessments/with-responsible',
  professionalBlockAccessMiddleware(ADIPOMETRY_MANAGE_BLOCK_KEY),
  async (req, res) => {
    try {
      const parsed = createSchema.parse(req.body) as CreateAdipometryDraftWithResponsibleInput;
      const { responsibleProfessorId, ...payload } = parsed;
      const { contractId, actorUserId } = context(req);
      const responsible = await requireAdipometryResponsibleProfessor(
        contractId,
        responsibleProfessorId
      );
      const assessment = await adipometryService.createDraft(
        contractId,
        parseId(req.params.alunoId),
        actorUserId,
        responsible.id,
        payload
      );
      return sendSuccess(res, assessment, 'Rascunho de adipometria criado.', 201);
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

router.put('/assessments/:id/draft', mutationAccess, async (req, res) => {
  try {
    const payload = updateSchema.parse(req.body) as UpdateAdipometryDraftWithClearInput;
    const { contractId, actorUserId } = context(req);
    const assessment = await adipometryService.updateDraft(
      contractId,
      parseId(req.params.id),
      actorUserId,
      payload as any
    );
    return sendSuccess(res, assessment, 'Rascunho de adipometria atualizado.');
  } catch (error) {
    return sendAdipometryError(res, error);
  }
});

router.post('/assessments/:id/calculate', mutationAccess, async (req, res) => {
  try {
    const payload = calculateSchema.parse(req.body ?? {});
    const { contractId, actorUserId } = context(req);
    const preview = await adipometryService.calculate(
      contractId,
      parseId(req.params.id),
      actorUserId,
      { skinfoldCapacityWarningConfirmed: payload.skinfoldCapacityWarningConfirmed }
    );
    return sendSuccess(res, preview, 'Prévia da adipometria calculada.');
  } catch (error) {
    return sendAdipometryError(res, error);
  }
});

router.post('/assessments/:id/finalize', mutationAccess, async (req, res) => {
  try {
    const payload = finalizeSchema.parse(req.body ?? {});
    const { contractId, actorUserId } = context(req);
    const result = await adipometryService.finalize(
      contractId,
      parseId(req.params.id),
      actorUserId,
      payload
    );
    return sendSuccess(
      res,
      result,
      result.alreadyFinalized
        ? 'A adipometria já estava concluída.'
        : 'Adipometria concluída com sucesso.'
    );
  } catch (error) {
    return sendAdipometryError(res, error);
  }
});

router.post(
  '/assessments/:id/corrections',
  professionalBlockAccessMiddleware(ADIPOMETRY_CORRECT_BLOCK_KEY),
  async (req, res) => {
    try {
      const payload = correctionSchema.parse(req.body);
      const { contractId, actorUserId } = context(req);
      const correction = await adipometryService.startCorrection(
        contractId,
        parseId(req.params.id),
        actorUserId,
        payload.category,
        payload.reason
      );
      return sendSuccess(res, correction, 'Rascunho de correção criado.', 201);
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

router.post(
  '/assessments/:id/correction/cancel',
  professionalBlockAccessMiddleware(ADIPOMETRY_CORRECT_BLOCK_KEY),
  async (req, res) => {
    try {
      const payload = cancelCorrectionSchema.parse(req.body);
      const { contractId, actorUserId } = context(req);
      const correction = await adipometryService.cancelCorrection(
        contractId,
        parseId(req.params.id),
        actorUserId,
        payload.reason
      );
      return sendSuccess(res, correction, 'Correção cancelada e preservada no histórico.');
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

router.get(
  '/alunos/:alunoId/compare',
  professionalBlockAccessMiddleware(ADIPOMETRY_VIEW_BLOCK_KEY),
  async (req, res) => {
    try {
      const assessmentIds = typeof req.query.assessmentIds === 'string'
        ? req.query.assessmentIds.split(',').filter(Boolean).map(parseId)
        : undefined;
      if (assessmentIds && (assessmentIds.length < 1 || assessmentIds.length > 2)) {
        throw new AdipometryServiceError(
          'Informe uma ou duas avaliações para comparação.',
          'ADIPOMETRY_INVALID_COMPARISON'
        );
      }
      const { contractId } = context(req);
      return sendSuccess(
        res,
        await adipometryService.compare(
          contractId,
          parseId(req.params.alunoId),
          assessmentIds
        ),
        'Comparação de adipometria carregada.'
      );
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

export default router;
