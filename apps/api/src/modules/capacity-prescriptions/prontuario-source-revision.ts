import type { Prisma } from '@prisma/client';

export type ProntuarioSourceEntityType =
  | 'goal' | 'painCase' | 'anamnesisFollowUp' | 'medicationProcedure'
  | 'discomfortSnapshot' | 'activityHistory';

type HistoryReader = Pick<Prisma.TransactionClient, 'prontuarioHistoryEvent'>;

export class ProntuarioSourceRevisionError extends Error {}

// Numeric versions are exact references to an immutable PRNT event. Legacy
// timestamp strings from existing clients are hints only: resolve current
// event from the database instead of accepting a client-supplied timestamp.
export async function resolveProntuarioSourceRevision(
  client: HistoryReader,
  contractId: string,
  alunoId: string,
  entityType: ProntuarioSourceEntityType,
  entityId: string,
  suppliedVersion?: number | string | null,
) {
  const requestedVersion = typeof suppliedVersion === 'number' ? suppliedVersion : undefined;
  if (requestedVersion !== undefined && (!Number.isSafeInteger(requestedVersion) || requestedVersion < 1)) {
    throw new ProntuarioSourceRevisionError('Versão clínica inválida');
  }

  const event = await client.prontuarioHistoryEvent.findFirst({
    where: {
      contractId, alunoId, entityType, entityId,
      ...(requestedVersion !== undefined ? { version: requestedVersion } : {}),
    },
    orderBy: { version: 'desc' },
    select: { version: true, snapshot: true },
  });
  if (!event) {
    throw new ProntuarioSourceRevisionError('Versão clínica não encontrada para este aluno e contrato');
  }

  return {
    version: event.version,
    snapshot: event.snapshot as Record<string, unknown>,
  };
}

export function revisionText(snapshot: Record<string, unknown>, key: string, fallback: string): string {
  const value = snapshot?.[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function revisionDate(snapshot: Record<string, unknown>, key: string, fallback: Date): string {
  const value = snapshot?.[key];
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return fallback.toISOString();
}
