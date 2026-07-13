import type { Prisma } from '@prisma/client';

export const CONTRACT_REJECTION_AUDIT_KIND = 'STUDENT_REJECTION';
export const CONTRACT_REJECTION_REASON_MAX_LENGTH = 1000;

const TERMINAL_CONTRACT_STATUSES = ['SIGNED', 'CANCELLED', 'EXPIRED'] as const;

type AuditLogLike = {
  details?: unknown;
  createdAt: Date | string;
};

export type ContractRejectionMetadata = {
  rejectedAt: string;
  rejectionReason: string | null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const buildContractRejectionClaimWhere = (
  contractId: string,
  tokenDigest: string,
  claimedAt: Date
): Prisma.ContractWhereInput => ({
  id: contractId,
  publicTokenHash: tokenDigest,
  status: { notIn: [...TERMINAL_CONTRACT_STATUSES] },
  OR: [
    { publicTokenExpiresAt: null },
    { publicTokenExpiresAt: { gte: claimedAt } },
  ],
});

export const normalizeContractRejectionReason = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error('Motivo da recusa inválido');
  }

  const normalized = value.trim();
  if (normalized.length > CONTRACT_REJECTION_REASON_MAX_LENGTH) {
    throw new Error(`O motivo da recusa deve ter no máximo ${CONTRACT_REJECTION_REASON_MAX_LENGTH} caracteres`);
  }

  return normalized || null;
};

export const buildContractRejectionAuditDetails = (
  rejectedAt: Date,
  rejectionReason: string | null
) => ({
  kind: CONTRACT_REJECTION_AUDIT_KIND,
  rejectedAt: rejectedAt.toISOString(),
  rejectionReason,
});

export const resolveContractRejection = (
  auditLogs: AuditLogLike[]
): ContractRejectionMetadata | null => {
  for (const auditLog of auditLogs) {
    const details = asRecord(auditLog.details);
    if (details?.kind !== CONTRACT_REJECTION_AUDIT_KIND) continue;

    const rejectedAtValue =
      typeof details.rejectedAt === 'string'
        ? details.rejectedAt
        : auditLog.createdAt instanceof Date
          ? auditLog.createdAt.toISOString()
          : String(auditLog.createdAt);

    return {
      rejectedAt: rejectedAtValue,
      rejectionReason:
        typeof details.rejectionReason === 'string' && details.rejectionReason.trim()
          ? details.rejectionReason.trim()
          : null,
    };
  }

  return null;
};