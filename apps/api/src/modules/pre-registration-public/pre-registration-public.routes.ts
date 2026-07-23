import express, { Router, type Request, type Response } from 'express';
import { sendError, sendSuccess } from '@corrida/utils';
import type {
  CompletePreRegistrationDTO,
  ConfirmGuardianAuthorizationDTO,
  PreRegistrationAccountRegistrationDTO,
  PreRegistrationClaimDTO,
  SavePreRegistrationStepDTO,
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
      const result = await preRegistrationPublicService.registerAndClaim(
        req.params.token,
        req.body as PreRegistrationAccountRegistrationDTO
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
      req.body as PreRegistrationClaimDTO
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
      req.body as ConfirmGuardianAuthorizationDTO
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
  return saveStepForProcess(
    req,
    res,
    req.params.alunoId,
    req.body as SavePreRegistrationStepDTO
  );
});

authenticatedRouter.post('/processes/:alunoId/complete', async (req, res) => {
  try {
    const session = await preRegistrationPublicService.complete(
      userIdOf(req),
      req.params.alunoId,
      req.body as CompletePreRegistrationDTO,
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
    return saveStepForProcess(req, res, alunoId, req.body as SavePreRegistrationStepDTO);
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
      req.body as CompletePreRegistrationDTO,
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