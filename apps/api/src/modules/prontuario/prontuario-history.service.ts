import type { Prisma as PrismaType } from '@prisma/client';

export const PRNT_HISTORY_BLOCKS = {
  record: 'summary',
  goal: 'goals',
  anamnesisFollowUp: 'anamnesisFollowUp',
  activityHistory: 'activityHistory',
  medicationProcedure: 'medicationsProcedures',
  painCase: 'painCases',
  painFollowUp: 'painCases',
  discomfortSnapshot: 'discomforts',
} as const;

export type ProntuarioHistoryEntityType = keyof typeof PRNT_HISTORY_BLOCKS;

type RecordContext = { id: string; contractId: string; alunoId: string };
type HistoryClient = Pick<PrismaType.TransactionClient, 'prontuarioHistoryEvent'>;

function jsonSnapshot(value: unknown): PrismaType.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as PrismaType.InputJsonValue;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    return '{' + Object.keys(value).filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort().map((key) => JSON.stringify(key) + ':' + stable((value as Record<string, unknown>)[key])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}

// All revisions are appended in the same transaction as the mutable current state.
// A legacy row receives an explicit baseline before its first edited version.
export async function appendProntuarioHistory(
  tx: HistoryClient,
  record: RecordContext,
  entityType: ProntuarioHistoryEntityType,
  entityId: string,
  before: unknown | null,
  after: unknown,
  actorUserId?: string | null
) {
  if (before !== null && stable(before) === stable(after)) return false;
  let latest = await tx.prontuarioHistoryEvent.findFirst({
    where: { entityType, entityId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  if (!latest && before !== null) {
    await tx.prontuarioHistoryEvent.create({
      data: {
        recordId: record.id, contractId: record.contractId, alunoId: record.alunoId,
        entityType, entityId, version: 1, action: 'baseline',
        snapshot: jsonSnapshot(before), actorUserId: null, source: 'legacy-baseline',
      },
    });
    latest = { version: 1 };
  }
  const next = after as { status?: string; endDate?: unknown };
  const closed = next.status === 'closed' || next.status === 'resolved' ||
    next.status === 'archived' || (next.endDate != null && (before as { endDate?: unknown } | null)?.endDate == null);
  await tx.prontuarioHistoryEvent.create({
    data: {
      recordId: record.id, contractId: record.contractId, alunoId: record.alunoId,
      entityType, entityId, version: (latest?.version ?? 0) + 1,
      action: before === null ? 'created' : closed ? 'closed' : 'updated',
      snapshot: jsonSnapshot(after), actorUserId: actorUserId ?? null, source: 'prnt-api',
    },
  });
  return true;
}

export function assertKnownProntuarioItem(id: string | undefined, exists: boolean) {
  if (id && !exists) throw new Error('Registro clínico não encontrado no contrato');
}
