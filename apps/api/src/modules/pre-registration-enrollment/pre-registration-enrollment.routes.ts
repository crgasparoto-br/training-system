import express, { Router, type NextFunction, type Request, type Response } from 'express';
import type {
  PreRegistrationConfirmEnrollmentInputDTO,
  PreRegistrationDuplicateDecisionInputDTO,
  PreRegistrationReadyForEnrollmentInputDTO,
} from '@corrida/types';
import { authMiddleware, alunoMiddleware } from '../auth/auth.middleware.js';
import {
  blockAccessMiddleware,
  screenAccessMiddleware,
} from '../access-control/access-control.middleware.js';
import { preRegistrationAdminService } from '../pre-registration-admin/pre-registration-admin.service.js';
import {
  assertPreRegistrationAlunoVisible,
} from './pre-registration-enrollment-access.service.js';
import {
  preRegistrationEnrollmentCreateService,
  type CreatePreRegistrationLeadWithDecisionDTO,
} from './pre-registration-enrollment-create.service.js';
import {
  assertDuplicateDecisionScope,
  projectScopedEnrollmentReview,
  projectScopedLeadDuplicateCheck,
} from './pre-registration-enrollment-response.service.js';
import {
  PreRegistrationEnrollmentError,
  preRegistrationEnrollmentService,
  type PreRegistrationEnrollmentActor,
} from './pre-registration-enrollment.service.js';

export const preRegistrationEnrollmentRoutes: Router = Router();
export const preRegistrationPublicDeduplicationGuardRoutes: Router = Router();

preRegistrationEnrollmentRoutes.use(authMiddleware);
preRegistrationEnrollmentRoutes.use(screenAccessMiddleware('students.preRegistration'));

const createAccess = blockAccessMiddleware('students.preRegistration.create');
const editAccess = blockAccessMiddleware('students.preRegistration.editCommercial');
const reviewAccess = blockAccessMiddleware('students.preRegistration.review');
const convertAccess = blockAccessMiddleware('students.preRegistration.convert');
const IDENTITY_KEYS = new Set([
  'name',
  'cpf',
  'birthDate',
  'phone',
  'additionalPhone',
  'email',
  'additionalEmail',
]);

type AuthUser = {
  userId?: string;
  professorId?: string;
  contractId?: string;
};

function actorFrom(req: Request): PreRegistrationEnrollmentActor {
  const user = req.user as AuthUser | undefined;
  return {
    userId: user?.userId,
    professorId: user?.professorId || '',
    contractId: user?.contractId || '',
  };
}

function statusFor(error: unknown): number {
  const code = (error as { code?: string })?.code;
  if (code === 'NOT_FOUND') return 404;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'INVALID_INPUT') return 400;
  if (
    code === 'DUPLICATE_REVIEW_REQUIRED' ||
    code === 'BLOCKING_DUPLICATE' ||
    code === 'REVIEW_STALE' ||
    code === 'CONCURRENT_MODIFICATION' ||
    code === 'ACTIVE_STUDENT'
  ) {
    return 409;
  }
  if (code === 'PRECONDITION_FAILED' || code === 'HEALTH_REASSOCIATION_REQUIRED') return 422;
  return 500;
}

function respondError(res: Response, error: unknown) {
  const status = statusFor(error);
  const domain = error as { code?: string; details?: Record<string, unknown> };
  if (status === 500) console.error('Erro no fluxo de revisão e matrícula:', error);
  return res.status(status).json({
    success: false,
    error: error instanceof Error ? error.message : 'Não foi possível processar a solicitação.',
    code: domain.code || 'INTERNAL_ERROR',
    details: domain.details,
  });
}

function publicDuplicateResponse(res: Response) {
  return res.status(409).json({
    success: false,
    error: 'Este cadastro precisa de revisão pela academia antes de continuar.',
    code: 'DUPLICATE_REVIEW_REQUIRED',
    details: { reviewRequired: true },
  });
}

preRegistrationPublicDeduplicationGuardRoutes.post(
  '/pre-cadastro/:token/register',
  express.json({ limit: '32kb' }),
  async (req, res, next) => {
    try {
      const result = await preRegistrationEnrollmentService.inspectByInviteToken(req.params.token, {
        name: typeof req.body?.name === 'string' ? req.body.name : undefined,
        email: typeof req.body?.email === 'string' ? req.body.email : undefined,
      });
      if (result.classification === 'BLOCKING' || result.classification === 'REVIEW_REQUIRED') {
        return publicDuplicateResponse(res);
      }
      return next();
    } catch (error) {
      if (error instanceof PreRegistrationEnrollmentError) return publicDuplicateResponse(res);
      return next(error);
    }
  }
);

preRegistrationPublicDeduplicationGuardRoutes.post(
  '/pre-registration/claim',
  express.json({ limit: '32kb' }),
  authMiddleware,
  alunoMiddleware,
  async (req, res, next) => {
    try {
      const token = typeof req.body?.token === 'string' ? req.body.token : '';
      const user = req.user as AuthUser | undefined;
      const result = await preRegistrationEnrollmentService.inspectByInviteToken(token, {
        userId: user?.userId,
      });
      if (result.classification === 'BLOCKING' || result.classification === 'REVIEW_REQUIRED') {
        return publicDuplicateResponse(res);
      }
      return next();
    } catch (error) {
      if (error instanceof PreRegistrationEnrollmentError) return publicDuplicateResponse(res);
      return next(error);
    }
  }
);

