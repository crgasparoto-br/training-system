import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { RegisterSchema, sendError, sendSuccess } from '@corrida/utils';
import {
  PRE_REGISTRATION_CLAIM_ROLES,
  PRE_REGISTRATION_STEPS,
  type CompletePreRegistrationDTO,
  type ConfirmGuardianAuthorizationDTO,
  type PreRegistrationAccountRegistrationDTO,
  type PreRegistrationClaimDTO,
  type SavePreRegistrationStepDTO,
} from '@corrida/types';
import { authMiddleware, alunoMiddleware } from '../auth/auth.middleware.js';
import {
  preRegistrationInvitePublicHeaders,
} from '../pre-registration-invites/pre-registration-invite.routes.js';
import { preRegistrationInviteRateLimit } from '../pre-registration-invites/pre-registration-invite-rate-limit.middleware.js';
import { preRegistrationDuplicateReviewService } from './pre-registration-duplicate-review.service.js';
import {
  PreRegistrationPublicError,
  preRegistrationPublicService,
} from './pre-registration-public.service.js';

const publicRouter: Router = Router();
const authenticatedRouter: Router = Router();
const claimRoleSchema = z.enum(PRE_REGISTRATION_CLAIM_ROLES);
const stepSchema = z.enum(PRE_REGISTRATION_STEPS);
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
const publicIdentitySchema = z.object({
  name: z.string().trim().min(3).max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email('E-mail inválido').max(320).optional(),
  cpf: z.string().trim().max(20).optional(),
  birthDate: z.string().trim().max(40).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  addressStreet: z.string().trim().max(200).optional(),
  addressNumber: z.string().trim().max(40).optional(),
  addressComplement: z.string().trim().max(200).optional(),
  addressNeighborhood: z.string().trim().max(150).optional(),
  addressCity: z.string().trim().max(150).optional(),
  addressState: z.string().trim().max(10).optional(),
  addressZipCode: z.string().trim().max(20).optional(),
  guardianName: z.string().trim().max(200).optional(),
  guardianCpf: z.string().trim().max(20).optional(),
  guardianPhone: z.string().trim().max(40).optional(),
  guardianEmail: z.string().trim().email('E-mail do responsável inválido').max(320).optional(),
  guardianRelationship: z.string().trim().max(100).optional(),
  guardianDeclarationAccepted: z.boolean().optional(),
}).strict();
const saveStepSchema = z.object({
  expectedVersion: z.number().int().min(1),
  step: stepSchema,
  data: publicIdentitySchema,
}).strict();
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
  NOT_FOUND: 404,
};

function handleError(res: Response, error: unknown) {
  if (error instanceof PreRegistrationPublicError) {
    return sendError(res, error.message, STATUS_BY_CODE[error.code] ?? 400, {
      code: error.code,
      ...error.details,
    });
  }
  const message = error instanceof Error ? error.message : 'Não foi possível continuar.';
  return sendError(res, message, 500);
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
    const result = await preRegistrationPublicService.claim(
      userIdOf(req),
      parseInput<PreRegistrationClaimDTO>(claimSchema, req.body)
    );
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
    const session = await preRegistrationPublicService.confirmGuardianAuthorization(
      userIdOf(req),
      req.params.alunoId,
      parseInput<ConfirmGuardianAuthorizationDTO>(guardianAuthorizationSchema, req.body)
    );
    return sendSuccess(res, session, 'Vínculo do responsável confirmado');
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
    const input = parseInput<SavePreRegistrationStepDTO>(saveStepSchema, req.body);
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
    const input = parseInput<SavePreRegistrationStepDTO>(saveStepSchema, req.body);
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

export {
  publicRouter as preRegistrationPublicEntryRoutes,
  authenticatedRouter as preRegistrationAuthenticatedRoutes,
};