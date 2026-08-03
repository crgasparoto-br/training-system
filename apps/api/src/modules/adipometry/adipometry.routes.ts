import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Router, type Request, type Response, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import {
  blockAccessMiddleware,
  screenAccessMiddleware,
} from '../access-control/access-control.middleware.js';
import {
  ADIPOMETRY_CORRECT_BLOCK_KEY,
  ADIPOMETRY_MANAGE_BLOCK_KEY,
  ADIPOMETRY_VIEW_BLOCK_KEY,
  adipometryDraftMutationAccessMiddleware,
} from './adipometry-draft-access.middleware.js';
import { mapAdipometryPersistenceError } from './adipometry-http-support.js';
import { AdipometryServiceError, adipometryService } from './adipometry.service.js';

const router: ExpressRouter = Router();
const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

function isStrictDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
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
const correctionCategorySchema = z.enum([
  'DATA_ENTRY_ERROR',
  'MEASUREMENT_TRANSCRIPTION_ERROR',
  'EVALUATION_DATE_ERROR',
  'PROTOCOL_SEX_ERROR',
  'PROTOCOL_SELECTION_ERROR',
  'OTHER',
]);

const measurementsSchema = z.object({
  weightKg: z.number().finite().positive().max(999.99).optional(),
  tricepsMm: z.number().finite().positive().max(80).optional(),
  subscapularMm: z.number().finite().positive().max(80).optional(),
  suprailiacMm: z.number().finite().positive().max(80).optional(),
  abdominalMm: z.number().finite().positive().max(80).optional(),
  thighMm: z.number().finite().positive().max(80).optional(),
}).strict();

const draftBaseSchema = z.object({
  assessmentDate: dateSchema,
  measurements: measurementsSchema.optional(),
  protocolSex: protocolSexSchema.optional(),
  protocolSexSource: protocolSexSourceSchema.optional(),
  protocolSexOverrideReason: z.string().trim().min(5).max(1000).optional(),
  protocolCode: z.string().trim().min(1).max(100).optional(),
  protocolVersion: z.number().int().positive().optional(),
  anthropometryAssessmentId: idSchema.optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
}).strict().superRefine((value, ctx) => {
  if ((value.protocolCode === undefined) !== (value.protocolVersion === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe o protocolo e a versão juntos.' });
  }
  if (value.protocolSexSource === 'professional_override' && !value.protocolSexOverrideReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['protocolSexOverrideReason'],
      message: 'Informe o motivo da divergência do sexo de referência.',
    });
  }
});

const updateDraftSchema = z.object({
  assessmentDate: dateSchema.optional(),
  measurements: measurementsSchema.optional(),
  protocolSex: protocolSexSchema.optional(),
  protocolSexSource: protocolSexSourceSchema.optional(),
  protocolSexOverrideReason: z.string().trim().min(5).max(1000).optional().nullable(),
  protocolCode: z.string().trim().min(1).max(100).optional(),
  protocolVersion: z.number().int().positive().optional(),
  anthropometryAssessmentId: idSchema.optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  confirmProtocolChange: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.protocolCode === undefined) !== (value.protocolVersion === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe o protocolo e a versão juntos.' });
  }
  if (value.protocolSexSource === 'professional_override' && !value.protocolSexOverrideReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['protocolSexOverrideReason'],
      message: 'Informe o motivo da divergência do sexo de referência.',
    });
  }
});

const calculateSchema = z.object({
  skinfoldCapacityWarningConfirmed: z.boolean().optional(),
}).strict();

const finalizeSchema = z.object({
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
}).strict();

const correctionSchema = z.object({
  category: correctionCategorySchema,
  reason: z.string().trim().min(10).max(2000),
}).strict();

const cancelCorrectionSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
}).strict();

