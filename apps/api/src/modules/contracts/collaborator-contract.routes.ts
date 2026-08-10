import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendError, sendSuccess } from '@corrida/utils';
import { getMostPermissiveDataScopeForProfessor } from '../access-control/index.js';
import {
  blockAccessMiddleware,
  screenAccessMiddleware,
} from '../access-control/access-control.middleware.js';
import { professorAccessQueryService } from '../professores/professor-access-query.service.js';
import { studentContractLifecycleService } from '../student-contracts/student-contract-lifecycle.service.js';
import { collaboratorContractService } from './collaborator-contract.service.js';
import { contractPartyLinkService } from './contract-party-link.service.js';
import { contractPdfService } from './contract-pdf.service.js';
import { contractRecordRepository } from './contract-record.repository.js';

const router: Router = Router();
const prisma = new PrismaClient();

const collaboratorReadScreens = [
  'collaborators.consultation',
  'collaborators.registration',
] as const;
const collaboratorWriteScreens = ['collaborators.registration'] as const;

const readContractAccess = screenAccessMiddleware([...collaboratorReadScreens]);
const writeContractAccess = screenAccessMiddleware('collaborators.registration');
const manageContractAccess = blockAccessMiddleware('collaborators.actions.uploadSignedContract');

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

async function assertCollaboratorAccess(
  req: Request,
  collaboratorId: string,
  screens: Array<'collaborators.consultation' | 'collaborators.registration'>
) {
  const companyContractId = (req as any).user.contractId as string | undefined;
  const actorProfessorId = (req as any).user.professorId as string | undefined;
  if (!companyContractId) throw new Error('Contrato autenticado não encontrado');

  const dataScope = await getMostPermissiveDataScopeForProfessor(
    getActorProfessor(req),
    screens
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

const assertCollaboratorReadAccess = (req: Request, collaboratorId: string) =>
  assertCollaboratorAccess(req, collaboratorId, [...collaboratorReadScreens]);

const assertCollaboratorWriteAccess = (req: Request, collaboratorId: string) =>
  assertCollaboratorAccess(req, collaboratorId, [...collaboratorWriteScreens]);

const handleError = (res: Response, error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const notFound = message.includes('não encontrado') || message.includes('não pertence');
  return sendError(res, message, notFound ? 404 : 400);
};

router.get(
  '/collaborators/:collaboratorId/summary',
  readContractAccess,
  async (req: Request, res: Response) => {
    try {
      const { companyContractId } = await assertCollaboratorReadAccess(
        req,
        req.params.collaboratorId
      );
      const summary = await collaboratorContractService.summary(
        companyContractId,
        req.params.collaboratorId
      );
      return sendSuccess(res, summary, 'Controle contratual do colaborador recuperado com sucesso');
    } catch (error) {
      return handleError(res, error, 'Erro ao consultar contratos do colaborador');
    }
  }
);

router.post(
  '/collaborators/:collaboratorId/preview',
  writeContractAccess,
  manageContractAccess,
  async (req: Request, res: Response) => {
    try {
      const { companyContractId } = await assertCollaboratorWriteAccess(
        req,
        req.params.collaboratorId
      );
      const preview = await collaboratorContractService.preview(companyContractId, {
        ...req.body,
        collaboratorId: req.params.collaboratorId,
      });
      return sendSuccess(res, preview, 'Prévia do contrato do colaborador gerada com sucesso');
    } catch (error) {
      return handleError(res, error, 'Erro ao gerar prévia do contrato do colaborador');
    }
  }
);

router.post(
  '/collaborators/:collaboratorId/generate',
  writeContractAccess,
  manageContractAccess,
  async (req: Request, res: Response) => {
    try {
      const { companyContractId } = await assertCollaboratorWriteAccess(
        req,
        req.params.collaboratorId
      );
      const generated = await collaboratorContractService.generate(
        companyContractId,
        { ...req.body, collaboratorId: req.params.collaboratorId },
        actorFromRequest(req)
      );
      return sendSuccess(res, generated, 'Contrato do colaborador gerado com sucesso', 201);
    } catch (error) {
      return handleError(res, error, 'Erro ao gerar contrato do colaborador');
    }
  }
);

router.get(
  '/collaborators/:collaboratorId/documents/:documentId',
  readContractAccess,
  async (req: Request, res: Response) => {
    try {
      const { companyContractId } = await assertCollaboratorReadAccess(
        req,
        req.params.collaboratorId
      );
      await collaboratorContractService.assertDocumentBelongsToCollaborator(
        companyContractId,
        req.params.collaboratorId,
        req.params.documentId
      );
      const document = await contractRecordRepository.findByIdForCompany(
        req.params.documentId,
        companyContractId
      );
      if (!document) throw new Error('Contrato do colaborador não encontrado');
      return sendSuccess(res, document, 'Documento contratual recuperado com sucesso');
    } catch (error) {
      return handleError(res, error, 'Erro ao consultar documento contratual');
    }
  }
);

router.get(
  '/collaborators/:collaboratorId/documents/:documentId/pdf',
  readContractAccess,
  async (req: Request, res: Response) => {
    try {
      const { companyContractId } = await assertCollaboratorReadAccess(
        req,
        req.params.collaboratorId
      );
      await collaboratorContractService.assertDocumentBelongsToCollaborator(
        companyContractId,
        req.params.collaboratorId,
        req.params.documentId
      );
      const document = await contractRecordRepository.findByIdForCompany(
        req.params.documentId,
        companyContractId
      );
      if (!document?.pdfPath) throw new Error('PDF do contrato não encontrado');

      const storageRoot = path.resolve(process.cwd(), 'storage', 'contracts');
      const resolvedPdfPath = path.resolve(document.pdfPath);
      if (!resolvedPdfPath.startsWith(`${storageRoot}${path.sep}`)) {
        throw new Error('PDF do contrato não encontrado');
      }
      const pdf = await fs.readFile(resolvedPdfPath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=contrato-${document.id}.pdf`);
      return res.status(200).send(pdf);
    } catch (error) {
      return handleError(res, error, 'Erro ao consultar PDF do contrato');
    }
  }
);

router.post(
  '/collaborators/:collaboratorId/documents/:documentId/pdf',
  writeContractAccess,
  manageContractAccess,
  async (req: Request, res: Response) => {
    try {
      const { companyContractId } = await assertCollaboratorWriteAccess(
        req,
        req.params.collaboratorId
      );
      await collaboratorContractService.assertDocumentBelongsToCollaborator(
        companyContractId,
        req.params.collaboratorId,
        req.params.documentId
      );
      const document = await contractPdfService.generate(
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
  writeContractAccess,
  manageContractAccess,
  async (req: Request, res: Response) => {
    try {
      const { companyContractId } = await assertCollaboratorWriteAccess(
        req,
        req.params.collaboratorId
      );
      await collaboratorContractService.assertDocumentBelongsToCollaborator(
        companyContractId,
        req.params.collaboratorId,
        req.params.documentId
      );

      const result = await prisma.$transaction(async (tx) => {
        const contract = await contractRecordRepository.findByIdForCompany(
          req.params.documentId,
          companyContractId,
          tx
        );
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
        const claimed = await tx.contract.updateMany({
          where: {
            id: contract.id,
            companyContractId,
            status: { notIn: ['SIGNED', 'CANCELLED', 'EXPIRED'] },
          },
          data: {
            status: 'SENT',
            publicTokenHash: tokenHash(token),
            publicTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
          },
        });
        if (claimed.count !== 1) throw new Error('Contrato não está disponível para envio');

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
        const updated = await contractRecordRepository.findById(contract.id, tx);
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
  writeContractAccess,
  manageContractAccess,
  async (req: Request, res: Response) => {
    try {
      const { companyContractId } = await assertCollaboratorWriteAccess(
        req,
        req.params.collaboratorId
      );
      await collaboratorContractService.assertDocumentBelongsToCollaborator(
        companyContractId,
        req.params.collaboratorId,
        req.params.documentId
      );

      const canceledAt = new Date();
      const updated = await prisma.$transaction(async (tx) => {
        const contract = await contractRecordRepository.findByIdForCompany(
          req.params.documentId,
          companyContractId,
          tx
        );
        if (!contract) throw new Error('Contrato do colaborador não encontrado');
        if (contract.status === 'SIGNED') {
          throw new Error('Contrato assinado não pode ser cancelado; gere um aditivo ou novo contrato');
        }

        const claimed = await tx.contract.updateMany({
          where: {
            id: contract.id,
            companyContractId,
            status: { not: 'SIGNED' },
          },
          data: {
            status: 'CANCELLED',
            cancelledAt: canceledAt,
            publicTokenHash: null,
            publicTokenExpiresAt: null,
          },
        });
        if (claimed.count !== 1) {
          throw new Error('Contrato assinado não pode ser cancelado; gere um aditivo ou novo contrato');
        }

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
        return contractRecordRepository.findById(contract.id, tx);
      });

      return sendSuccess(res, updated, 'Contrato cancelado com sucesso');
    } catch (error) {
      return handleError(res, error, 'Erro ao cancelar contrato');
    }
  }
);

router.post(
  '/collaborators/:collaboratorId/links/:linkId/activate',
  writeContractAccess,
  manageContractAccess,
  async (req: Request, res: Response) => {
    try {
      const { companyContractId } = await assertCollaboratorWriteAccess(
        req,
        req.params.collaboratorId
      );
      const summary = await collaboratorContractService.summary(
        companyContractId,
        req.params.collaboratorId
      );
      const link = summary.all.find((item) => item.id === req.params.linkId);
      if (!link || link.collaboratorId !== req.params.collaboratorId) {
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
