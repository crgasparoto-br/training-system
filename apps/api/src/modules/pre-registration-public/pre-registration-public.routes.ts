import crypto from 'node:crypto';
import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { RegisterSchema, sendError, sendSuccess } from '@corrida/utils';
import {
  PRE_REGISTRATION_CLAIM_ROLES,
  type CompletePreRegistrationDTO,
  type ConfirmGuardianAuthorizationDTO,
  type PreRegistrationAccountRegistrationDTO,
  type PreRegistrationClaimDTO,
  type PreRegistrationPublicErrorCode,
  type SavePreRegistrationStepDTO,
} from '@corrida/types';
import { authMiddleware, alunoMiddleware } from '../auth/auth.middleware.js';
import {
  preRegistrationInvitePublicHeaders,
} from '../pre-registration-invites/pre-registration-invite.routes.js';
import { preRegistrationInviteRateLimit } from '../pre-registration-invites/pre-registration-invite-rate-limit.middleware.js';
import { assertPreRegistrationClaimRoleEligibility } from './pre-registration-claim-role.guard.js';
import { preRegistrationDuplicateReviewService } from './pre-registration-duplicate-review.service.js';
import {
  PreRegistrationPublicError,
  preRegistrationPublicService,
} from './pre-registration-public.service.js';

const publicRouter: Router = Router();
const authenticatedRouter: Router = Router();
const claimRoleSchema = z.enum(PRE_REGISTRATION_CLAIM_ROLES);
const invitedAccountSchema = RegisterSchema.pick({
  name: true,
  email: true,
  password: true,
}).extend({
  role: claimRoleSchema,
}).strict();
const claimSchema = z.object({
  token: z.string().min(1, 'Token inválido').max(512, 'Token inválido'),
  role: claimRoleSchema,
}).strict();
const guardianAuthorizationSchema = z.object({
  relationship: z.string().trim().min(2, 'Informe o vínculo com o menor').max(100),
  declarationAccepted: z.literal(true),
}).strict();
const identificationStepDataSchema = z.object({
  name: z.string().trim().min(3).max(200).optional(),
  cpf: z.string().trim().max(20).optional(),
  birthDate: z.string().trim().max(40).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
}).strict();
const contactStepDataSchema = z.object({
  phone: z.string().trim().max(40).optional(),
  additionalPhone: z.string().trim().max(40).optional(),
  email: z.string().trim().email('E-mail inválido').max(320).optional(),
  additionalEmail: z.string().trim().email('E-mail alternativo inválido').max(320).optional(),
}).strict();
const addressStepDataSchema = z.object({
  addressStreet: z.string().trim().max(200).optional(),
  addressNumber: z.string().trim().max(40).optional(),
  addressComplement: z.string().trim().max(200).optional(),
  addressNeighborhood: z.string().trim().max(150).optional(),
  addressCity: z.string().trim().max(150).optional(),
  addressState: z.string().trim().max(10).optional(),
  addressZipCode: z.string().trim().max(20).optional(),
}).strict();
const guardianStepDataSchema = z.object({
  guardianName: z.string().trim().max(200).optional(),
  guardianCpf: z.string().trim().max(20).optional(),
  guardianPhone: z.string().trim().max(40).optional(),
  guardianEmail: z.string().trim().email('E-mail do responsável inválido').max(320).optional(),
}).strict();
const saveStepSchema = z.discriminatedUnion('step', [
  z.object({
    expectedVersion: z.number().int().min(1),
    step: z.literal('IDENTIFICATION'),
    data: identificationStepDataSchema,
  }).strict(),
  z.object({
    expectedVersion: z.number().int().min(1),
    step: z.literal('CONTACT'),
    data: contactStepDataSchema,
  }).strict(),
  z.object({
    expectedVersion: z.number().int().min(1),
    step: z.literal('ADDRESS'),
    data: addressStepDataSchema,
  }).strict(),
  z.object({
    expectedVersion: z.number().int().min(1),
    step: z.literal('GUARDIAN'),
    data: guardianStepDataSchema,
  }).strict(),
  z.object({
    expectedVersion: z.number().int().min(1),
    step: z.literal('PRIVACY'),
    data: z.object({}).strict(),
  }).strict(),
]);
const completeSchema = z.object({
  expectedVersion: z.number().int().min(1),
  privacyAccepted: z.literal(true),
}).strict();

