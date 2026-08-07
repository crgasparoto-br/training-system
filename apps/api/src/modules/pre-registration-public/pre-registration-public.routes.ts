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
  type PreRegistrationSessionDTO,
  type SavePreRegistrationStepDTO,
} from '@corrida/types';
import { logUnexpectedPreRegistrationError } from '../../common/pre-registration-safe-log.js';
import { authMiddleware, alunoMiddleware } from '../auth/auth.middleware.js';
import {
  preRegistrationInvitePublicHeaders,
} from '../pre-registration-invites/pre-registration-invite.routes.js';
import { preRegistrationInviteRateLimit } from '../pre-registration-invites/pre-registration-invite-rate-limit.middleware.js';
import { assertPreRegistrationClaimRoleEligibility } from './pre-registration-claim-role.guard.js';
import { preRegistrationDuplicateReviewService } from './pre-registration-duplicate-review.service.js';
import { preRegistrationProcessSummaryService } from './pre-registration-process-summary.service.js';
import { preRegistrationPublicAtomicService } from './pre-registration-public-atomic.service.js';
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
const nullableTrimmed = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .nullable()
    .optional()
    .transform((value) => value ?? undefined);
const identificationStepDataSchema = z.object({
  name: nullableTrimmed(z.string().trim().min(3).max(200)),
  cpf: nullableTrimmed(z.string().trim().max(20)),
  birthDate: nullableTrimmed(
    z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a data no formato AAAA-MM-DD')
  ),
  gender: nullableTrimmed(z.enum(['male', 'female', 'other'])),
}).strict();
const contactStepDataSchema = z.object({
  phone: nullableTrimmed(z.string().trim().max(40)),
  additionalPhone: nullableTrimmed(z.string().trim().max(40)),
  email: nullableTrimmed(z.string().trim().email('E-mail inválido').max(320)),
  additionalEmail: nullableTrimmed(
    z.string().trim().email('E-mail alternativo inválido').max(320)
  ),
}).strict();
const addressStepDataSchema = z.object({
  addressStreet: nullableTrimmed(z.string().trim().max(200)),
  addressNumber: nullableTrimmed(z.string().trim().max(40)),
  addressComplement: nullableTrimmed(z.string().trim().max(200)),
  addressNeighborhood: nullableTrimmed(z.string().trim().max(150)),
  addressCity: nullableTrimmed(z.string().trim().max(150)),
  addressState: nullableTrimmed(z.string().trim().max(10)),
  addressZipCode: nullableTrimmed(z.string().trim().max(20)),
}).strict();
const guardianStepDataSchema = z.object({
  guardianName: nullableTrimmed(z.string().trim().max(200)),
  guardianCpf: nullableTrimmed(z.string().trim().max(20)),
  guardianPhone: nullableTrimmed(z.string().trim().max(40)),
  guardianEmail: nullableTrimmed(z.string().trim().email('E-mail do responsável inválido').max(320)),
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
    if (error.code === 'DUPLICATE_REVIEW_REQUIRED') {
      // Esta condição deve ser consumida internamente pelo fluxo de preservação.
      // Se escapar por uma rota não prevista, não devolva um oráculo de existência.
      return sendError(
        res,
        'Os dados foram alterados em outro local. Recarregue antes de continuar.',
        409,
        { code: 'CONCURRENT_MODIFICATION' }
      );
    }
    return sendError(
      res,
      error.message,
      STATUS_BY_CODE[error.code] ?? 400,
      publicErrorDetails(error)
    );
  }
  const correlationId = crypto.randomUUID();
  logUnexpectedPreRegistrationError(
    'Erro inesperado no pré-cadastro público',
    correlationId,
    error
  );
  return sendError(res, 'Não foi possível continuar.', 500, {
    code: 'INTERNAL_ERROR',
    correlationId,
  });
}

function parseInput<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T {
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

async function projectPublicSession(
  userId: string,
  alunoId: string,
  session: PreRegistrationSessionDTO
): Promise<PreRegistrationSessionDTO> {
  return preRegistrationDuplicateReviewService.projectPublicSession(
    userId,
    alunoId,
    session
  );
}

async function loadPublicSession(
  userId: string,
  alunoId: string
): Promise<PreRegistrationSessionDTO> {
  const session = await preRegistrationPublicAtomicService.getSession(userId, alunoId);
  return projectPublicSession(userId, alunoId, session);
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
      const result = await preRegistrationPublicService.registerAndClaim(req.params.token, input);
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
    return sendSuccess(res, await preRegistrationProcessSummaryService.listProcesses(userIdOf(req)));
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
      await loadPublicSession(userIdOf(req), req.params.alunoId)
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
  const userId = userIdOf(req);
  try {
    if (
      await preRegistrationDuplicateReviewService.hasPendingDuplicateReview(
        userId,
        alunoId
      )
    ) {
      await preRegistrationDuplicateReviewService.preserveDuplicateConflict(
        userId,
        alunoId,
        input
      );
      return sendSuccess(
        res,
        await loadPublicSession(userId, alunoId),
        'Etapa salva'
      );
    }

    const session = await preRegistrationPublicAtomicService.saveStep(
      userId,
      alunoId,
      input
    );
    return sendSuccess(
      res,
      await projectPublicSession(userId, alunoId, session),
      'Etapa salva'
    );
  } catch (error) {
    if (
      error instanceof PreRegistrationPublicError &&
      error.code === 'DUPLICATE_REVIEW_REQUIRED'
    ) {
      try {
        await preRegistrationDuplicateReviewService.preserveDuplicateConflict(
          userId,
          alunoId,
          input
        );
        return sendSuccess(
          res,
          await loadPublicSession(userId, alunoId),
          'Etapa salva'
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
    const userId = userIdOf(req);
    const session = await preRegistrationPublicAtomicService.complete(
      userId,
      req.params.alunoId,
      parseInput<CompletePreRegistrationDTO>(completeSchema, req.body),
      { ipAddress: req.ip, userAgent: req.get('user-agent') || undefined }
    );
    return sendSuccess(
      res,
      await projectPublicSession(userId, req.params.alunoId, session),
      'Pré-cadastro concluído'
    );
  } catch (error) {
    return handleError(res, error);
  }
});

// Compatibilidade temporária para consumidores anteriores: somente é aceita
// quando a conta possui exatamente um processo. Contas com múltiplos dependentes
// devem usar os endpoints process-scoped acima.
authenticatedRouter.get('/session', async (req, res) => {
  try {
    const userId = userIdOf(req);
    const alunoId = await singleProcessId(userId);
    return sendSuccess(res, await loadPublicSession(userId, alunoId));
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
    const userId = userIdOf(req);
    const alunoId = await singleProcessId(userId);
    const session = await preRegistrationPublicAtomicService.complete(
      userId,
      alunoId,
      parseInput<CompletePreRegistrationDTO>(completeSchema, req.body),
      { ipAddress: req.ip, userAgent: req.get('user-agent') || undefined }
    );
    return sendSuccess(
      res,
      await projectPublicSession(userId, alunoId, session),
      'Pré-cadastro concluído'
    );
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
