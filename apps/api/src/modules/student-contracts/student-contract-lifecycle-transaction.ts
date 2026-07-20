import { Prisma, type StudentContract } from '@prisma/client';
import { resolveSignedContractActivation } from './student-contract-activation.js';

type TransactionClient = Prisma.TransactionClient;

export type TransactionalStudentContractLifecycleResult = {
  studentContract: StudentContract;
  activationDeferred: boolean;
  reason: 'awaiting_signature' | 'scheduled_start' | 'activated';
  effectiveAt?: Date;
};

export type CollaboratorContractRow = {
  id: string;
  collaboratorId: string;
  contractId: string | null;
  status: 'draft' | 'pending_signature' | 'active' | 'expired' | 'canceled' | 'terminated' | 'legacy';
  origin: 'ELECTRONIC' | 'LEGACY_PDF' | 'LEGACY_DECLARATION';
  startDate: Date | null;
  endDate: Date | null;
  signedAt: Date | null;
  canceledAt: Date | null;
  cancellationReason: string | null;
  notes: string | null;
  legacyDocumentUrl: string | null;
  legacySourceKey: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TransactionalCollaboratorContractLifecycleResult = {
  collaboratorContract: CollaboratorContractRow;
  activationDeferred: boolean;
  reason: 'awaiting_signature' | 'scheduled_start' | 'activated';
  effectiveAt?: Date;
};

const loadCollaboratorCandidate = async (
  tx: TransactionClient,
  collaboratorContractId: string
) => {
  const rows = await tx.$queryRaw<Array<CollaboratorContractRow & {
    documentStatus: string | null;
    documentSignedAt: Date | null;
  }>>(Prisma.sql`
    SELECT
      cc.*,
      gc."status"::text AS "documentStatus",
      gc."signedAt" AS "documentSignedAt"
    FROM "CollaboratorContract" cc
    LEFT JOIN "GeneratedContract" gc ON gc."id" = cc."contractId"
    WHERE cc."id" = ${collaboratorContractId}
    LIMIT 1
  `);
  return rows[0] ?? null;
};

const activateStudentCandidateAt = async (
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
      contract: { select: { id: true, status: true, signedAt: true } },
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
    data: { status: 'terminated', endDate: effectiveAt },
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

const registerSignedStudentCandidate = async (
  tx: TransactionClient,
  studentContractId: string,
  signedAt: Date
) => {
  const candidate = await tx.studentContract.findUnique({ where: { id: studentContractId } });
  if (!candidate) throw new Error('Vínculo do contrato assinado não encontrado');

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
    return { studentContract: scheduled, activation };
  }

  const activated = await activateStudentCandidateAt(
    tx,
    candidate.id,
    activation.effectiveAt
  );
  return { studentContract: activated, activation };
};

export async function prepareOrActivateStudentContractInTransaction(
  tx: TransactionClient,
  studentContractId: string,
  now = new Date()
): Promise<TransactionalStudentContractLifecycleResult> {
  const candidate = await tx.studentContract.findUnique({
    where: { id: studentContractId },
    include: { contract: { select: { status: true, signedAt: true } } },
  });

  if (!candidate) throw new Error('Vínculo de contrato do aluno não encontrado');

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
      data: { status: pendingStatus },
    });

    return {
      studentContract: prepared,
      activationDeferred: true,
      reason: 'awaiting_signature',
    };
  }

  const persistedSignedAt = candidate.contract.signedAt ?? candidate.signedAt;
  if (
    candidate.status === 'pending_signature' &&
    candidate.signedAt &&
    candidate.startDate &&
    candidate.startDate.getTime() <= now.getTime()
  ) {
    const activated = await activateStudentCandidateAt(
      tx,
      candidate.id,
      candidate.startDate
    );
    return {
      studentContract: activated,
      activationDeferred: false,
      reason: 'activated',
      effectiveAt: candidate.startDate,
    };
  }

  const signedAt = persistedSignedAt ?? now;
  const lifecycle = await registerSignedStudentCandidate(tx, candidate.id, signedAt);

  return {
    studentContract: lifecycle.studentContract,
    activationDeferred: lifecycle.activation.scheduled,
    reason: lifecycle.activation.scheduled ? 'scheduled_start' : 'activated',
    effectiveAt: lifecycle.activation.effectiveAt,
  };
}