const STATUS_BY_CODE: Record<string, number> = {
  INVALID_INVITE: 404,
  ACCOUNT_EXISTS: 409,
  ACCOUNT_INCOMPATIBLE: 409,
  ACCOUNT_ALREADY_LINKED: 409,
  CONCURRENT_MODIFICATION: 409,
  DUPLICATE_REVIEW_REQUIRED: 409,
  MISSING_REQUIRED_FIELDS: 400,
  GUARDIAN_AUTHORIZATION_REQUIRED: 409,
  PRE_REGISTRATION_COMPLETED: 409,
  ACTIVE_STUDENT: 409,
  NOT_FOUND: 404,
};

const PUBLIC_ERROR_DETAIL_KEYS: Partial<
  Record<PreRegistrationPublicErrorCode, readonly string[]>
> = {
  CONCURRENT_MODIFICATION: ['currentVersion'],
  DUPLICATE_REVIEW_REQUIRED: ['field', 'draftPreserved', 'reviewRequired'],
  MISSING_REQUIRED_FIELDS: ['fields'],
  GUARDIAN_AUTHORIZATION_REQUIRED: ['recommendedRole'],
  ACTIVE_STUDENT: ['redirectTo'],
};

function publicErrorDetails(error: PreRegistrationPublicError): Record<string, unknown> {
  const details: Record<string, unknown> = { code: error.code };
  const allowedKeys = PUBLIC_ERROR_DETAIL_KEYS[error.code];
  if (!allowedKeys || !error.details) return details;

  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(error.details, key)) {
      details[key] = error.details[key];
    }
  }
  return details;
}

function handleError(res: Response, error: unknown) {
  if (error instanceof PreRegistrationPublicError) {
    return sendError(
      res,
      error.message,
      STATUS_BY_CODE[error.code] ?? 400,
      publicErrorDetails(error)
    );
  }

  const correlationId = crypto.randomUUID();
  console.error('Erro inesperado no pré-cadastro público', { correlationId, error });
  return sendError(res, 'Não foi possível continuar.', 500, {
    code: 'INTERNAL_ERROR',
    correlationId,
  });
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const validation = schema.safeParse(value);
  if (!validation.success) {
    throw new PreRegistrationPublicError(
      validation.error.errors.map((item) => item.message).join(', '),
      'MISSING_REQUIRED_FIELDS'
    );
  }
  return validation.data;
}

function userIdOf(req: Request): string {
  return req.user!.userId;
}

async function singleProcessId(userId: string): Promise<string> {
  const processes = await preRegistrationPublicService.listProcesses(userId);
  if (processes.length !== 1) {
    throw new PreRegistrationPublicError(
      processes.length === 0
        ? 'Cadastro não encontrado.'
        : 'Escolha qual pré-cadastro deseja acessar.',
      processes.length === 0 ? 'NOT_FOUND' : 'ACCOUNT_INCOMPATIBLE',
      { processSelectionRequired: processes.length > 1 }
    );
  }
  return processes[0].alunoId;
}

publicRouter.post(
  '/pre-cadastro/:token/register',
  preRegistrationInvitePublicHeaders,
  preRegistrationInviteRateLimit,
  express.json({ limit: '32kb' }),
  async (req, res) => {
    try {
      const input = parseInput<PreRegistrationAccountRegistrationDTO>(invitedAccountSchema, req.body);
      await assertPreRegistrationClaimRoleEligibility(req.params.token, input.role);
      const result = await preRegistrationPublicService.registerAndClaim(
        req.params.token,
        input
      );
      return sendSuccess(res, result, 'Acesso criado e convite vinculado', 201);
    } catch (error) {
      return handleError(res, error);
    }
  }
);

authenticatedRouter.use(authMiddleware, alunoMiddleware);

authenticatedRouter.post('/claim', async (req, res) => {
  try {
    const input = parseInput<PreRegistrationClaimDTO>(claimSchema, req.body);
    await assertPreRegistrationClaimRoleEligibility(input.token, input.role);
    const result = await preRegistrationPublicService.claim(userIdOf(req), input);
    return sendSuccess(res, result, 'Convite vinculado à sua conta');
  } catch (error) {
    return handleError(res, error);
  }
});

authenticatedRouter.get('/processes', async (req, res) => {
  try {
    return sendSuccess(res, await preRegistrationPublicService.listProcesses(userIdOf(req)));
  } catch (error) {
    return handleError(res, error);
  }
});

