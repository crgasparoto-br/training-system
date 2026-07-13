import type { StudentContract } from '@prisma/client';
import type {
  StudentContractActivationReason,
  StudentContractActivationResponse,
} from '@corrida/types';

type LifecycleServiceResult = {
  studentContract: StudentContract;
  activationDeferred: boolean;
  reason: StudentContractActivationReason;
  effectiveAt?: Date;
};

const toIsoString = (value: Date | null | undefined) => value?.toISOString() ?? null;

export function serializeStudentContractActivation(
  result: LifecycleServiceResult
): StudentContractActivationResponse {
  const { studentContract } = result;

  return {
    studentContract: {
      id: studentContract.id,
      alunoId: studentContract.alunoId,
      contractId: studentContract.contractId,
      serviceId: studentContract.serviceId,
      status: studentContract.status,
      startDate: toIsoString(studentContract.startDate),
      endDate: toIsoString(studentContract.endDate),
      signedAt: toIsoString(studentContract.signedAt),
      canceledAt: toIsoString(studentContract.canceledAt),
      cancellationReason: studentContract.cancellationReason,
      amount: studentContract.amount === null ? null : Number(studentContract.amount),
      paymentDay: studentContract.paymentDay,
      notes: studentContract.notes,
      createdAt: studentContract.createdAt.toISOString(),
      updatedAt: studentContract.updatedAt.toISOString(),
    },
    activationDeferred: result.activationDeferred,
    reason: result.reason,
    ...(result.effectiveAt ? { effectiveAt: result.effectiveAt.toISOString() } : {}),
  };
}
