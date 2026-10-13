import type { Prisma } from '@prisma/client';

export type ProntuarioSourceEntityType =
  | 'goal' | 'painCase' | 'anamnesisFollowUp' | 'medicationProcedure'
  | 'discomfortSnapshot' | 'activityHistory';

type HistoryReader = Pick<Prisma.TransactionClient, 'prontuarioHistoryEvent'>;

export class ProntuarioSourceRevisionError extends Error {}

// Numeric versions (including numeric strings persisted in sourceVersion) are
// exact PRNT revision IDs. Only legacy nonnumeric timestamps are hints.
function requestedRevision(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const numericText = typeof value === 'string' &&
    /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim());
  if (typeof value !== 'number' && !numericText) return undefined;
  const version = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new ProntuarioSourceRevisionError('Versão clínica inválida');
  }
  return version;
}

export async function resolveProntuarioSourceRevision(
  client: HistoryReader,
  contractId: string,
  alunoId: string,
  entityType: ProntuarioSourceEntityType,
  entityId: string,
  suppliedVersion?: number | string | null,
) {
  const requestedVersion = requestedRevision(suppliedVersion);

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
