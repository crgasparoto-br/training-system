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

const hasOwn = (value: JsonRecord, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

const optionalText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const optionalNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const normalized = value
    .trim()
    .replace(/\./gu, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const optionalInteger = (value: unknown): number | null => {
  const parsed = optionalNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
};

const optionalDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;

  const parsed = new Date(
    /^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T00:00:00.000Z` : value
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const optionalYesNo = (value: unknown): boolean | null => {
  if (value === true || value === 'yes') return true;
  if (value === false || value === 'no') return false;
  return null;
};

const mapAdministrativeIdentification = (
  persisted: unknown,
  incoming: JsonRecord
): JsonRecord => {
  const merged = cloneRecord(persisted);
  const existingAddress = cloneRecord(merged.address);
  const next = { ...incoming };

  const addressKeys = [
    'address',
    'addressNumber',
    'addressComplement',
    'neighborhood',
    'city',
    'state',
    'zipCode',
  ] as const;
  const hasAddressMutation = addressKeys.some((key) => hasOwn(incoming, key));

  if (hasAddressMutation) {
    merged.address = {
      ...existingAddress,
      ...(hasOwn(incoming, 'address') ? { street: optionalText(incoming.address) } : {}),
      ...(hasOwn(incoming, 'addressNumber') ? { number: optionalText(incoming.addressNumber) } : {}),
      ...(hasOwn(incoming, 'addressComplement')
        ? { complement: optionalText(incoming.addressComplement) }
        : {}),
      ...(hasOwn(incoming, 'neighborhood')
        ? { neighborhood: optionalText(incoming.neighborhood) }
        : {}),
      ...(hasOwn(incoming, 'city') ? { city: optionalText(incoming.city) } : {}),
      ...(hasOwn(incoming, 'state') ? { state: optionalText(incoming.state) } : {}),
      ...(hasOwn(incoming, 'zipCode') ? { zipCode: optionalText(incoming.zipCode) } : {}),
    };
  }

  addressKeys.forEach((key) => delete next[key]);
  return { ...merged, ...next };
};

const toInputJson = (value: JsonRecord): Prisma.InputJsonValue =>
  value as Prisma.InputJsonValue;

/**
 * Maps the administrative registration payload into the canonical profile
 * models. AlunoIntakeForm became database read-only after the health-intake
 * cutover, so this writer must never restore the legacy dual-write.
 */
export async function upsertStudentAdministrativeFormResponses(
  tx: Prisma.TransactionClient,
  alunoId: string,
  contractId: string,
  incoming?: Record<string, unknown>,
  sourceReference = 'administrative_registration'
) {
  if (!incoming) return;

  const identification = asRecord(incoming.identification);
  const preferences = asRecord(incoming.preferences);

  if (identification || preferences) {
    const existing = await tx.studentProfile.findUnique({
      where: { alunoId },
      select: {
        identificationData: true,
        preferenceData: true,
      },
    });

    const identificationData = identification
      ? mapAdministrativeIdentification(existing?.identificationData, identification)
      : cloneRecord(existing?.identificationData);
    const preferenceData = preferences
      ? { ...cloneRecord(existing?.preferenceData), ...preferences }
      : cloneRecord(existing?.preferenceData);

    await tx.studentProfile.upsert({
      where: { alunoId },
      create: {
        alunoId,
        contractId,
        sourceType: 'professional',
        sourceReference,
        identificationData: toInputJson(identificationData),
        preferenceData: toInputJson(preferenceData),
      },
      update: {
        contractId,
        sourceType: 'professional',
        sourceReference,
        identificationData: toInputJson(identificationData),
        preferenceData: toInputJson(preferenceData),
      },
    });
  }

  const financial = asRecord(incoming.financial);
  if (!financial) return;

  const existingFinancial = await tx.studentFinancialProfile.findUnique({
    where: { alunoId },
  });
  const common = {
    contractId,
    sourceType: 'professional' as const,
    sourceReference,
    ...(hasOwn(financial, 'specialCondition')
      ? { specialCondition: optionalText(financial.specialCondition) }
      : {}),
    ...(hasOwn(financial, 'monthlyValue')
      ? { monthlyAmount: optionalNumber(financial.monthlyValue) }
      : {}),
    ...(hasOwn(financial, 'discountPercentage')
      ? { discountPercentage: optionalNumber(financial.discountPercentage) }
      : {}),
    ...(hasOwn(financial, 'paymentDay')
      ? { paymentDay: optionalInteger(financial.paymentDay) }
      : {}),
    ...(hasOwn(financial, 'contractStartDate')
      ? { contractStartDate: optionalDate(financial.contractStartDate) }
      : {}),
    ...(hasOwn(financial, 'contractDueDate')
      ? { contractDueDate: optionalDate(financial.contractDueDate) }
      : {}),
    ...(hasOwn(financial, 'cameFromReferral')
      ? { cameFromReferral: optionalYesNo(financial.cameFromReferral) }
      : {}),
    ...(hasOwn(financial, 'referralPerson')
      ? { referralPerson: optionalText(financial.referralPerson) }
      : {}),
    ...(hasOwn(financial, 'otherObservations')
      ? { notes: optionalText(financial.otherObservations) }
      : {}),
  };

  // currentServiceName is intentionally not copied from the browser. Contract
  // lifecycle remains the only authority for the effective financial service.
  await tx.studentFinancialProfile.upsert({
    where: { alunoId },
    create: {
      alunoId,
      ...common,
    },
    update: {
      ...common,
      ...(existingFinancial?.currentServiceName
        ? { currentServiceName: existingFinancial.currentServiceName }
        : {}),
    },
  });
}

const formatAmount = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  return numeric.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatPercentage = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric).replace('.', ',') : '';
};

const formatInputDate = (value: unknown) => {
  if (!value) return '';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

/**
 * Builds a compatibility read model for the current web form without writing
 * back to AlunoIntakeForm. This lets old UI readers migrate incrementally to
 * StudentProfile / StudentFinancialProfile.
 */
export function buildStudentAdministrativeFormResponsesReadModel(input: {
  legacy?: unknown;
  profile?: {
    identificationData?: unknown;
    preferenceData?: unknown;
  } | null;
  financial?: {
    currentServiceName?: string | null;
    specialCondition?: string | null;
    monthlyAmount?: unknown;
    discountPercentage?: unknown;
    paymentDay?: number | null;
    contractStartDate?: Date | string | null;
    contractDueDate?: Date | string | null;
    cameFromReferral?: boolean | null;
    referralPerson?: string | null;
    notes?: string | null;
  } | null;
}) {
  const result = cloneRecord(input.legacy);
  const canonicalIdentification = cloneRecord(input.profile?.identificationData);

  if (Object.keys(canonicalIdentification).length > 0) {
    const address = cloneRecord(canonicalIdentification.address);
    const legacyIdentification = cloneRecord(result.identification);
    const flattened = {
      ...legacyIdentification,
      ...canonicalIdentification,
      ...(Object.keys(address).length > 0
        ? {
            address: (address.street as string | null | undefined) ?? '',
            addressNumber: (address.number as string | null | undefined) ?? '',
            addressComplement: (address.complement as string | null | undefined) ?? '',
            neighborhood: (address.neighborhood as string | null | undefined) ?? '',
            city: (address.city as string | null | undefined) ?? '',
            state: (address.state as string | null | undefined) ?? '',
            zipCode: (address.zipCode as string | null | undefined) ?? '',
          }
        : {}),
    };
    delete flattened.addressStreet;
    result.identification = flattened;
  }

  const preferenceData = cloneRecord(input.profile?.preferenceData);
  if (Object.keys(preferenceData).length > 0) {
    result.preferences = {
      ...cloneRecord(result.preferences),
      ...preferenceData,
    };
  }

  if (input.financial) {
    result.financial = {
      ...cloneRecord(result.financial),
      ...(input.financial.currentServiceName
        ? { currentService: input.financial.currentServiceName }
        : {}),
      specialCondition: input.financial.specialCondition ?? '',
      monthlyValue: formatAmount(input.financial.monthlyAmount),
      discountPercentage: formatPercentage(input.financial.discountPercentage),
      paymentDay: input.financial.paymentDay ? String(input.financial.paymentDay) : '',
      contractStartDate: formatInputDate(input.financial.contractStartDate),
      contractDueDate: formatInputDate(input.financial.contractDueDate),
      cameFromReferral:
        input.financial.cameFromReferral === true
          ? 'yes'
          : input.financial.cameFromReferral === false
            ? 'no'
            : '',
      referralPerson: input.financial.referralPerson ?? '',
      otherObservations: input.financial.notes ?? '',
    };
  }

  return result;
}