preRegistrationEnrollmentRoutes.post(
  '/leads/duplicates',
  createAccess,
  async (req, res, next) => {
    try {
      const actor = actorFrom(req);
      const result = await preRegistrationEnrollmentService.inspectProposedLead(actor, req.body || {});
      const data = await projectScopedLeadDuplicateCheck(actor, result);
      return res.json({ success: true, data });
    } catch (error) {
      if (error instanceof PreRegistrationEnrollmentError) return respondError(res, error);
      return next(error);
    }
  }
);

preRegistrationEnrollmentRoutes.post('/leads', createAccess, async (req, res, next) => {
  try {
    const actor = actorFrom(req);
    const leadId = await preRegistrationEnrollmentCreateService.create(
      actor,
      req.body as CreatePreRegistrationLeadWithDecisionDTO
    );
    const data = await preRegistrationAdminService.getDetail(actor, leadId);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    if (error instanceof PreRegistrationEnrollmentError) return respondError(res, error);
    return next(error);
  }
});

preRegistrationEnrollmentRoutes.patch('/leads/:id', editAccess, async (req, res, next) => {
  if (!Object.keys(req.body || {}).some((key) => IDENTITY_KEYS.has(key))) return next();
  try {
    const actor = actorFrom(req);
    await assertPreRegistrationAlunoVisible(actor, req.params.id);
    const result = await preRegistrationEnrollmentService.inspectProposedUpdate(
      actor,
      req.params.id,
      req.body || {}
    );
    if (result.classification === 'BLOCKING' || result.classification === 'REVIEW_REQUIRED') {
      const scoped = await projectScopedLeadDuplicateCheck(actor, result);
      throw new PreRegistrationEnrollmentError(
        result.classification === 'BLOCKING'
          ? 'A alteração cria um conflito bloqueante de identidade.'
          : 'A alteração exige revisão de duplicidade antes de ser salva.',
        result.classification === 'BLOCKING' ? 'BLOCKING_DUPLICATE' : 'DUPLICATE_REVIEW_REQUIRED',
        scoped
      );
    }
    return next();
  } catch (error) {
    if (error instanceof PreRegistrationEnrollmentError) return respondError(res, error);
    return next(error);
  }
});

preRegistrationEnrollmentRoutes.get(
  '/leads/:id/enrollment-review',
  reviewAccess,
  async (req, res) => {
    try {
      const actor = actorFrom(req);
      await assertPreRegistrationAlunoVisible(actor, req.params.id);
      const review = await preRegistrationEnrollmentService.inspect(actor, req.params.id);
      const data = await projectScopedEnrollmentReview(actor, review);
      return res.json({ success: true, data });
    } catch (error) {
      return respondError(res, error);
    }
  }
);

preRegistrationEnrollmentRoutes.post(
  '/leads/:id/duplicate-decision',
  reviewAccess,
  async (req, res) => {
    try {
      const actor = actorFrom(req);
      const input = req.body as PreRegistrationDuplicateDecisionInputDTO;
      await assertPreRegistrationAlunoVisible(actor, req.params.id);
      const currentReview = await preRegistrationEnrollmentService.inspect(actor, req.params.id);
      await assertDuplicateDecisionScope(actor, currentReview, input);
      const result = await preRegistrationEnrollmentService.decide(actor, req.params.id, input);
      const data = 'canonicalAlunoId' in result
        ? result
        : await projectScopedEnrollmentReview(actor, result);
      return res.json({ success: true, data });
    } catch (error) {
      return respondError(res, error);
    }
  }
);

// Intercepta a rota legada para impedir que referências textuais contornem a revisão versionada.
preRegistrationEnrollmentRoutes.post('/leads/:id/review', reviewAccess, async (req, res) => {
  try {
    const actor = actorFrom(req);
    await assertPreRegistrationAlunoVisible(actor, req.params.id);
    const review = await preRegistrationEnrollmentService.markReady(
      actor,
      req.params.id,
      req.body as PreRegistrationReadyForEnrollmentInputDTO
    );
    const data = await projectScopedEnrollmentReview(actor, review);
    return res.json({ success: true, data });
  } catch (error) {
    return respondError(res, error);
  }
});

// Intercepta a rota legada para tornar a confirmação idempotente e revalidar duplicidades no commit.
preRegistrationEnrollmentRoutes.post('/leads/:id/convert', convertAccess, async (req, res) => {
  try {
    const actor = actorFrom(req);
    await assertPreRegistrationAlunoVisible(actor, req.params.id);
    const data = await preRegistrationEnrollmentService.confirmEnrollment(
      actor,
      req.params.id,
      req.body as PreRegistrationConfirmEnrollmentInputDTO
    );
    return res.json({ success: true, data });
  } catch (error) {
    return respondError(res, error);
  }
});
