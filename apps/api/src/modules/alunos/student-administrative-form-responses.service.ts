import type { Prisma } from '@prisma/client';

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;

const cloneRecord = (value: unknown): JsonRecord => {
  const record = asRecord(value);
  return record ? { ...record } : {};
};

/**
 * The administrative registration screen still owns non-clinical data that has
 * no dedicated canonical model yet (social account, emergency contact,
 * preferences and commercial notes). Keep that compatibility payload isolated
 * from PAR-Q and from the server-owned current financial service.
 */
export const mergeStudentAdministrativeFormResponses = (
  persisted: unknown,
  incoming: Record<string, unknown>
): JsonRecord => {
  const merged = cloneRecord(persisted);

  for (const [section, rawValue] of Object.entries(incoming)) {
    // PAR-Q writes have a dedicated authenticated boundary and must never be
    // reintroduced through this compatibility writer.
    if (section === 'parqResponses') continue;

    const incomingRecord = asRecord(rawValue);
    const persistedRecord = asRecord(merged[section]);

    if (!incomingRecord) {
      merged[section] = rawValue;
      continue;
    }

    const nextSection: JsonRecord = {
      ...(persistedRecord ?? {}),
      ...incomingRecord,
    };

    if (section === 'financial') {
      // currentService is synchronized from StudentContract. A stale browser
      // payload may never become authoritative over the contract lifecycle.
      delete nextSection.currentService;
      if (
        persistedRecord &&
        Object.prototype.hasOwnProperty.call(persistedRecord, 'currentService')
      ) {
        nextSection.currentService = persistedRecord.currentService;
      }
    }

    merged[section] = nextSection;
  }

  return merged;
};

export async function upsertStudentAdministrativeFormResponses(
  tx: Prisma.TransactionClient,
  alunoId: string,
  incoming?: Record<string, unknown>
) {
  if (!incoming) return null;

  const existing = await tx.alunoIntakeForm.findUnique({
    where: { alunoId },
    select: { formResponses: true },
  });
  const formResponses = mergeStudentAdministrativeFormResponses(
    existing?.formResponses,
    incoming
  ) as Prisma.InputJsonValue;

  return tx.alunoIntakeForm.upsert({
    where: { alunoId },
    create: {
      alunoId,
      formResponses,
    },
    update: {
      formResponses,
    },
  });
}
