import { Router, type Request, type Response } from 'express';
import type {
  PreRegistrationConfirmEnrollmentInputDTO,
  PreRegistrationDuplicateDecisionInputDTO,
  PreRegistrationReadyForEnrollmentInputDTO,
} from '@corrida/types';
import { authMiddleware } from '../auth/auth.middleware.js';
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

preRegistrationEnrollmentRoutes.use(authMiddleware);
preRegistrationEnrollmentRoutes.use(screenAccessMiddleware('students.preRegistration'));

const createAccess = blockAccessMiddleware('students.preRegistration.create');
const editAccess = blockAccessMiddleware('students.preRegistration.editCommercial');
const reviewAccess = blockAccessMiddleware('students.preRegistration.review');
const convertAccess = blockAccessMiddleware('students.preRegistration.convert');

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

preRegistrationEnrollmentRoutes.post(
  '/leads/:id/duplicates',
  editAccess,
  async (req, res, next) => {
    try {
      const actor = actorFrom(req);
      await assertPreRegistrationAlunoVisible(actor, req.params.id);
      const result = await preRegistrationEnrollmentService.inspectProposedUpdate(
        actor,
        req.params.id,
        req.body || {}
      );
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

preRegistrationEnrollmentRoutes.get(
  '/leads/:id/enrollment-review',
  blockAccessMiddleware([
    'students.preRegistration.review',
    'students.preRegistration.convert',
  ]),
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
