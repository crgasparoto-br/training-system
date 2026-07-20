import { Prisma, type StudentContract } from '@prisma/client';
import { resolveSignedContractActivation } from './student-contract-activation.js';
import type { ContractPartyType } from '../contracts/contract-variable-definitions.js';

type TransactionClient = Prisma.TransactionClient;
type ContractLink = StudentContract & {
  collaboratorId?: string;
  contract: {
    id?: string;
    status: string;
    signedAt: Date | null;
  };
};

export type TransactionalPartyContractLifecycleResult = {
  link: ContractLink;
  partyType: ContractPartyType;
  activationDeferred: boolean;
  reason: 'awaiting_signature' | 'scheduled_start' | 'activated';
  effectiveAt?: Date;
};

export type TransactionalStudentContractLifecycleResult = {
  studentContract: StudentContract;
  activationDeferred: boolean;
  reason: 'awaiting_signature' | 'scheduled_start' | 'activated';
  effectiveAt?: Date;
};

const delegateFor = (tx: TransactionClient, partyType: ContractPartyType) =>
  partyType === 'STUDENT'
    ? (tx as any).studentContract
    : (tx as any).collaboratorContract;

const partyIdField = (partyType: ContractPartyType) =>
  partyType === 'STUDENT' ? 'alunoId' : 'collaboratorId';

const currentPointerField = (partyType: ContractPartyType) =>
  partyType === 'STUDENT' ? 'currentStudentContractId' : 'currentCollaboratorContractId';

const partyDelegate = (tx: TransactionClient, partyType: ContractPartyType) =>
  partyType === 'STUDENT' ? (tx as any).aluno : (tx as any).professor;

const lockParty = async (
  tx: TransactionClient,
  partyType: ContractPartyType,
  partyId: string
) => {
  if (partyType === 'STUDENT') {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "Athlete"
      WHERE "id" = ${partyId}
      FOR UPDATE
    `);
    return;
  }

  await tx.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "Educator"
    WHERE "id" = ${partyId}
    FOR UPDATE
  `);
};