function context(req: Request) {
  const user = (req as any).user;
  return {
    contractId: user.contractId as string,
    actorUserId: user.userId as string,
    actorProfessorId: user.professorId as string,
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
      fields: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  if (error instanceof AdipometryServiceError) {
    return sendError(res, error.message, error.statusCode, { code: error.code });
  }

  const mappedPersistenceError = mapAdipometryPersistenceError(error);
  if (mappedPersistenceError) {
    return sendError(
      res,
      mappedPersistenceError.message,
      mappedPersistenceError.statusCode,
      { code: mappedPersistenceError.code }
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return sendError(res, 'A operação conflita com uma alteração já registrada.', 409, {
        code: 'ADIPOMETRY_CONFLICT',
      });
    }
    if (error.code === 'P2025') {
      return sendError(res, 'Avaliação não encontrada.', 404, {
        code: 'ADIPOMETRY_RESOURCE_NOT_FOUND',
      });
    }
  }

  const correlationId = randomUUID();
  console.error('Falha inesperada na adipometria', {
    correlationId,
    errorType: error instanceof Error ? error.name : typeof error,
  });
  return sendError(res, 'Não foi possível processar a adipometria.', 500, {
    code: 'ADIPOMETRY_UNEXPECTED_ERROR',
    correlationId,
  });
}

router.use(authMiddleware);
router.use(professorMiddleware);
router.use(screenAccessMiddleware('physicalAssessment.protocol'));

router.get(
  '/protocols/available',
  blockAccessMiddleware(ADIPOMETRY_VIEW_BLOCK_KEY),
  async (req: Request, res: Response) => {
    try {
      const alunoId = parseId(z.string().parse(req.query.alunoId));
      const assessmentDate = req.query.assessmentDate
        ? dateSchema.parse(req.query.assessmentDate)
        : undefined;
      const { contractId } = context(req);
      const protocols = await adipometryService.listAvailableProtocols(
        contractId,
        alunoId,
        assessmentDate
      );
      return sendSuccess(res, protocols, 'Protocolos de adipometria carregados.');
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

router.get(
  '/alunos/:alunoId/assessments',
  blockAccessMiddleware(ADIPOMETRY_VIEW_BLOCK_KEY),
  async (req: Request, res: Response) => {
    try {
      const { contractId } = context(req);
      const assessments = await adipometryService.listAssessments(
        contractId,
        parseId(req.params.alunoId)
      );
      return sendSuccess(res, assessments, 'Histórico de adipometria carregado.');
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

router.get(
  '/alunos/:alunoId/assessments/last',
  blockAccessMiddleware(ADIPOMETRY_VIEW_BLOCK_KEY),
  async (req: Request, res: Response) => {
    try {
      const { contractId } = context(req);
      const assessment = await adipometryService.getLastAssessment(
        contractId,
        parseId(req.params.alunoId)
      );
      return sendSuccess(res, assessment, 'Última adipometria carregada.');
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

router.post(
  '/alunos/:alunoId/assessments',
  blockAccessMiddleware(ADIPOMETRY_MANAGE_BLOCK_KEY),
  async (req: Request, res: Response) => {
    try {
      const payload = draftBaseSchema.parse(req.body);
      const { contractId, actorUserId, actorProfessorId } = context(req);
      const assessment = await adipometryService.createDraft(
        contractId,
        parseId(req.params.alunoId),
        actorUserId,
        actorProfessorId,
        payload
      );
      return sendSuccess(res, assessment, 'Rascunho de adipometria criado.', 201);
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

router.get(
  '/assessments/:id',
  blockAccessMiddleware(ADIPOMETRY_VIEW_BLOCK_KEY),
  async (req: Request, res: Response) => {
    try {
      const { contractId } = context(req);
      const assessment = await adipometryService.getAssessment(
        contractId,
        parseId(req.params.id)
      );
      return sendSuccess(res, assessment, 'Adipometria carregada.');
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

router.put(
  '/assessments/:id',
  adipometryDraftMutationAccessMiddleware,
  async (req: Request, res: Response) => {
    try {
      const payload = updateDraftSchema.parse(req.body);
      const { contractId, actorUserId } = context(req);
      const assessment = await adipometryService.updateDraft(
        contractId,
        parseId(req.params.id),
        actorUserId,
        payload
      );
      return sendSuccess(res, assessment, 'Rascunho de adipometria atualizado.');
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

router.post(
  '/assessments/:id/calculate',
  adipometryDraftMutationAccessMiddleware,
  async (req: Request, res: Response) => {
    try {
      const payload = calculateSchema.parse(req.body ?? {});
      const { contractId, actorUserId } = context(req);
      const preview = await adipometryService.calculate(
        contractId,
        parseId(req.params.id),
        actorUserId,
        {
          skinfoldCapacityWarningConfirmed: payload.skinfoldCapacityWarningConfirmed,
        }
      );
      return sendSuccess(res, preview, 'Prévia da adipometria calculada.');
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

router.post(
  '/assessments/:id/finalize',
  adipometryDraftMutationAccessMiddleware,
  async (req: Request, res: Response) => {
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
  }
);

router.post(
  '/assessments/:id/corrections',
  blockAccessMiddleware(ADIPOMETRY_CORRECT_BLOCK_KEY),
  async (req: Request, res: Response) => {
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
  blockAccessMiddleware(ADIPOMETRY_CORRECT_BLOCK_KEY),
  async (req: Request, res: Response) => {
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
  blockAccessMiddleware(ADIPOMETRY_VIEW_BLOCK_KEY),
  async (req: Request, res: Response) => {
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
      const comparison = await adipometryService.compare(
        contractId,
        parseId(req.params.alunoId),
        assessmentIds
      );
      return sendSuccess(res, comparison, 'Comparação de adipometria carregada.');
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

export default router;
