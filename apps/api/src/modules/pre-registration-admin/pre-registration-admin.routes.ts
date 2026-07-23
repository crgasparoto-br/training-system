import { Router, type Request, type Response } from 'express';
import type {
  CreatePreRegistrationLeadDTO,
  PreRegistrationAdminInviteFilter,
  PreRegistrationAdminListQueryDTO,
  PreRegistrationAdminStatus,
  UpdatePreRegistrationLeadCommercialDTO,
} from '@corrida/types';
import { authMiddleware } from '../auth/auth.middleware.js';
import {
  blockAccessMiddleware,
  screenAccessMiddleware,
} from '../access-control/access-control.middleware.js';
import { preRegistrationInviteAdminService } from '../pre-registration-invites/pre-registration-invite-admin.service.js';
import {
  PreRegistrationAdminError,
  preRegistrationAdminService,
  type PreRegistrationAdminActor,
} from './pre-registration-admin.service.js';

export const preRegistrationAdminRoutes: Router = Router();
preRegistrationAdminRoutes.use(authMiddleware);
preRegistrationAdminRoutes.use(screenAccessMiddleware('students.preRegistration'));

const createAccess = blockAccessMiddleware('students.preRegistration.create');
const editAccess = blockAccessMiddleware('students.preRegistration.editCommercial');
const inviteAccess = blockAccessMiddleware('students.preRegistration.generateInvite');
const revokeAccess = blockAccessMiddleware('students.preRegistration.revokeInvite');
const reviewAccess = blockAccessMiddleware('students.preRegistration.review');
const discardAccess = blockAccessMiddleware('students.preRegistration.discardReopen');
const convertAccess = blockAccessMiddleware('students.preRegistration.convert');

type AuthUser = {
  userId?: string;
  professorId?: string;
  contractId?: string;
};

type DomainError = {
  code?: string;
  details?: Record<string, unknown>;
};

function actorFrom(req: Request): PreRegistrationAdminActor {
  const user = req.user as AuthUser | undefined;
  return {
    userId: user?.userId,
    professorId: user?.professorId || '',
    contractId: user?.contractId || '',
  };
}

function statusFor(error: unknown) {
  const code = (error as DomainError)?.code;
  if (code === 'NOT_FOUND') return 404;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'INVALID_INPUT') return 400;
  if (
    code === 'IDENTIFIER_CONFLICT' ||
    code === 'POSSIBLE_DUPLICATE' ||
    code === 'CONCURRENT_MODIFICATION' ||
    code === 'ACTIVE_INVITE_EXISTS' ||
    code === 'ACTIVE_STUDENT'
  ) {
    return 409;
  }
  if (
    code === 'INVALID_TRANSITION' ||
    code === 'PRECONDITION_FAILED' ||
    code === 'MISSING_REQUIRED_FIELDS'
  ) {
    return 422;
  }
  return 500;
}

function respondError(res: Response, error: unknown) {
  const status = statusFor(error);
  const domainError = error as DomainError;
  if (status === 500) console.error('Erro na gestão de pré-matrículas:', error);
  return res.status(status).json({
    success: false,
    error: error instanceof Error ? error.message : 'Erro ao processar a solicitação.',
    code: domainError.code || 'INTERNAL_ERROR',
    details: domainError.details,
  });
}

function queryText(req: Request, key: string) {
  const value = req.query[key];
  return typeof value === 'string' ? value : undefined;
}