authenticatedRouter.post('/processes/:alunoId/guardian-authorization', async (req, res) => {
  try {
    const session = await preRegistrationPublicService.requestGuardianAuthorization(
      userIdOf(req),
      req.params.alunoId,
      parseInput<ConfirmGuardianAuthorizationDTO>(guardianAuthorizationSchema, req.body)
    );
    return sendSuccess(res, session, 'Solicitação de vínculo enviada para validação', 202);
  } catch (error) {
    return handleError(res, error);
  }
});

authenticatedRouter.get('/processes/:alunoId/session', async (req, res) => {
  try {
    return sendSuccess(
      res,
      await preRegistrationPublicService.getSession(userIdOf(req), req.params.alunoId)
    );
  } catch (error) {
    return handleError(res, error);
  }
});

async function saveStepForProcess(
  req: Request,
  res: Response,
  alunoId: string,
  input: SavePreRegistrationStepDTO
) {
  try {
    const session = await preRegistrationPublicService.saveStep(userIdOf(req), alunoId, input);
    return sendSuccess(res, session, 'Etapa salva');
  } catch (error) {
    if (
      error instanceof PreRegistrationPublicError &&
      error.code === 'DUPLICATE_REVIEW_REQUIRED' &&
      error.details?.field === 'cpf'
    ) {
      try {
        await preRegistrationDuplicateReviewService.preserveCpfConflict(
          userIdOf(req),
          alunoId,
          input
        );
        return handleError(
          res,
          new PreRegistrationPublicError(
            'Este CPF já pertence a outro cadastro. Os demais dados foram salvos e enviados para revisão da academia.',
            'DUPLICATE_REVIEW_REQUIRED',
            { field: 'cpf', draftPreserved: true, reviewRequired: true }
          )
        );
      } catch (preservationError) {
        const message = preservationError instanceof Error
          ? preservationError.message
          : 'Não foi possível preservar o rascunho.';
        if (message.includes('alterado em outro acesso')) {
          return handleError(
            res,
            new PreRegistrationPublicError(message, 'CONCURRENT_MODIFICATION')
          );
        }
        return handleError(res, preservationError);
      }
    }
    return handleError(res, error);
  }
}

authenticatedRouter.patch('/processes/:alunoId/steps', async (req, res) => {
  try {
    const input = parsePreRegistrationSaveStep(req.body);
    return saveStepForProcess(req, res, req.params.alunoId, input);
  } catch (error) {
    return handleError(res, error);
  }
});

authenticatedRouter.post('/processes/:alunoId/complete', async (req, res) => {
  try {
    const session = await preRegistrationPublicService.complete(
      userIdOf(req),
      req.params.alunoId,
      parseInput<CompletePreRegistrationDTO>(completeSchema, req.body),
      { ipAddress: req.ip, userAgent: req.get('user-agent') || undefined }
    );
    return sendSuccess(res, session, 'Pré-cadastro concluído');
  } catch (error) {
    return handleError(res, error);
  }
});

// Compatibilidade temporária para consumidores anteriores: somente é aceita
// quando a conta possui exatamente um processo. Contas com múltiplos dependentes
// devem usar os endpoints process-scoped acima.
authenticatedRouter.get('/session', async (req, res) => {
  try {
    const alunoId = await singleProcessId(userIdOf(req));
    return sendSuccess(res, await preRegistrationPublicService.getSession(userIdOf(req), alunoId));
  } catch (error) {
    return handleError(res, error);
  }
});

authenticatedRouter.patch('/steps', async (req, res) => {
  try {
    const alunoId = await singleProcessId(userIdOf(req));
    const input = parsePreRegistrationSaveStep(req.body);
    return saveStepForProcess(req, res, alunoId, input);
  } catch (error) {
    return handleError(res, error);
  }
});

authenticatedRouter.post('/complete', async (req, res) => {
  try {
    const alunoId = await singleProcessId(userIdOf(req));
    const session = await preRegistrationPublicService.complete(
      userIdOf(req),
      alunoId,
      parseInput<CompletePreRegistrationDTO>(completeSchema, req.body),
      { ipAddress: req.ip, userAgent: req.get('user-agent') || undefined }
    );
    return sendSuccess(res, session, 'Pré-cadastro concluído');
  } catch (error) {
    return handleError(res, error);
  }
});

export function parsePreRegistrationSaveStep(value: unknown): SavePreRegistrationStepDTO {
  return parseInput<SavePreRegistrationStepDTO>(saveStepSchema, value);
}

export {
  publicRouter as preRegistrationPublicEntryRoutes,
  authenticatedRouter as preRegistrationAuthenticatedRoutes,
};
