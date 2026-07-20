import crypto from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { contractPublicAccessService } from '../contracts/contract-public-access.service.js';
import { contractPartyLinkService } from '../contracts/contract-party-link.service.js';
import { contractRecordRepository } from '../contracts/contract-record.repository.js';
import {
  prepareOrActivateCollaboratorContractInTransaction,
  prepareOrActivateStudentContractInTransaction,
} from './student-contract-lifecycle-transaction.js';

const prisma = new PrismaClient();

type ContractActor = {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
};

type PublicSignatureInput = {
  signerName: string;
  signerCpf: string;
  signerEmail?: string;
};

const hashToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');
const normalizeDocument = (value?: string | null) => value?.replace(/\D/gu, '') || '';
const hashDocument = (html: string) =>
  crypto.createHash('sha256').update(html).digest('hex');

export const studentContractLifecycleService = {
  async signPublicContract(
    token: string,
    data: PublicSignatureInput,
    actor: ContractActor = {}
  ) {
    const signerName = String(data?.signerName || '').trim();
    const signerCpf = normalizeDocument(data?.signerCpf);
    const signerEmail = String(data?.signerEmail || '').trim() || null;

    if (!signerName) throw new Error('Informe o nome completo para assinar');
    if (signerCpf.length !== 11) throw new Error('Informe um CPF válido para assinar');

    const tokenDigest = hashToken(token);
    const contract = await contractRecordRepository.findByPublicTokenHash(tokenDigest, prisma);
    if (!contract) throw new Error('Link inválido ou já utilizado');

    if (contract.publicTokenExpiresAt && contract.publicTokenExpiresAt < new Date()) {
      await contractPublicAccessService.open(token, actor, prisma, new Date());
      throw new Error('Link expirado');
    }
    if (contract.status === 'SIGNED') throw new Error('Contrato já assinado');
    if (contract.status === 'CANCELLED' || contract.status === 'EXPIRED') {
      throw new Error('Contrato não está disponível para assinatura');
    }

    const link = await contractPartyLinkService.resolveByGeneratedContractId(contract.id, prisma);
    if (!link) throw new Error('Vínculo do documento contratual não encontrado');

    const signedAt = new Date();
    const documentHash = contract.documentHash || hashDocument(contract.renderedHtml);

    const result = await prisma.$transaction(async (tx) => {
      const freshContract = await contractRecordRepository.findById(contract.id, tx);

      if (!freshContract || freshContract.publicTokenHash !== tokenDigest) {
        throw new Error('Link inválido ou já utilizado');
      }
      if (freshContract.publicTokenExpiresAt && freshContract.publicTokenExpiresAt < signedAt) {
        return { kind: 'expired' as const };
      }
      if (freshContract.status === 'SIGNED') throw new Error('Contrato já assinado');
      if (freshContract.status === 'CANCELLED' || freshContract.status === 'EXPIRED') {
        throw new Error('Contrato não está disponível para assinatura');
      }

      const claimed = await tx.contract.updateMany({
        where: {
          id: contract.id,
          publicTokenHash: tokenDigest,
          status: { notIn: ['SIGNED', 'CANCELLED', 'EXPIRED'] },
        },
        data: {
          status: 'SIGNED',
          signedAt,
          documentHash,
          publicTokenHash: null,
          publicTokenExpiresAt: null,
        },
      });
      if (claimed.count !== 1) throw new Error('Link inválido ou já utilizado');

      const signature = await tx.contractSignature.create({
        data: {
          contractId: contract.id,
          signerName,
          signerCpf,
          signerEmail,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          documentHash,
          acceptedAt: signedAt,
        },
      });

      let effectiveAt: Date;
      let scheduled: boolean;
      let linkStatus: string;

      if (link.partyType === 'STUDENT') {
        const lifecycle = await prepareOrActivateStudentContractInTransaction(
          tx,
          link.linkId,
          signedAt
        );
        effectiveAt = lifecycle.effectiveAt ?? signedAt;
        scheduled = lifecycle.reason === 'scheduled_start';
        linkStatus = lifecycle.studentContract.status;
      } else {
        const lifecycle = await prepareOrActivateCollaboratorContractInTransaction(
          tx,
          link.linkId,
          signedAt
        );
        effectiveAt = lifecycle.effectiveAt ?? signedAt;
        scheduled = lifecycle.reason === 'scheduled_start';
        linkStatus = lifecycle.collaboratorContract.status;
      }

      await tx.contractAuditLog.create({
        data: {
          contractId: contract.id,
          actorUserId: actor.userId,
          action: 'SIGNED',
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          details: {
            signatureId: signature.id,
            partyType: link.partyType,
            partyId: link.partyId,
            effectiveAt: effectiveAt.toISOString(),
            scheduled,
          },
        },
      });

      return {
        kind: 'signed' as const,
        value: {
          signature,
          activation: {
            effectiveAt: effectiveAt.toISOString(),
            scheduled,
            partyType: link.partyType,
            linkStatus,
            ...(link.partyType === 'STUDENT' ? { studentContractStatus: linkStatus } : {}),
          },
        },
      };
    });

    if (result.kind === 'expired') {
      await contractPublicAccessService.open(token, actor, prisma, signedAt);
      throw new Error('Link expirado');
    }
    return result.value;
  },

  async prepareOrActivateStudentContract(studentContractId: string, now = new Date()) {
    return prisma.$transaction((tx) =>
      prepareOrActivateStudentContractInTransaction(tx, studentContractId, now)
    );
  },

  async prepareOrActivateCollaboratorContract(collaboratorContractId: string, now = new Date()) {
    return prisma.$transaction((tx) =>
      prepareOrActivateCollaboratorContractInTransaction(tx, collaboratorContractId, now)
    );
  },

  async activateDueSignedContracts(now = new Date()) {
    const studentCandidates = await prisma.studentContract.findMany({
      where: {
        status: 'pending_signature',
        signedAt: { not: null },
        startDate: { lte: now },
        contract: { status: 'SIGNED' },
      },
      select: { id: true },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    });
    const collaboratorCandidates = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT cc."id"
      FROM "CollaboratorContract" cc
      JOIN "GeneratedContract" gc ON gc."id" = cc."contractId"
      WHERE cc."status" = 'pending_signature'::"CollaboratorContractStatus"
        AND cc."signedAt" IS NOT NULL
        AND cc."startDate" <= ${now}
        AND gc."status" = 'SIGNED'::"ContractStatus"
      ORDER BY cc."startDate" ASC, cc."createdAt" ASC
    `);

    let activated = 0;
    const failures: Array<{ partyType: 'STUDENT' | 'COLLABORATOR'; linkId: string; error: string }> = [];

    for (const candidate of studentCandidates) {
      try {
        const result = await prisma.$transaction((tx) =>
          prepareOrActivateStudentContractInTransaction(tx, candidate.id, now)
        );
        if (result.reason === 'activated') activated += 1;
      } catch (error) {
        failures.push({
          partyType: 'STUDENT',
          linkId: candidate.id,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }

    for (const candidate of collaboratorCandidates) {
      try {
        const result = await prisma.$transaction((tx) =>
          prepareOrActivateCollaboratorContractInTransaction(tx, candidate.id, now)
        );
        if (result.reason === 'activated') activated += 1;
      } catch (error) {
        failures.push({
          partyType: 'COLLABORATOR',
          linkId: candidate.id,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }

    return {
      checked: studentCandidates.length + collaboratorCandidates.length,
      activated,
      failures,
    };
  },
};