function queryBoolean(req: Request, key: string) {
  const value = queryText(req, key);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parseListQuery(req: Request): PreRegistrationAdminListQueryDTO {
  const statuses = queryText(req, 'status')
    ?.split(',')
    .filter(Boolean) as PreRegistrationAdminStatus[] | undefined;
  return {
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
    search: queryText(req, 'search'),
    statuses,
    inviteStatus: queryText(req, 'inviteStatus') as
      | PreRegistrationAdminInviteFilter
      | undefined,
    origin: queryText(req, 'origin'),
    responsibleProfessorId: queryText(req, 'responsibleProfessorId'),
    createdFrom: queryText(req, 'createdFrom'),
    createdTo: queryText(req, 'createdTo'),
    activityFrom: queryText(req, 'activityFrom'),
    activityTo: queryText(req, 'activityTo'),
    pendingReview: queryBoolean(req, 'pendingReview'),
    parqRequiresProfessionalReview: queryBoolean(
      req,
      'parqRequiresProfessionalReview'
    ),
    sort: queryText(req, 'sort') as PreRegistrationAdminListQueryDTO['sort'],
  };
}

preRegistrationAdminRoutes.get('/leads', async (req, res) => {
  try {
    const data = await preRegistrationAdminService.list(actorFrom(req), parseListQuery(req));
    return res.json({ success: true, data });
  } catch (error) {
    return respondError(res, error);
  }
});

preRegistrationAdminRoutes.post('/leads/duplicates', createAccess, async (req, res) => {
  try {
    const data = await preRegistrationAdminService.checkDuplicates(actorFrom(req), req.body || {});
    return res.json({ success: true, data });
  } catch (error) {
    return respondError(res, error);
  }
});

preRegistrationAdminRoutes.post('/leads', createAccess, async (req, res) => {
  try {
    const input = req.body as CreatePreRegistrationLeadDTO;
    if (
      !input?.name?.trim() ||
      !input?.origin?.trim() ||
      (!input?.phone?.trim() && !input?.email?.trim())
    ) {
      throw new PreRegistrationAdminError(
        'Informe nome, origem e pelo menos telefone ou e-mail.',
        'INVALID_INPUT'
      );
    }
    const data = await preRegistrationAdminService.create(actorFrom(req), input);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return respondError(res, error);
  }
});

preRegistrationAdminRoutes.get('/leads/:id', async (req, res) => {
  try {
    const data = await preRegistrationAdminService.getDetail(actorFrom(req), req.params.id);
    return res.json({ success: true, data });
  } catch (error) {
    return respondError(res, error);
  }
});

preRegistrationAdminRoutes.patch('/leads/:id', editAccess, async (req, res) => {
  try {
    const data = await preRegistrationAdminService.updateCommercial(
      actorFrom(req),
      req.params.id,
      req.body as UpdatePreRegistrationLeadCommercialDTO
    );
    return res.json({ success: true, data });
  } catch (error) {
    return respondError(res, error);
  }
});

preRegistrationAdminRoutes.post('/leads/:id/invites', inviteAccess, async (req, res) => {
  try {
    const actor = actorFrom(req);
    await preRegistrationAdminService.getDetail(actor, req.params.id);
    const current = await preRegistrationInviteAdminService.getSummary(
      req.params.id,
      actor.contractId,
      actor
    );
    const data = current?.allowedActions.canRegenerate
      ? await preRegistrationInviteAdminService.regenerateInvite(
          req.params.id,
          actor.contractId,
          actor
        )
      : await preRegistrationInviteAdminService.generateFirstInvite(
          req.params.id,
          actor.contractId,
          actor
        );
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return respondError(res, error);
  }
});

preRegistrationAdminRoutes.post(
  '/leads/:id/invites/revoke',
  revokeAccess,
  async (req, res) => {
    try {
      const actor = actorFrom(req);
      await preRegistrationAdminService.getDetail(actor, req.params.id);
      const reason = String(req.body?.reason || '').trim();
      if (!reason) {
        throw new PreRegistrationAdminError(
          'Informe o motivo da revogação.',
          'INVALID_INPUT'
        );
      }
      const data = await preRegistrationInviteAdminService.revokeInvite(
        req.params.id,
        actor.contractId,
        { inviteId: req.body?.inviteId, reason },
        actor
      );
      return res.json({ success: true, data });
    } catch (error) {
      return respondError(res, error);
    }
  }
);

preRegistrationAdminRoutes.post('/leads/:id/discard', discardAccess, async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      throw new PreRegistrationAdminError(
        'Informe o motivo do descarte.',
        'INVALID_INPUT'
      );
    }
    const data = await preRegistrationAdminService.discard(
      actorFrom(req),
      req.params.id,
      reason
    );
    return res.json({ success: true, data });
  } catch (error) {
    return respondError(res, error);
  }
});

preRegistrationAdminRoutes.post('/leads/:id/reopen', discardAccess, async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      throw new PreRegistrationAdminError(
        'Informe o motivo da reabertura.',
        'INVALID_INPUT'
      );
    }
    const data = await preRegistrationAdminService.reopen(
      actorFrom(req),
      req.params.id,
      reason
    );
    return res.json({ success: true, data });
  } catch (error) {
    return respondError(res, error);
  }
});

preRegistrationAdminRoutes.post('/leads/:id/review', reviewAccess, async (req, res) => {
  try {
    const reviewReference = String(req.body?.reviewReference || '').trim();
    const deduplicationReference = String(req.body?.deduplicationReference || '').trim();
    if (!reviewReference || !deduplicationReference) {
      throw new PreRegistrationAdminError(
        'Informe as referências da revisão e da deduplicação.',
        'INVALID_INPUT'
      );
    }
    const data = await preRegistrationAdminService.review(actorFrom(req), req.params.id, {
      reviewReference,
      deduplicationReference,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return respondError(res, error);
  }
});
preRegistrationAdminRoutes.post('/leads/:id/convert', convertAccess, async (req, res) => {
  try {
    const activationReference = String(req.body?.activationReference || '').trim();
    if (!activationReference) {
      throw new PreRegistrationAdminError(
        'Informe a referência da matrícula.',
        'INVALID_INPUT'
      );
    }
    const data = await preRegistrationAdminService.convert(
      actorFrom(req),
      req.params.id,
      activationReference
    );
    return res.json({ success: true, data });
  } catch (error) {
    return respondError(res, error);
  }
});
