import crypto from 'crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import { studentAccessScopeService } from '../alunos/student-access-scope.service.js';
import { studentContractService } from '../student-contracts/student-contract.service.js';
import { contractPublicAccessService } from './contract-public-access.service.js';
import {
  buildContractRejectionAuditDetails,
  buildContractRejectionClaimWhere,
  CONTRACT_REJECTION_AUDIT_KIND,
  normalizeContractRejectionReason,
  resolveContractRejection,
} from './contract-rejection.js';

const router: Router = Router();
const prisma = new PrismaClient();

const tokenHash = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

const actorFromRequest = (req: Request) => ({
  userId: req.user?.userId,
  ipAddress: req.ip,
  userAgent: req.get('user-agent') || undefined,
});

const studentAccessContextFromRequest = (req: Request) => ({
  professorId: (req as any).user?.professorId as string | undefined,
  professorRole: (req as any).user?.professorRole as string | undefined,
  companyContractId: (req as any).user?.contractId as string | undefined,
});

const loadRejection = async (contractId: string) => {
  const auditLog = await prisma.contractAuditLog.findFirst({
    where: {
      contractId,
      action: 'UPDATED',
      details: {
        path: ['kind'],
        equals: CONTRACT_REJECTION_AUDIT_KIND,
      },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      details: true,
      createdAt: true,
    },
  });

  return auditLog ? resolveContractRejection([auditLog]) : null;
};

router.post('/public/:token/reject', async (req: Request, res: Response) => {
  try {
    const rejectionReason = normalizeContractRejectionReason(req.body?.reason);
    const tokenDigest = tokenHash(req.params.token);
    const contract = await prisma.contract.findUnique({
      where: { publicTokenHash: tokenDigest },
      select: {
        id: true,
        title: true,
        status: true,
        renderedHtml: true,
        publicTokenExpiresAt: true,
      },
    });

    if (!contract) {
      return sendError(res, 'Link inválido ou já utilizado', 404);
    }

    if (contract.publicTokenExpiresAt && contract.publicTokenExpiresAt < new Date()) {
      await contractPublicAccessService.open(
        req.params.token,
        actorFromRequest(req),
        prisma,
        new Date()
      );
      return sendError(res, 'Link expirado', 400);
    }

    if (contract.status === 'SIGNED') {
      return sendError(res, 'Contrato já assinado', 400);
    }

    if (contract.status === 'CANCELLED' || contract.status === 'EXPIRED') {
      return sendError(res, 'Contrato não está disponível para recusa', 400);
    }

    const rejectedAt = new Date();
    const actor = actorFromRequest(req);
    const cancellationReason = rejectionReason
      ? `Recusado pelo aluno: ${rejectionReason}`
      : 'Recusado pelo aluno';

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.contract.updateMany({
        where: buildContractRejectionClaimWhere(
          contract.id,
          tokenDigest,
          rejectedAt
        ),
        data: {
          publicTokenHash: null,
          publicTokenExpiresAt: null,
        },
      });

      if (claimed.count !== 1) {
        throw new Error('Link inválido ou já utilizado');
      }

      await tx.contractAuditLog.create({
        data: {
          contractId: contract.id,
          actorUserId: actor.userId,
          action: 'UPDATED',
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          details: buildContractRejectionAuditDetails(rejectedAt, rejectionReason),
        },
      });

      await studentContractService.setStatusByGeneratedContractId(
        contract.id,
        'canceled',
        {
          canceledAt: rejectedAt,
          endDate: rejectedAt,
          cancellationReason,
        },
        tx
      );
    });

    return sendSuccess(
      res,
      {
        id: contract.id,
        title: contract.title,
        status: 'REJECTED',
        renderedHtml: contract.renderedHtml,
        rejectedAt: rejectedAt.toISOString(),
        rejectionReason,
      },
      'Recusa do contrato registrada com sucesso'
    );
  } catch (error: any) {
    return sendError(res, error.message || 'Erro ao registrar recusa do contrato', 400);
  }
});

router.get(
  '/documents/:contractDocumentId/rejection',
  authMiddleware,
  professorMiddleware,
  async (req: Request, res: Response) => {
    try {
      const companyContractId = (req as any).user.contractId as string | undefined;
      if (!companyContractId) {
        return sendError(res, 'Contrato da empresa não encontrado', 404);
      }

      const contract = await prisma.contract.findFirst({
        where: {
          id: req.params.contractDocumentId,
          companyContractId,
        },
        select: { id: true, alunoId: true },
      });

      if (!contract) {
        return sendError(res, 'Contrato não encontrado', 404);
      }

      await studentAccessScopeService.assertAlunoAccess(
        contract.alunoId,
        studentAccessContextFromRequest(req),
        prisma
      );

      const rejection = await loadRejection(contract.id);
      return sendSuccess(
        res,
        rejection
          ? { rejected: true, ...rejection }
          : { rejected: false, rejectedAt: null, rejectionReason: null },
        'Situação de recusa recuperada com sucesso'
      );
    } catch (error: any) {
      const status = error?.message?.includes('fora do escopo') ? 404 : 500;
      return sendError(res, error.message || 'Erro ao consultar recusa do contrato', status);
    }
  }
);

router.post(
  '/documents/:contractDocumentId/send',
  authMiddleware,
  professorMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyContractId = (req as any).user.contractId as string | undefined;
      if (!companyContractId) {
        return sendError(res, 'Contrato da empresa não encontrado', 404);
      }

      const contract = await prisma.contract.findFirst({
        where: {
          id: req.params.contractDocumentId,
          companyContractId,
        },
        select: { id: true, alunoId: true },
      });

      if (!contract) {
        return sendError(res, 'Contrato não encontrado', 404);
      }

      await studentAccessScopeService.assertAlunoAccess(
        contract.alunoId,
        studentAccessContextFromRequest(req),
        prisma
      );

      const rejection = await loadRejection(contract.id);
      if (rejection) {
        return sendError(
          res,
          'Contrato recusado pelo aluno não pode ser reenviado. Gere um novo documento.',
          400
        );
      }

      return next();
    } catch (error: any) {
      const status = error?.message?.includes('fora do escopo') ? 404 : 500;
      return sendError(res, error.message || 'Erro ao validar envio do contrato', status);
    }
  }
);

export default router;