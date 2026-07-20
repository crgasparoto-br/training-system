import crypto from 'crypto';
import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendError, sendSuccess } from '@corrida/utils';
import {
  getMostPermissiveDataScopeForProfessor,
  screenAccessMiddleware,
} from '../access-control/index.js';
import { professorAccessQueryService } from '../professores/professor-access-query.service.js';
import { studentContractLifecycleService } from '../student-contracts/student-contract-lifecycle.service.js';
import { collaboratorContractService } from './collaborator-contract.service.js';
import { contractDocumentService } from './contract-document.service.js';
import { contractPartyLinkService } from './contract-party-link.service.js';

const router: Router = Router();
const prisma = new PrismaClient();

const tokenHash = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

const actorFromRequest = (req: Request) => ({
  userId: req.user?.userId,
  ipAddress: req.ip,
  userAgent: req.get('user-agent') || undefined,
});

function getActorProfessor(req: Request) {
  return {
    role: (req as any).user.professorRole,
    collaboratorFunction: {
      id: (req as any).user.collaboratorFunctionId,
      code: (req as any).user.collaboratorFunctionCode,
    },
  };
}

async function assertCollaboratorAccess(req: Request, collaboratorId: string) {
  const companyContractId = (req as any).user.contractId as string | undefined;
  const actorProfessorId = (req as any).user.professorId as string | undefined;
  if (!companyContractId) throw new Error('Contrato autenticado não encontrado');

  const dataScope = await getMostPermissiveDataScopeForProfessor(
    getActorProfessor(req),
    ['collaborators.registration']
  );
  if (!dataScope) throw new Error('Colaborador não encontrado');

  const collaborator = await professorAccessQueryService.findByAccessScope(
    companyContractId,
    actorProfessorId,
    dataScope,
    collaboratorId
  );
  if (!collaborator) throw new Error('Colaborador não encontrado');
  return { companyContractId, collaborator };
}

const handleError = (res: Response, error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const notFound = message.includes('não encontrado') || message.includes('não pertence');
  return sendError(res, message, notFound ? 404 : 400);
};

router.use(
  '/collaborators/:collaboratorId',
  screenAccessMiddleware('collaborators.registration')
);

router.get('/collaborators/:collaboratorId/summary', async (req: Request, res: Response) => {
  try {
    const { companyContractId } = await assertCollaboratorAccess(req, req.params.collaboratorId);
    const summary = await collaboratorContractService.summary(
      companyContractId,
      req.params.collaboratorId
    );
    return sendSuccess(res, summary, 'Controle contratual do colaborador recuperado com sucesso');
  } catch (error) {
    return handleError(res, error, 'Erro ao consultar contratos do colaborador');
  }
});

router.post('/collaborators/:collaboratorId/preview', async (req: Request, res: Response) => {
  try {
    const { companyContractId } = await assertCollaboratorAccess(req, req.params.collaboratorId);
    const preview = await collaboratorContractService.preview(companyContractId, {
      ...req.body,
      collaboratorId: req.params.collaboratorId,
    });
    return sendSuccess(res, preview, 'Prévia do contrato do colaborador gerada com sucesso');
  } catch (error) {
    return handleError(res, error, 'Erro ao gerar prévia do contrato do colaborador');
  }
});

router.post('/collaborators/:collaboratorId/generate', async (req: Request, res: Response) => {
  try {
    const { companyContractId } = await assertCollaboratorAccess(req, req.params.collaboratorId);
    const generated = await collaboratorContractService.generate(
      companyContractId,
      { ...req.body, collaboratorId: req.params.collaboratorId },
      actorFromRequest(req)
    );
    return sendSuccess(res, generated, 'Contrato do colaborador gerado com sucesso', 201);
  } catch (error) {
    return handleError(res, error, 'Erro ao gerar contrato do colaborador');
  }
});

router.post(
  '/collaborators/:collaboratorId/documents/:documentId/pdf',
  async (req: Request, res: Response) => {
    try {
      const { companyContractId } = await assertCollaboratorAccess(req, req.params.collaboratorId);
      await collaboratorContractService.assertDocumentBelongsToCollaborator(
        companyContractId,
        req.params.collaboratorId,
        req.params.documentId
      );
      const document = await contractDocumentService.generatePdf(
        companyContractId,
        req.params.documentId,
        actorFromRequest(req)
      );
      return sendSuccess(res, document, 'PDF do contrato gerado com sucesso');
    } catch (error) {
      return handleError(res, error, 'Erro ao gerar PDF do contrato');
    }
  }
);

