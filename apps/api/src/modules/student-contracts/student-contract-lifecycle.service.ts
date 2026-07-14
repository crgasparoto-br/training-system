import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { prepareOrActivateStudentContractInTransaction } from './student-contract-lifecycle-transaction.js';

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

const normalizeDocument = (value?: string | null) =>
  value?.replace(/\D/g, '') || '';

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

    if (!signerName) {
      throw new Error('Informe o nome completo para assinar');
    }

    if (signerCpf.length !== 11) {
      throw new Error('Informe um CPF válido para assinar');
    }

    const tokenDigest = hashToken(token);
    const contract = await prisma.contract.findUnique({
      where: { publicTokenHash: tokenDigest },
      include: {
        studentContracts: {
          take: 1,
        },
      },
    });

    if (!contract) {
      throw new Error('Link inválido ou já utilizado');
    }

    if (contract.publicTokenExpiresAt && contract.publicTokenExpiresAt < new Date()) {
      const expiredAt = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.contract.update({
          where: { id: contract.id },
          data: {
            status: 'EXPIRED',
            publicTokenHash: null,
            publicTokenExpiresAt: null,
          },
        });

        await tx.studentContract.updateMany({
          where: {
            contractId: contract.id,
            status: { not: 'active' },
          },
          data: {
            status: 'expired',
            endDate: expiredAt,
          },
        });
      });
      throw new Error('Link expirado');
    }

    if (contract.status === 'SIGNED') {
      throw new Error('Contrato já assinado');
    }

    if (contract.status === 'CANCELLED' || contract.status === 'EXPIRED') {
      throw new Error('Contrato não está disponível para assinatura');
    }

    const studentContract = contract.studentContracts[0];
    if (!studentContract) {
      throw new Error('Vínculo do contrato com o aluno não encontrado');
    }

    const signedAt = new Date();
    const documentHash = contract.documentHash || hashDocument(contract.renderedHtml);

    return prisma.$transaction(async (tx) => {
      const freshContract = await tx.contract.findUnique({
        where: { id: contract.id },
        select: {
          id: true,
          status: true,
          publicTokenHash: true,
          publicTokenExpiresAt: true,
        },
      });

      if (!freshContract || freshContract.publicTokenHash !== tokenDigest) {
        throw new Error('Link inválido ou já utilizado');
      }

      if (
        freshContract.publicTokenExpiresAt &&
        freshContract.publicTokenExpiresAt < signedAt
      ) {
        throw new Error('Link expirado');
      }

      if (freshContract.status === 'SIGNED') {
        throw new Error('Contrato já assinado');
      }

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

      if (claimed.count !== 1) {
        throw new Error('Link inválido ou já utilizado');
      }

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

      const lifecycle = await prepareOrActivateStudentContractInTransaction(
        tx,
        studentContract.id,
        signedAt
      );
      const effectiveAt = lifecycle.effectiveAt ?? signedAt;
      const scheduled = lifecycle.reason === 'scheduled_start';

      await tx.contractAuditLog.create({
        data: {
          contractId: contract.id,
          actorUserId: actor.userId,
          action: 'SIGNED',
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          details: {
            signatureId: signature.id,
            effectiveAt: effectiveAt.toISOString(),
            scheduled,
          },
        },
      });

      return {
        signature,
        activation: {
          effectiveAt: effectiveAt.toISOString(),
          scheduled,
          studentContractStatus: lifecycle.studentContract.status,
        },
      };
    });
  },

  async prepareOrActivateStudentContract(studentContractId: string, now = new Date()) {
    return prisma.$transaction((tx) =>
      prepareOrActivateStudentContractInTransaction(tx, studentContractId, now)
    );
  },

  async activateDueSignedContracts(now = new Date()) {
    const candidates = await prisma.studentContract.findMany({
      where: {
        status: 'pending_signature',
        signedAt: { not: null },
        startDate: { lte: now },
        contract: {
          status: 'SIGNED',
        },
      },
      select: {
        id: true,
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    });

    let activated = 0;
    const failures: Array<{ studentContractId: string; error: string }> = [];

    for (const candidate of candidates) {
      try {
        const changed = await prisma.$transaction(async (tx) => {
          const current = await tx.studentContract.findUnique({
            where: { id: candidate.id },
            include: {
              contract: {
                select: { status: true },
              },
            },
          });

          if (
            !current ||
            current.status !== 'pending_signature' ||
            !current.signedAt ||
            !current.startDate ||
            current.startDate > now ||
            current.contract.status !== 'SIGNED'
          ) {
            return false;
          }

          const lifecycle = await prepareOrActivateStudentContractInTransaction(
            tx,
            current.id,
            now
          );
          return lifecycle.reason === 'activated';
        });

        if (changed) activated += 1;
      } catch (error) {
        failures.push({
          studentContractId: candidate.id,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }

    return {
      checked: candidates.length,
      activated,
      failures,
    };
  },
};
