import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import type {
  CompleteParqDTO,
  ParqErrorCode,
  RevokeParqConsentDTO,
  SaveParqDraftDTO,
} from '@corrida/types';
import { logUnexpectedPreRegistrationError } from '../../common/pre-registration-safe-log.js';
import { authMiddleware, alunoMiddleware } from '../auth/auth.middleware.js';
import { ParqDomainError } from './pre-registration-parq.domain.js';
import { ParqServiceError, preRegistrationParqService } from './pre-registration-parq.service.js';
import { PreRegistrationPublicError } from './pre-registration-public.service.js';

const router: Router = Router();
const responsesSchema = z.object({
  q1: z.boolean().optional(),
  q2: z.boolean().optional(),
  q3: z.boolean().optional(),
  q4: z.boolean().optional(),
  q5: z.boolean().optional(),
  q6: z.boolean().optional(),
  q7: z.boolean().optional(),
}).strict();
const consentSchema = z.object({
  accepted: z.literal(true),
  privacyNoticeVersion: z.string().trim().min(1).max(80),
  expectedVersion: z.number().int().min(1),
}).strict();
const saveSchema = z.object({
  catalogVersion: z.literal('parq-2026-01'),
  expectedVersion: z.number().int().min(1),
  responses: responsesSchema,
  consent: consentSchema,
}).strict();
const completeSchema = saveSchema.extend({
  declarationAccepted: z.literal(true),
  idempotencyKey: z.string().trim().min(8).max(120),
}).strict();
const revokeConsentSchema = z.object({
  expectedVersion: z.number().int().min(1),
}).strict();

const STATUS_BY_CODE: Record<ParqErrorCode, number> = {
  NOT_FOUND: 404,
  BASIC_PRE_REGISTRATION_REQUIRED: 409,
  CONSENT_REQUIRED: 400,
  CONSENT_VERSION_MISMATCH: 409,
  UNKNOWN_CATALOG_VERSION: 409,
  INVALID_QUESTION_SET: 400,
  INCOMPLETE_RESPONSES: 400,
  CONCURRENT_MODIFICATION: 409,
  PARQ_ALREADY_COMPLETED: 409,
  FORBIDDEN_FIELD: 400,
  LEGACY_WRITE_DISABLED: 410,
  REVIEW_NOT_PENDING: 409,
};

function userIdOf(req: Request) {
  return req.user!.userId;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ParqServiceError(
      'Revise os dados enviados antes de continuar.',
      'INVALID_QUESTION_SET',
      { fields: result.error.errors.map((item) => item.path.join('.')) }
    );
  }
  return result.data;
}

function handleError(res: Response, error: unknown) {
  if (error instanceof ParqServiceError) {
    return sendError(res, error.message, STATUS_BY_CODE[error.code], {
      code: error.code,
      ...(error.code === 'CONCURRENT_MODIFICATION'
        ? { currentVersion: error.details?.currentVersion }
        : {}),
      ...(error.code === 'CONSENT_VERSION_MISMATCH'
        ? { requiredVersion: error.details?.requiredVersion }
        : {}),
    });
  }
  if (error instanceof ParqDomainError) {
    const code = error.code as ParqErrorCode;
    return sendError(res, error.message, STATUS_BY_CODE[code], { code });
  }
  if (error instanceof PreRegistrationPublicError) {
    return sendError(
      res,
      error.code === 'NOT_FOUND' ? 'Cadastro não encontrado.' : error.message,
      error.code === 'NOT_FOUND' ? 404 : 409,
      { code: error.code }
    );
  }
  const correlationId = crypto.randomUUID();
  logUnexpectedPreRegistrationError('Erro inesperado no PAR-Q', correlationId, error);
  return sendError(res, 'Não foi possível continuar.', 500, {
    code: 'INTERNAL_ERROR',
    correlationId,
  });
}

router.use(authMiddleware, alunoMiddleware);

router.get('/processes/:alunoId/parq', async (req, res) => {
  try {
    return sendSuccess(res, await preRegistrationParqService.getSession(userIdOf(req), req.params.alunoId));
  } catch (error) {
    return handleError(res, error);
  }
});

router.patch('/processes/:alunoId/parq', async (req, res) => {
  try {
    const input = parse<SaveParqDraftDTO>(saveSchema, req.body);
    return sendSuccess(
      res,
      await preRegistrationParqService.saveDraft(userIdOf(req), req.params.alunoId, input),
      'Rascunho do PAR-Q salvo'
    );
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/processes/:alunoId/parq/complete', async (req, res) => {
  try {
    const input = parse<CompleteParqDTO>(completeSchema, req.body);
    return sendSuccess(
      res,
      await preRegistrationParqService.complete(userIdOf(req), req.params.alunoId, input),
      'PAR-Q concluído'
    );
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/processes/:alunoId/parq/consent/revoke', async (req, res) => {
  try {
    const input = parse<RevokeParqConsentDTO>(revokeConsentSchema, req.body);
    return sendSuccess(
      res,
      await preRegistrationParqService.revokeConsent(
        userIdOf(req),
        req.params.alunoId,
        input.expectedVersion
      ),
      'Consentimento do PAR-Q revogado'
    );
  } catch (error) {
    return handleError(res, error);
  }
});

export function parseParqDraft(value: unknown): SaveParqDraftDTO {
  return parse<SaveParqDraftDTO>(saveSchema, value);
}

export function parseParqCompletion(value: unknown): CompleteParqDTO {
  return parse<CompleteParqDTO>(completeSchema, value);
}

export function parseParqConsentRevocation(value: unknown): RevokeParqConsentDTO {
  return parse<RevokeParqConsentDTO>(revokeConsentSchema, value);
}

export { router as preRegistrationParqRoutes };
