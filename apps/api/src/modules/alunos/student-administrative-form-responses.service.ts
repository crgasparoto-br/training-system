import type { Prisma } from '@prisma/client';
import { upsertStudentIdentity } from './student-identity.service.js';

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

const toInputJson = (value: JsonRecord): Prisma.InputJsonValue =>
  value as Prisma.InputJsonValue;

const identityField = (
  target: JsonRecord,
  incoming: JsonRecord,
  incomingKey: string,
  canonicalKey: string = incomingKey
) => {
  if (hasOwn(incoming, incomingKey)) {
    target[canonicalKey] = optionalText(incoming[incomingKey]);
  }
};

/**
 * Produces the tenant-scoped identity patch used by the canonical identity
 * writer. The web form still exposes a few compatibility field names
 * (`address`, `instagram`); only canonical names are persisted.
 */
export const buildStudentAdministrativeIdentityPatch = (
  incoming: JsonRecord
): JsonRecord => {
  const patch: JsonRecord = {};

  identityField(patch, incoming, 'cpf');
  identityField(patch, incoming, 'rg');
  identityField(patch, incoming, 'maritalStatus');
  identityField(patch, incoming, 'address', 'addressStreet');
  identityField(patch, incoming, 'addressNumber');
  identityField(patch, incoming, 'addressComplement');
  identityField(patch, incoming, 'neighborhood', 'addressNeighborhood');
  identityField(patch, incoming, 'city', 'addressCity');
  identityField(patch, incoming, 'state', 'addressState');
  identityField(patch, incoming, 'zipCode', 'addressZipCode');
  identityField(patch, incoming, 'socialNetwork');
  identityField(patch, incoming, 'emergencyContactName');
  identityField(patch, incoming, 'emergencyContactPhone');
  identityField(patch, incoming, 'emergencyContactRelationship');

  if (hasOwn(incoming, 'socialAccount')) {
    patch.socialAccount = optionalText(incoming.socialAccount);
  } else if (hasOwn(incoming, 'instagram')) {
    // `instagram` is the old web-form field name. Persist it only as the
    // canonical generic account; Profile.instagramHandle remains an Instagram
    // compatibility projection and is never used for other networks.
    patch.socialAccount = optionalText(incoming.instagram);
  }

  return patch;
};

/**
 * Compatibility merge used only for read-model composition/tests. It never
 * writes AlunoIntakeForm. PAR-Q stays outside this administrative payload and
 * currentService remains server-owned.
 */
export const mergeStudentAdministrativeFormResponses = (
  persisted: unknown,
  incoming: Record<string, unknown>
): JsonRecord => {
  const merged = cloneRecord(persisted);

  for (const [section, rawValue] of Object.entries(incoming)) {
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
      delete nextSection.currentService;
      if (persistedRecord && hasOwn(persistedRecord, 'currentService')) {
        nextSection.currentService = persistedRecord.currentService;
      }
    }

    merged[section] = nextSection;
  }

  return merged;
};

/**
 * Persists administrative registration data in canonical segmented models.
 * Identification always crosses the canonical identity writer; this function
 * never inserts or updates AlunoIntakeForm.formResponses.
 */
