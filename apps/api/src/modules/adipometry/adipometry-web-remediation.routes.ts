import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Router, type Request, type Response, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type {
  CreateAdipometryDraftWithResponsibleInput,
  ReassignAdipometryResponsibleInput,
  UpdateAdipometryDraftWithClearInput,
} from '@corrida/types';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import {
  blockAccessMiddleware,
  screenAccessMiddleware,
} from '../access-control/access-control.middleware.js';
import {
  ADIPOMETRY_MANAGE_BLOCK_KEY,
  ADIPOMETRY_VIEW_BLOCK_KEY,
  adipometryDraftMutationAccessMiddleware,
} from './adipometry-draft-access.middleware.js';
import { mapAdipometryPersistenceError } from './adipometry-http-support.js';
import { AdipometryServiceError, adipometryService } from './adipometry.service.js';
import {
  reassignAdipometryResponsibleProfessor,
} from './adipometry-responsible-reassignment.js';
import {
  listAdipometryResponsibleProfessors,
  requireAdipometryResponsibleProfessor,
} from './adipometry-responsible-professor.js';

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
const createAdipometryMeasurementsSchema = z.object({
  weightKg: z.number().finite().positive().optional(),
  tricepsMm: z.number().finite().positive().optional(),
  subscapularMm: z.number().finite().positive().optional(),
  suprailiacMm: z.number().finite().positive().optional(),
  abdominalMm: z.number().finite().positive().optional(),
  thighMm: z.number().finite().positive().optional(),
}).strict();

export const adipometryDraftMeasurementsPatchSchema = z.object({
  weightKg: z.number().finite().positive().nullable().optional(),
  tricepsMm: z.number().finite().positive().nullable().optional(),
  subscapularMm: z.number().finite().positive().nullable().optional(),
  suprailiacMm: z.number().finite().positive().nullable().optional(),
  abdominalMm: z.number().finite().positive().nullable().optional(),
  thighMm: z.number().finite().positive().nullable().optional(),
}).strict();

const draftFields = {
  assessmentDate: dateSchema,
  measurements: createAdipometryMeasurementsSchema.optional(),
  protocolSex: protocolSexSchema.optional(),
  protocolSexSource: protocolSexSourceSchema.optional(),
  protocolSexOverrideReason: z.string().trim().min(5).max(1000).optional().nullable(),
  protocolCode: z.string().trim().min(1).max(100).optional(),
  protocolVersion: z.number().int().positive().optional(),
  anthropometryAssessmentId: idSchema.optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
};

function refineDraft(value: {
  protocolCode?: string;
  protocolVersion?: number;
  protocolSexSource?: 'profile' | 'professional_confirmation' | 'professional_override';
  protocolSexOverrideReason?: string | null;
}, ctx: z.RefinementCtx) {
  if ((value.protocolCode === undefined) !== (value.protocolVersion === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe o protocolo e a versão juntos.' });
  }
  if (
    value.protocolSexSource === 'professional_override'
    && !value.protocolSexOverrideReason?.trim()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['protocolSexOverrideReason'],
      message: 'Informe o motivo da divergência do sexo de referência.',
    });
  }
}

export const createAdipometryDraftWithResponsibleSchema = z.object({
  responsibleProfessorId: idSchema,
  ...draftFields,
}).strict().superRefine(refineDraft);

export const updateAdipometryDraftWithClearSchema = z.object({
  assessmentDate: dateSchema.optional(),
  measurements: adipometryDraftMeasurementsPatchSchema.optional(),
  protocolSex: protocolSexSchema.optional(),
  protocolSexSource: protocolSexSourceSchema.optional(),
  protocolSexOverrideReason: z.string().trim().min(5).max(1000).optional().nullable(),
  protocolCode: z.string().trim().min(1).max(100).optional(),
  protocolVersion: z.number().int().positive().optional(),
  anthropometryAssessmentId: idSchema.optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  confirmProtocolChange: z.boolean().optional(),
}).strict().superRefine(refineDraft);

export const reassignAdipometryResponsibleSchema = z.object({
  responsibleProfessorId: idSchema,
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict();

function context(req: Request) {
  const user = (req as any).user;
  return {
    contractId: user.contractId as string,
    actorUserId: user.userId as string,
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

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    return sendError(res, 'Avaliação não encontrada.', 404, {
      code: 'ADIPOMETRY_RESOURCE_NOT_FOUND',
    });
  }

  const correlationId = randomUUID();
  console.error('Falha inesperada no contrato web da adipometria', {
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
  '/responsible-professors',
  blockAccessMiddleware(ADIPOMETRY_VIEW_BLOCK_KEY),
  async (req: Request, res: Response) => {
    try {
      const { contractId } = context(req);
      const professors = await listAdipometryResponsibleProfessors(contractId);
      return sendSuccess(res, professors, 'Professores responsáveis carregados.');
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

router.post(
  '/alunos/:alunoId/assessments/with-responsible',
  blockAccessMiddleware(ADIPOMETRY_MANAGE_BLOCK_KEY),
  async (req: Request, res: Response) => {
    try {
      const parsed = createAdipometryDraftWithResponsibleSchema.parse(req.body) as CreateAdipometryDraftWithResponsibleInput;
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

router.put(
  '/assessments/:id/draft',
  adipometryDraftMutationAccessMiddleware,
  async (req: Request, res: Response) => {
    try {
      const payload = updateAdipometryDraftWithClearSchema.parse(req.body) as UpdateAdipometryDraftWithClearInput;
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
  }
);

router.put(
  '/assessments/:id/responsible',
  adipometryDraftMutationAccessMiddleware,
  async (req: Request, res: Response) => {
    try {
      const payload = reassignAdipometryResponsibleSchema.parse(
        req.body
      ) as ReassignAdipometryResponsibleInput;
      const { contractId, actorUserId } = context(req);
      const responsible = await requireAdipometryResponsibleProfessor(
        contractId,
        payload.responsibleProfessorId
      );
      const assessment = await reassignAdipometryResponsibleProfessor({
        contractId,
        assessmentId: parseId(req.params.id),
        actorUserId,
        responsibleProfessorId: responsible.id,
        expectedUpdatedAt: payload.expectedUpdatedAt,
      });
      return sendSuccess(
        res,
        assessment,
        'Responsável do rascunho de adipometria atualizado.'
      );
    } catch (error) {
      return sendAdipometryError(res, error);
    }
  }
);

export default router;