const loadCandidate = async (
  tx: TransactionClient,
  partyType: ContractPartyType,
  linkId: string
): Promise<ContractLink | null> => {
  const candidate = await delegateFor(tx, partyType).findUnique({
    where: { id: linkId },
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
  return candidate as ContractLink | null;
};

const updateCurrentPointer = async (
  tx: TransactionClient,
  partyType: ContractPartyType,
  partyId: string,
  linkId: string
) => {
  await partyDelegate(tx, partyType).update({
    where: { id: partyId },
    data: { [currentPointerField(partyType)]: linkId },
  });
};

const activateCandidateAt = async (
  tx: TransactionClient,
  partyType: ContractPartyType,
  linkId: string,
  effectiveAt: Date
) => {
  const delegate = delegateFor(tx, partyType);
  const idField = partyIdField(partyType);
  const initialCandidate = await delegate.findUnique({
    where: { id: linkId },
    select: { [idField]: true },
  });

  const partyId = initialCandidate?.[idField] as string | undefined;
  if (!partyId) {
    throw new Error('Vínculo do contrato substituto não encontrado');
  }

  await lockParty(tx, partyType, partyId);

  const candidate = await loadCandidate(tx, partyType, linkId);
  if (!candidate) {
    throw new Error('Vínculo do contrato substituto não encontrado');
  }

  if (candidate.status === 'active') {
    await updateCurrentPointer(tx, partyType, partyId, candidate.id);
    return candidate;
  }

  if (
    candidate.status === 'canceled' ||
    candidate.status === 'expired' ||
    candidate.status === 'terminated' ||
    candidate.status === 'legacy'
  ) {
    throw new Error('Contrato substituto não está disponível para ativação');
  }

  if (candidate.contract.status !== 'SIGNED') {
    throw new Error('Somente contrato assinado pode entrar em vigor');
  }

  await delegate.updateMany({
    where: {
      [idField]: partyId,
      status: 'active',
      id: { not: candidate.id },
    },
    data: {
      status: 'terminated',
      endDate: effectiveAt,
    },
  });

  const activated = await delegate.update({
    where: { id: candidate.id },
    data: {
      status: 'active',
      startDate: effectiveAt,
      signedAt: candidate.signedAt ?? candidate.contract.signedAt ?? effectiveAt,
      canceledAt: null,
      cancellationReason: null,
    },
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

  await updateCurrentPointer(tx, partyType, partyId, activated.id);
  return activated as ContractLink;
};

const registerSignedCandidate = async (
  tx: TransactionClient,
  partyType: ContractPartyType,
  linkId: string,
  signedAt: Date
) => {
  const delegate = delegateFor(tx, partyType);
  const candidate = await delegate.findUnique({ where: { id: linkId } });
  if (!candidate) {
    throw new Error('Vínculo do contrato assinado não encontrado');
  }

  const activation = resolveSignedContractActivation({
    signedAt,
    requestedStartDate: candidate.startDate,
  });

  if (activation.scheduled) {
    const scheduled = await delegate.update({
      where: { id: candidate.id },
      data: {
        status: 'pending_signature',
        signedAt,
        startDate: activation.effectiveAt,
        canceledAt: null,
        cancellationReason: null,
      },
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
    return { link: scheduled as ContractLink, activation };
  }

  const activated = await activateCandidateAt(
    tx,
    partyType,
    candidate.id,
    activation.effectiveAt
  );
  return { link: activated, activation };
};

export async function prepareOrActivatePartyContractInTransaction(
  tx: TransactionClient,
  partyType: ContractPartyType,
  linkId: string,
  now = new Date()
): Promise<TransactionalPartyContractLifecycleResult> {
  const delegate = delegateFor(tx, partyType);
  const candidate = await loadCandidate(tx, partyType, linkId);

  if (!candidate) {
    const label = partyType === 'STUDENT' ? 'aluno' : 'colaborador';
    throw new Error(`Vínculo de contrato do ${label} não encontrado`);
  }

  if (
    candidate.contract.status === 'CANCELLED' ||
    candidate.contract.status === 'EXPIRED' ||
    candidate.status === 'canceled' ||
    candidate.status === 'expired' ||
    candidate.status === 'terminated' ||
    candidate.status === 'legacy'
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
    const prepared = await delegate.update({
      where: { id: candidate.id },
      data: { status: pendingStatus },
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

    return {
      link: prepared as ContractLink,
      partyType,
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
    const activated = await activateCandidateAt(
      tx,
      partyType,
      candidate.id,
      candidate.startDate
    );
    return {
      link: activated,
      partyType,
      activationDeferred: false,
      reason: 'activated',
      effectiveAt: candidate.startDate,
    };
  }

  const signedAt = persistedSignedAt ?? now;
  const lifecycle = await registerSignedCandidate(tx, partyType, candidate.id, signedAt);

  return {
    link: lifecycle.link,
    partyType,
    activationDeferred: lifecycle.activation.scheduled,
    reason: lifecycle.activation.scheduled ? 'scheduled_start' : 'activated',
    effectiveAt: lifecycle.activation.effectiveAt,
  };
}

export async function prepareOrActivateStudentContractInTransaction(
  tx: TransactionClient,
  studentContractId: string,
  now = new Date()
): Promise<TransactionalStudentContractLifecycleResult> {
  const result = await prepareOrActivatePartyContractInTransaction(
    tx,
    'STUDENT',
    studentContractId,
    now
  );
  return {
    studentContract: result.link as StudentContract,
    activationDeferred: result.activationDeferred,
    reason: result.reason,
    effectiveAt: result.effectiveAt,
  };
}

export async function prepareOrActivateCollaboratorContractInTransaction(
  tx: TransactionClient,
  collaboratorContractId: string,
  now = new Date()
) {
  return prepareOrActivatePartyContractInTransaction(
    tx,
    'COLLABORATOR',
    collaboratorContractId,
    now
  );
}
