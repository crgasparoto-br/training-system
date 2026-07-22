import { Router, type Request, type RequestHandler, type Response, type NextFunction } from 'express';
import { sendError, sendSuccess } from '@corrida/utils';
import { PRE_REGISTRATION_INVITE_GENERIC_PUBLIC_ERROR } from '@corrida/types';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { blockAccessMiddleware } from '../access-control/access-control.middleware.js';
import {
  PreRegistrationInviteError,
  PreRegistrationInvitePublicAccessError,
  preRegistrationInviteService,
} from './pre-registration-invite.service.js';
import { preRegistrationInviteRateLimit } from './pre-registration-invite-rate-limit.middleware.js';

const adminRouter: Router = Router();
const publicRouter: Router = Router();

const ERROR_STATUS_BY_CODE: Record<string, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  PRECONDITION_FAILED: 409,
  ACTIVE_INVITE_EXISTS: 409,
  CONCURRENT_MODIFICATION: 409,
  MISSING_REQUIRED_FIELDS: 400,
  INVALID_REASON: 400,
};

function actorFromRequest(req: Request) {
  return {
    userId: req.user?.userId,
    professorId: req.user?.professorId,
  };
}

/** contractId do professor autenticado; sempre presente após professorMiddleware. */
function contractIdOf(req: Request): string {
  return req.user!.contractId as string;
}

function handleDomainError(res: Response, error: unknown) {
  if (error instanceof PreRegistrationInviteError) {
    const status = ERROR_STATUS_BY_CODE[error.code] ?? 400;
    return sendError(res, error.message, status, { code: error.code, ...error.details });
  }
  const message = error instanceof Error ? error.message : 'Erro inesperado.';
  return sendError(res, message, 500);
}

/** Encapsula o try/catch repetido de todas as rotas administrativas. */
function withDomainErrorHandling(
  handler: (req: Request, res: Response) => Promise<Response>
): RequestHandler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      handleDomainError(res, error);
    }
  };
}

// Toda rota administrativa (mutação e consulta) exige professor autenticado
// do tenant e a permissão dedicada, por consistência com as demais rotas
// administrativas do módulo.
const requireProfessor = [authMiddleware, professorMiddleware];
const requireInviteManagementAccess = [
  ...requireProfessor,
  blockAccessMiddleware('students.actions.manageEnrollmentInvite'),
];

// ============================================================================
// ADMINISTRATIVO (autenticado, escopado ao tenant do professor)
// ============================================================================

adminRouter.post(
  '/:alunoId/pre-registration-invites',
  ...requireInviteManagementAccess,
  withDomainErrorHandling(async (req, res) => {
    const result = await preRegistrationInviteService.generateFirstInvite(
      req.params.alunoId,
      contractIdOf(req),
      actorFromRequest(req)
    );
    return sendSuccess(res, result, 'Convite de pré-cadastro gerado com sucesso');
  })
);

adminRouter.post(
  '/:alunoId/pre-registration-invites/regenerate',
  ...requireInviteManagementAccess,
  withDomainErrorHandling(async (req, res) => {
    const result = await preRegistrationInviteService.regenerateInvite(
      req.params.alunoId,
      contractIdOf(req),
      actorFromRequest(req)
    );
    return sendSuccess(res, result, 'Novo convite gerado; o link anterior foi invalidado');
  })
);

adminRouter.post(
  '/:alunoId/pre-registration-invites/revoke',
  ...requireInviteManagementAccess,
  withDomainErrorHandling(async (req, res) => {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
    const summary = await preRegistrationInviteService.revokeInvite(
      req.params.alunoId,
      contractIdOf(req),
      reason,
      actorFromRequest(req)
    );
    return sendSuccess(res, summary, 'Convite revogado');
  })
);

adminRouter.get(
  '/:alunoId/pre-registration-invites/summary',
  ...requireInviteManagementAccess,
  withDomainErrorHandling(async (req, res) => {
    const summary = await preRegistrationInviteService.getSummary(req.params.alunoId, contractIdOf(req));
    return sendSuccess(res, summary);
  })
);

adminRouter.get(
  '/:alunoId/pre-registration-invites/history',
  ...requireInviteManagementAccess,
  withDomainErrorHandling(async (req, res) => {
    const history = await preRegistrationInviteService.getHistory(req.params.alunoId, contractIdOf(req));
    return sendSuccess(res, history);
  })
);

adminRouter.get(
  '/:alunoId/pre-registration-invites/allowed-actions',
  ...requireInviteManagementAccess,
  withDomainErrorHandling(async (req, res) => {
    const actions = await preRegistrationInviteService.getAllowedActions(req.params.alunoId, contractIdOf(req));
    return sendSuccess(res, actions);
  })
);

// ============================================================================
// PÚBLICO (rota própria, conceitualmente /pre-cadastro/:token)
// ============================================================================

function noPublicCache(_req: Request, res: Response, next: NextFunction) {
  // Impede cache público de respostas associadas ao token e evita
  // vazamento do token via cabeçalho Referer em navegação subsequente.
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

publicRouter.get(
  '/pre-cadastro/:token',
  noPublicCache,
  preRegistrationInviteRateLimit,
  async (req: Request, res: Response) => {
    try {
      const view = await preRegistrationInviteService.openPublicInvite(req.params.token, {
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || undefined,
      });
      return sendSuccess(res, view);
    } catch (error) {
      if (error instanceof PreRegistrationInvitePublicAccessError) {
        // Resposta genérica: inválido, expirado, revogado, substituído ou de
        // outro tenant produzem exatamente a mesma resposta pública.
        return sendError(res, error.message, 404);
      }
      return sendError(res, PRE_REGISTRATION_INVITE_GENERIC_PUBLIC_ERROR, 404);
    }
  }
);

export default adminRouter;
export { adminRouter as preRegistrationInviteAdminRoutes };
export { publicRouter as preRegistrationInvitePublicRoutes };
