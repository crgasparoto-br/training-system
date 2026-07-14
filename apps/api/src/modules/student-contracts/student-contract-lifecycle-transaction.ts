import { Prisma, type StudentContract } from '@prisma/client';
import { resolveSignedContractActivation } from './student-contract-activation.js';

type TransactionClient = Prisma.TransactionClient;

export type TransactionalStudentContractLifecycleResult = {
  studentContract: StudentContract;
  activationDeferred: boolean;
  reason: 'awaiting_signature' | 'scheduled_start' | 'activated';
  effectiveAt?: Date;
};

const activateCandidateAt = async (
  tx: TransactionClient,
  studentContractId: string,
  effectiveAt: Date
) => {
  const initialCandidate = await tx.studentContract.findUnique({
    where: { id: studentContractId },
    select: { alunoId: true },
  });

  if (!initialCandidate) {
    throw new Error('Vínculo do contrato substituto não encontrado');
  }

  await tx.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "Aluno"
    WHERE "id" = ${initialCandidate.alunoId}
    FOR UPDATE
  `);

  const candidate = await tx.studentContract.findUnique({
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
    await tx.aluno.update({
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

  await tx.studentContract.updateMany({
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

  const activated = await tx.studentContract.update({
    where: { id: candidate.id },
    data: {
      status: 'active',
      startDate: effectiveAt,
      signedAt: candidate.signedAt ?? candidate.contract.signedAt ?? effectiveAt,
      canceledAt: null,
      cancellationReason: null,
    },
  });

  await tx.aluno.update({
    where: { id: candidate.alunoId },
    data: { currentStudentContractId: activated.id },
  });

  return activated;
};

const registerSignedCandidate = async (
  tx: TransactionClient,
  studentContractId: string,
  signedAt: Date
) => {
  const candidate = await tx.studentContract.findUnique({
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
    const scheduled = await tx.studentContract.update({
      where: { id: candidate.id },
      data: {
        status: 'pending_signature',
        signedAt,
        startDate: activation.effectiveAt,
        canceledAt: null,
        cancellationReason: null,
      },
    });

    return {
      studentContract: scheduled,
      activation,
    };
  }

  const activated = await activateCandidateAt(
    tx,
    candidate.id,
    activation.effectiveAt
  );
  return {
    studentContract: activated,
    activation,
  };
};

export async function prepareOrActivateStudentContractInTransaction(
  tx: TransactionClient,
  studentContractId: string,
  now = new Date()
): Promise<TransactionalStudentContractLifecycleResult> {
  const candidate = await tx.studentContract.findUnique({
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
    const prepared = await tx.studentContract.update({
      where: { id: candidate.id },
      data: {
        status: pendingStatus,
      },
    });

    return {
      studentContract: prepared,
      activationDeferred: true,
      reason: 'awaiting_signature',
    };
  }

  const signedAt = candidate.contract.signedAt ?? candidate.signedAt ?? now;
  const lifecycle = await registerSignedCandidate(tx, candidate.id, signedAt);

  return {
    studentContract: lifecycle.studentContract,
    activationDeferred: lifecycle.activation.scheduled,
    reason: lifecycle.activation.scheduled ? 'scheduled_start' : 'activated',
    effectiveAt: lifecycle.activation.effectiveAt,
  };
}