export async function upsertStudentAdministrativeFormResponses(
  tx: Prisma.TransactionClient,
  alunoId: string,
  incoming?: Record<string, unknown>,
  sourceReference = 'administrative_registration'
) {
  if (!incoming) return;

  const aluno = await tx.aluno.findUniqueOrThrow({
    where: { id: alunoId },
    select: { contractId: true },
  });
  if (!aluno.contractId) {
    throw new Error('Contrato do aluno não encontrado');
  }

  const identification = asRecord(incoming.identification);
  const preferences = asRecord(incoming.preferences);
  const identityPatch = identification
    ? buildStudentAdministrativeIdentityPatch(identification)
    : {};

  if (identification || preferences) {
    // Even a preferences-only mutation goes through the identity boundary once
    // so a legacy student without StudentProfile receives the canonical row
    // before preferenceData is updated.
    await upsertStudentIdentity(
      alunoId,
      aluno.contractId,
      identityPatch as Parameters<typeof upsertStudentIdentity>[2],
      {
        client: tx,
        sourceType: 'professional',
        sourceReference,
        syncLegacyProfile: false,
      }
    );
  }

  if (preferences) {
    const existing = await tx.studentProfile.findUnique({
      where: { alunoId },
      select: { preferenceData: true },
    });
    const preferenceData = {
      ...cloneRecord(existing?.preferenceData),
      ...preferences,
    };

    await tx.studentProfile.update({
      where: { alunoId },
      data: {
        contractId: aluno.contractId,
        sourceType: 'professional',
        sourceReference,
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
    contractId: aluno.contractId,
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

  // currentServiceName is synchronized only by StudentContract lifecycle.
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

const flattenCanonicalIdentification = (
  canonical: JsonRecord,
  legacy: JsonRecord,
  legacyInstagramHandle?: string | null
) => {
  const flattened: JsonRecord = { ...legacy };
  const address = cloneRecord(canonical.address);

  const mapCanonical = (canonicalKey: string, formKey: string = canonicalKey) => {
    if (hasOwn(canonical, canonicalKey)) {
      flattened[formKey] = canonical[canonicalKey] ?? '';
    }
  };

  mapCanonical('cpf');
  mapCanonical('rg');
  mapCanonical('maritalStatus');
  mapCanonical('addressStreet', 'address');
  mapCanonical('addressNumber');
  mapCanonical('addressComplement');
  mapCanonical('addressNeighborhood', 'neighborhood');
  mapCanonical('addressCity', 'city');
  mapCanonical('addressState', 'state');
  mapCanonical('addressZipCode', 'zipCode');
  mapCanonical('emergencyContactName');
  mapCanonical('emergencyContactPhone');
  mapCanonical('emergencyContactRelationship');

  // Compatibility with the short-lived nested-address representation.
  if (!hasOwn(canonical, 'addressStreet') && Object.keys(address).length > 0) {
    flattened.address = address.street ?? '';
    flattened.addressNumber = address.number ?? '';
    flattened.addressComplement = address.complement ?? '';
    flattened.neighborhood = address.neighborhood ?? '';
    flattened.city = address.city ?? '';
    flattened.state = address.state ?? '';
    flattened.zipCode = address.zipCode ?? '';
  }

  const canonicalAccount = hasOwn(canonical, 'socialAccount')
    ? canonical.socialAccount
    : hasOwn(canonical, 'instagramHandle')
      ? canonical.instagramHandle
      : undefined;
  const legacyAccount = hasOwn(legacy, 'socialAccount')
    ? legacy.socialAccount
    : hasOwn(legacy, 'instagram')
      ? legacy.instagram
      : legacyInstagramHandle;
  const account = canonicalAccount !== undefined ? canonicalAccount : legacyAccount;

  if (hasOwn(canonical, 'socialNetwork')) {
    flattened.socialNetwork = canonical.socialNetwork ?? '';
  } else if (!flattened.socialNetwork && account) {
    flattened.socialNetwork = 'instagram';
  }

  if (account !== undefined) {
    flattened.socialAccount = account ?? '';
    // The current web form still reads this compatibility alias. New writes are
    // converted back to canonical socialAccount above.
    flattened.instagram = account ?? '';
  }

  return flattened;
};

/**
 * Rebuilds the current administrative form payload from canonical segmented
 * models while keeping legacy values as read-only fallback. Canonical values,
 * including explicit empty/null values, always win.
 */
export function buildStudentAdministrativeFormResponsesReadModel(input: {
  legacy?: unknown;
  profile?: {
    identificationData?: unknown;
    preferenceData?: unknown;
    identification?: unknown;
    preferences?: unknown;
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
  legacyInstagramHandle?: string | null;
}) {
  const result = cloneRecord(input.legacy);
  const canonicalIdentification = cloneRecord(
    input.profile?.identificationData ?? input.profile?.identification
  );
  const legacyIdentification = cloneRecord(result.identification);

  if (Object.keys(canonicalIdentification).length > 0) {
    result.identification = flattenCanonicalIdentification(
      canonicalIdentification,
      legacyIdentification,
      input.legacyInstagramHandle
    );
  } else if (input.legacyInstagramHandle && !legacyIdentification.instagram) {
    result.identification = {
      ...legacyIdentification,
      socialNetwork: legacyIdentification.socialNetwork || 'instagram',
      socialAccount: input.legacyInstagramHandle,
      instagram: input.legacyInstagramHandle,
    };
  }

  const preferenceData = cloneRecord(
    input.profile?.preferenceData ?? input.profile?.preferences
  );
  if (Object.keys(preferenceData).length > 0) {
    result.preferences = {
      ...cloneRecord(result.preferences),
      ...preferenceData,
    };
  }

  if (input.financial) {
    result.financial = {
      ...cloneRecord(result.financial),
      ...(input.financial.currentServiceName !== undefined
        ? { currentService: input.financial.currentServiceName ?? '' }
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

  delete result.parqResponses;
  return result;
}
