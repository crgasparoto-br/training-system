import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@corrida/utils';
import type {
  CompleteHealthIntakeDTO,
  HealthIntakeErrorCode,
  SaveHealthIntakeStepDTO,
} from '@corrida/types';
import { logUnexpectedPreRegistrationError } from '../../common/pre-registration-safe-log.js';
import { authMiddleware, alunoMiddleware } from '../auth/auth.middleware.js';
import { PreRegistrationPublicError } from './pre-registration-public.service.js';
import {
  HealthIntakeError,
  preRegistrationHealthIntakeService,
} from './pre-registration-health-intake.service.js';

const router: Router = Router();
const textField = z.string().trim().max(4000).optional();
const consentSchema = z.object({
  privacyNoticeVersion: z.string().trim().min(1).max(80),
  accepted: z.literal(true),
}).strict();
const optionalConsent = consentSchema.optional();

const saveSchema = z.discriminatedUnion('step', [
  z.object({
    expectedVersion: z.number().int().min(1),
    step: z.literal('CONSENT'),
    consent: consentSchema,
    data: z.object({}).strict(),
  }).strict(),
  z.object({
    expectedVersion: z.number().int().min(1),
    step: z.literal('HEALTH_HISTORY'),
    consent: optionalConsent,
    data: z.object({
      mainGoal: textField,
      hasMedicalConditions: z.boolean().optional(),
      medicalHistory: textField,
    }).strict(),
  }).strict(),
  z.object({
    expectedVersion: z.number().int().min(1),
    step: z.literal('MEDICATIONS'),
    consent: optionalConsent,
    data: z.object({
      usesMedication: z.boolean().optional(),
      currentMedications: textField,
      hasAllergies: z.boolean().optional(),
      allergies: textField,
    }).strict(),
  }).strict(),
  z.object({
    expectedVersion: z.number().int().min(1),
    step: z.literal('INJURIES'),
    consent: optionalConsent,
    data: z.object({
      hasInjuries: z.boolean().optional(),
      injuriesHistory: textField,
      hasExerciseRestrictions: z.boolean().optional(),
      exerciseRestrictions: textField,
    }).strict(),
  }).strict(),
  z.object({
    expectedVersion: z.number().int().min(1),
    step: z.literal('ACTIVITY'),
    consent: optionalConsent,
    data: z.object({
      trainingBackground: textField,
      observations: textField,
    }).strict(),
  }).strict(),
  z.object({
    expectedVersion: z.number().int().min(1),
    step: z.literal('REVIEW'),
    consent: optionalConsent,
    data: z.object({}).strict(),
  }).strict(),
]);

const completeSchema = z.object({
  expectedVersion: z.number().int().min(1),
  declarationAccepted: z.literal(true),
}).strict();

const STATUS_BY_CODE: Record<HealthIntakeErrorCode, number> = {
  NOT_FOUND: 404,
  BASIC_PRE_REGISTRATION_REQUIRED: 409,
  CONSENT_REQUIRED: 400,
  CONSENT_VERSION_MISMATCH: 409,
  CONCURRENT_MODIFICATION: 409,
  MISSING_REQUIRED_FIELDS: 400,
  HEALTH_INTAKE_COMPLETED: 409,
};

function userIdOf(req: Request): string {
  return req.user!.userId;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HealthIntakeError(
      result.error.errors.map((item) => item.message).join(', '),
      'MISSING_REQUIRED_FIELDS',
      { fields: result.error.errors.map((item) => item.path.join('.')) }
    );
  }
  return result.data;
}

function safeDetails(error: HealthIntakeError) {
  if (error.code === 'CONCURRENT_MODIFICATION') {
    return { code: error.code, currentVersion: error.details?.currentVersion };
  }
  if (error.code === 'CONSENT_VERSION_MISMATCH') {
    return { code: error.code, requiredVersion: error.details?.requiredVersion };
  }
  if (error.code === 'MISSING_REQUIRED_FIELDS') {
    return { code: error.code, fields: error.details?.fields };
  }
  return { code: error.code };
}

function handleError(res: Response, error: unknown) {
  if (error instanceof HealthIntakeError) {
    return sendError(res, error.message, STATUS_BY_CODE[error.code], safeDetails(error));
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
  logUnexpectedPreRegistrationError(
    'Erro inesperado na Anamnese Inicial',
    correlationId,
    error
  );
  return sendError(res, 'Não foi possível continuar.', 500, {
    code: 'INTERNAL_ERROR',
    correlationId,
  });
}

router.use(authMiddleware, alunoMiddleware);

router.get('/processes/:alunoId/health-intake', async (req, res) => {
  try {
    return sendSuccess(
      res,
      await preRegistrationHealthIntakeService.getSession(userIdOf(req), req.params.alunoId)
    );
  } catch (error) {
    return handleError(res, error);
  }
});

router.patch('/processes/:alunoId/health-intake', async (req, res) => {
  try {
    const input = parse<SaveHealthIntakeStepDTO>(saveSchema, req.body);
    const session = await preRegistrationHealthIntakeService.saveStep(
      userIdOf(req),
      req.params.alunoId,
      input,
      { ipAddress: req.ip, userAgent: req.get('user-agent') || undefined }
    );
    return sendSuccess(res, session, 'Etapa da Anamnese salva');
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/processes/:alunoId/health-intake/complete', async (req, res) => {
  try {
    const input = parse<CompleteHealthIntakeDTO>(completeSchema, req.body);
    const session = await preRegistrationHealthIntakeService.complete(
      userIdOf(req),
      req.params.alunoId,
      input
    );
    return sendSuccess(res, session, 'Anamnese Inicial concluída');
  } catch (error) {
    return handleError(res, error);
  }
});

export function parseHealthIntakeSave(value: unknown): SaveHealthIntakeStepDTO {
  return parse<SaveHealthIntakeStepDTO>(saveSchema, value);
}

export function parseHealthIntakeCompletion(value: unknown): CompleteHealthIntakeDTO {
  return parse<CompleteHealthIntakeDTO>(completeSchema, value);
}

export { router as preRegistrationHealthIntakeRoutes };
