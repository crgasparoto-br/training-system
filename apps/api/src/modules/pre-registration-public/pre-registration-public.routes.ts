import express, { Router, type Request, type Response } from 'express';
import { sendError, sendSuccess } from '@corrida/utils';
import type {
  CompletePreRegistrationDTO,
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

authenticatedRouter.get('/session', async (req, res) => {
  try {
    return sendSuccess(res, await preRegistrationPublicService.getSession(userIdOf(req)));
  } catch (error) {
    return handleError(res, error);
  }
});

authenticatedRouter.patch('/steps', async (req, res) => {
  const input = req.body as SavePreRegistrationStepDTO;
  try {
    const session = await preRegistrationPublicService.saveStep(userIdOf(req), input);
    return sendSuccess(res, session, 'Etapa salva');
  } catch (error) {
    if (
      error instanceof PreRegistrationPublicError &&
      error.code === 'DUPLICATE_REVIEW_REQUIRED' &&
      error.details?.field === 'cpf'
    ) {
      try {
        await preRegistrationDuplicateReviewService.preserveCpfConflict(userIdOf(req), input);
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
});

authenticatedRouter.post('/complete', async (req, res) => {
  try {
    const session = await preRegistrationPublicService.complete(
      userIdOf(req),
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
