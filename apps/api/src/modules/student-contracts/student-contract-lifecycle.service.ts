import crypto from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { resolveSignedContractActivation } from './student-contract-activation.js';

const prisma = new PrismaClient();

type DbClient = PrismaClient | Prisma.TransactionClient;

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

const activateCandidateAt = async (
  client: DbClient,
  studentContractId: string,
  effectiveAt: Date
) => {
  const initialCandidate = await client.studentContract.findUnique({
    where: { id: studentContractId },
    select: { alunoId: true },
  });

  if (!initialCandidate) {
    throw new Error('Vínculo do contrato substituto não encontrado');
  }

  await client.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "Aluno"
    WHERE "id" = ${initialCandidate.alunoId}
    FOR UPDATE
  `);

  const candidate = await client.studentContract.findUnique({
    where: { id: studentContractId },
    include: {
      contract: {
        select: {
          id: true,
          status: true,
          signedAt: true,
        },
      },
    },
  });

  if (!candidate) {
    throw new Error('Vínculo do contrato substituto não encontrado');
  }

  if (candidate.status === 'active') {
    await client.aluno.update({
      where: { id: candidate.alunoId },
      data: { currentStudentContractId: candidate.id },
    });
    return candidate;
  }

  if (
    candidate.status === 'canceled' ||
    candidate.status === 'expired' ||
    candidate.status === 'terminated'
  ) {
    throw new Error('Contrato substituto não está disponível para ativação');
  }

  if (candidate.contract.status !== 'SIGNED') {
    throw new Error('Somente contrato assinado pode entrar em vigor');
  }

  await client.studentContract.updateMany({
    where: {
      alunoId: candidate.alunoId,
      status: 'active',
      id: { not: candidate.id },
    },
    data: {
      status: 'terminated',
      endDate: effectiveAt,
    },
  });

  const activated = await client.studentContract.update({
    where: { id: candidate.id },
    data: {
      status: 'active',
      startDate: effectiveAt,
      endDate: null,
      signedAt: candidate.signedAt ?? candidate.contract.signedAt ?? effectiveAt,
      canceledAt: null,
      cancellationReason: null,
    },
  });

  await client.aluno.update({
    where: { id: candidate.alunoId },
    data: { currentStudentContractId: activated.id },
  });

  return activated;
};

const registerSignedCandidate = async (
  client: DbClient,
  studentContractId: string,
  signedAt: Date
) => {
  const candidate = await client.studentContract.findUnique({
    where: { id: studentContractId },
  });

  if (!candidate) {
    throw new Error('Vínculo do contrato assinado não encontrado');
  }

  const activation = resolveSignedContractActivation({
    signedAt,
    requestedStartDate: candidate.startDate,
  });

  if (activation.scheduled) {
    const scheduled = await client.studentContract.update({
      where: { id: candidate.id },
      data: {
        status: 'pending_signature',
        signedAt,
        startDate: activation.effectiveAt,
        endDate: null,
        canceledAt: null,
        cancellationReason: null,
      },
    });

    return {
      studentContract: scheduled,
      activation,
    };
  }

  const activated = await activateCandidateAt(client, candidate.id, activation.effectiveAt);
  return {
    studentContract: activated,
    activation,
  };
};

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

      const lifecycle = await registerSignedCandidate(tx, studentContract.id, signedAt);

      await tx.contractAuditLog.create({
        data: {
          contractId: contract.id,
          actorUserId: actor.userId,
          action: 'SIGNED',
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          details: {
            signatureId: signature.id,
            effectiveAt: lifecycle.activation.effectiveAt.toISOString(),
            scheduled: lifecycle.activation.scheduled,
          },
        },
      });

      return {
        signature,
        activation: {
          effectiveAt: lifecycle.activation.effectiveAt.toISOString(),
          scheduled: lifecycle.activation.scheduled,
          studentContractStatus: lifecycle.studentContract.status,
        },
      };
    });
  },

  async prepareOrActivateStudentContract(studentContractId: string, now = new Date()) {
    const candidate = await prisma.studentContract.findUnique({
      where: { id: studentContractId },
      include: {
        contract: {
          select: {
            status: true,
            signedAt: true,
          },
        },
      },
    });

    if (!candidate) {
      throw new Error('Vínculo de contrato do aluno não encontrado');
    }

    if (
      candidate.contract.status === 'CANCELLED' ||
      candidate.contract.status === 'EXPIRED' ||
      candidate.status === 'canceled' ||
      candidate.status === 'expired' ||
      candidate.status === 'terminated'
    ) {
      throw new Error('Contrato substituto não está disponível para ativação');
    }

    if (candidate.contract.status !== 'SIGNED') {
      if (candidate.status === 'active') {
        throw new Error('Contrato vigente possui documento eletrônico não assinado');
      }

      const pendingStatus =
        candidate.contract.status === 'SENT' || candidate.contract.status === 'VIEWED'
          ? 'pending_signature'
          : 'draft';
      const prepared = await prisma.studentContract.update({
        where: { id: candidate.id },
        data: {
          status: pendingStatus,
          endDate: null,
        },
      });

      return {
        studentContract: prepared,
        activationDeferred: true,
        reason: 'awaiting_signature' as const,
      };
    }

    const signedAt = candidate.contract.signedAt ?? candidate.signedAt ?? now;
    const lifecycle = await prisma.$transaction((tx) =>
      registerSignedCandidate(tx, candidate.id, signedAt)
    );

    return {
      studentContract: lifecycle.studentContract,
      activationDeferred: lifecycle.activation.scheduled,
      reason: lifecycle.activation.scheduled
        ? ('scheduled_start' as const)
        : ('activated' as const),
      effectiveAt: lifecycle.activation.effectiveAt,
    };
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
      orderBy: [
        { startDate: 'asc' },
        { createdAt: 'asc' },
      ],
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

          await activateCandidateAt(tx, current.id, current.startDate);
          return true;
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