router.post(
  '/collaborators/:collaboratorId/documents/:documentId/send',
  async (req: Request, res: Response) => {
    try {
      const { companyContractId } = await assertCollaboratorAccess(req, req.params.collaboratorId);
      await collaboratorContractService.assertDocumentBelongsToCollaborator(
        companyContractId,
        req.params.collaboratorId,
        req.params.documentId
      );

      const result = await prisma.$transaction(async (tx) => {
        const contract = await tx.contract.findFirst({
          where: { id: req.params.documentId, companyContractId },
        });
        if (!contract) throw new Error('Contrato do colaborador não encontrado');
        if (contract.status === 'SIGNED') throw new Error('Contrato assinado não pode ser reenviado');
        if (contract.status === 'CANCELLED' || contract.status === 'EXPIRED') {
          throw new Error('Contrato não está disponível para envio');
        }

        const rejection = await tx.contractAuditLog.findFirst({
          where: {
            contractId: contract.id,
            action: 'UPDATED',
            details: { path: ['kind'], equals: 'STUDENT_REJECTION' },
          },
          select: { id: true },
        });
        if (rejection) throw new Error('Contrato recusado não pode ser reenviado. Gere um novo documento.');

        const token = crypto.randomBytes(32).toString('hex');
        const updated = await tx.contract.update({
          where: { id: contract.id },
          data: {
            status: 'SENT',
            publicTokenHash: tokenHash(token),
            publicTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
          },
        });
        await contractPartyLinkService.setStatusByGeneratedContractId(
          contract.id,
          'pending_signature',
          {},
          tx
        );
        await tx.contractAuditLog.create({
          data: {
            contractId: contract.id,
            actorUserId: req.user?.userId,
            action: 'SENT',
            ipAddress: req.ip,
            userAgent: req.get('user-agent') || undefined,
            details: { partyType: 'COLLABORATOR', partyId: req.params.collaboratorId },
          },
        });
        return { contract: updated, token };
      });

      return sendSuccess(res, result, 'Contrato enviado para assinatura');
    } catch (error) {
      return handleError(res, error, 'Erro ao enviar contrato para assinatura');
    }
  }
);

router.post(
  '/collaborators/:collaboratorId/documents/:documentId/cancel',
  async (req: Request, res: Response) => {
    try {
      const { companyContractId } = await assertCollaboratorAccess(req, req.params.collaboratorId);
      await collaboratorContractService.assertDocumentBelongsToCollaborator(
        companyContractId,
        req.params.collaboratorId,
        req.params.documentId
      );

      const canceledAt = new Date();
      const updated = await prisma.$transaction(async (tx) => {
        const contract = await tx.contract.findFirst({
          where: { id: req.params.documentId, companyContractId },
        });
        if (!contract) throw new Error('Contrato do colaborador não encontrado');
        if (contract.status === 'SIGNED') {
          throw new Error('Contrato assinado não pode ser cancelado; gere um aditivo ou novo contrato');
        }

        const canceled = await tx.contract.update({
          where: { id: contract.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: canceledAt,
            publicTokenHash: null,
            publicTokenExpiresAt: null,
          },
        });
        await contractPartyLinkService.setStatusByGeneratedContractId(
          contract.id,
          'canceled',
          {
            canceledAt,
            endDate: canceledAt,
            cancellationReason: String(req.body?.reason || '').trim() || 'Cancelado pela gestão contratual',
          },
          tx
        );
        await tx.contractAuditLog.create({
          data: {
            contractId: contract.id,
            actorUserId: req.user?.userId,
            action: 'CANCELLED',
            ipAddress: req.ip,
            userAgent: req.get('user-agent') || undefined,
            details: { partyType: 'COLLABORATOR', partyId: req.params.collaboratorId },
          },
        });
        return canceled;
      });

      return sendSuccess(res, updated, 'Contrato cancelado com sucesso');
    } catch (error) {
      return handleError(res, error, 'Erro ao cancelar contrato');
    }
  }
);

router.post(
  '/collaborators/:collaboratorId/links/:linkId/activate',
  async (req: Request, res: Response) => {
    try {
      const { companyContractId } = await assertCollaboratorAccess(req, req.params.collaboratorId);
      const summary = await collaboratorContractService.summary(
        companyContractId,
        req.params.collaboratorId
      );
      const link = summary.all.find((item) => item.id === req.params.linkId);
      if (!link) throw new Error('Vínculo de contrato do colaborador não encontrado');
      if (link.collaboratorId !== req.params.collaboratorId) {
        throw new Error('Vínculo de contrato do colaborador não encontrado');
      }

      const lifecycle = await studentContractLifecycleService.prepareOrActivateCollaboratorContract(
        req.params.linkId
      );
      return sendSuccess(res, lifecycle, lifecycle.activationDeferred
        ? 'Contrato preparado e aguardando a data de início'
        : 'Contrato colocado em vigor com sucesso');
    } catch (error) {
      return handleError(res, error, 'Erro ao colocar contrato em vigor');
    }
  }
);

export default router;