export async function prepareOrActivateCollaboratorContractInTransaction(
  tx: TransactionClient,
  collaboratorContractId: string,
  now = new Date()
): Promise<TransactionalCollaboratorContractLifecycleResult> {
  let candidate = await loadCollaboratorCandidate(tx, collaboratorContractId);
  if (!candidate) throw new Error('Vínculo de contrato do colaborador não encontrado');
  if (candidate.origin !== 'ELECTRONIC' || !candidate.contractId) {
    throw new Error('Registro legado não participa do ciclo de vigência eletrônico');
  }

  if (
    candidate.documentStatus === 'CANCELLED' ||
    candidate.documentStatus === 'EXPIRED' ||
    candidate.status === 'canceled' ||
    candidate.status === 'expired' ||
    candidate.status === 'terminated' ||
    candidate.status === 'legacy'
  ) {
    throw new Error('Contrato substituto não está disponível para ativação');
  }

  if (candidate.documentStatus !== 'SIGNED') {
    if (candidate.status === 'active') {
      throw new Error('Contrato vigente possui documento eletrônico não assinado');
    }
    const pendingStatus =
      candidate.documentStatus === 'SENT' || candidate.documentStatus === 'VIEWED'
        ? 'pending_signature'
        : 'draft';
    await tx.$executeRaw(Prisma.sql`
      UPDATE "CollaboratorContract"
      SET "status" = ${pendingStatus}::"CollaboratorContractStatus", "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${candidate.id}
    `);
    candidate = (await loadCollaboratorCandidate(tx, candidate.id))!;
    return {
      collaboratorContract: candidate,
      activationDeferred: true,
      reason: 'awaiting_signature',
    };
  }

  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "Professor"
    WHERE "id" = ${candidate.collaboratorId}
    FOR UPDATE
  `);
  candidate = (await loadCollaboratorCandidate(tx, candidate.id))!;

  const persistedSignedAt = candidate.documentSignedAt ?? candidate.signedAt ?? now;
  let effectiveAt: Date;
  let scheduled = false;

  if (
    candidate.status === 'pending_signature' &&
    candidate.signedAt &&
    candidate.startDate &&
    candidate.startDate.getTime() <= now.getTime()
  ) {
    effectiveAt = candidate.startDate;
  } else {
    const activation = resolveSignedContractActivation({
      signedAt: persistedSignedAt,
      requestedStartDate: candidate.startDate,
    });
    effectiveAt = activation.effectiveAt;
    scheduled = activation.scheduled;
  }

  if (scheduled) {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "CollaboratorContract"
      SET
        "status" = 'pending_signature'::"CollaboratorContractStatus",
        "signedAt" = ${persistedSignedAt},
        "startDate" = ${effectiveAt},
        "canceledAt" = NULL,
        "cancellationReason" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${candidate.id}
    `);
    candidate = (await loadCollaboratorCandidate(tx, candidate.id))!;
    return {
      collaboratorContract: candidate,
      activationDeferred: true,
      reason: 'scheduled_start',
      effectiveAt,
    };
  }

  await tx.$executeRaw(Prisma.sql`
    UPDATE "CollaboratorContract"
    SET
      "status" = 'terminated'::"CollaboratorContractStatus",
      "endDate" = ${effectiveAt},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "collaboratorId" = ${candidate.collaboratorId}
      AND "status" = 'active'::"CollaboratorContractStatus"
      AND "id" <> ${candidate.id}
  `);

  await tx.$executeRaw(Prisma.sql`
    UPDATE "CollaboratorContract"
    SET
      "status" = 'active'::"CollaboratorContractStatus",
      "startDate" = ${effectiveAt},
      "signedAt" = COALESCE("signedAt", ${persistedSignedAt}),
      "canceledAt" = NULL,
      "cancellationReason" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${candidate.id}
  `);

  await tx.$executeRaw(Prisma.sql`
    UPDATE "Professor"
    SET "currentCollaboratorContractId" = ${candidate.id}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${candidate.collaboratorId}
  `);

  candidate = (await loadCollaboratorCandidate(tx, candidate.id))!;
  return {
    collaboratorContract: candidate,
    activationDeferred: false,
    reason: 'activated',
    effectiveAt,
  };
}
