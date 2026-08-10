import { createHash } from 'node:crypto';
import type {
  AdipometryCalculationSnapshot,
  AdipometryProtocolCompatibility,
  AdipometryProtocolSex,
  AdipometryProtocolSexSource,
} from '@corrida/types';

export type AdipometryProfileAuthority = {
  birthDate: string | null;
  profileSex: 'male' | 'female' | 'other' | null;
};

export type PersistedAdipometryProtocolSexDecision = {
  protocolSex: AdipometryProtocolSex | null;
  profileSexSnapshot: 'male' | 'female' | 'other';
  source: AdipometryProtocolSexSource | null;
  confirmedByUserId: string | null;
  confirmedAt: string | null;
  overrideReason: string | null;
};

type CompatibilityReason = AdipometryProtocolCompatibility['reasons'][number];

function stableJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)])
      );
    }
    return item;
  };

  return JSON.stringify(normalize(value));
}

export function getProtocolSexSourceIncompatibility(input: {
  profile: AdipometryProfileAuthority;
  protocolSex: AdipometryProtocolSex | null;
  source: AdipometryProtocolSexSource | null;
  overrideReason: string | null;
  requirePersistedConfirmation?: boolean;
  confirmedByUserId?: string | null;
  confirmedAt?: string | null;
}): CompatibilityReason | null {
  if (
    !input.protocolSex
    || !input.source
    || (input.requirePersistedConfirmation && (!input.confirmedByUserId || !input.confirmedAt))
  ) {
    return {
      code: 'MISSING_PROTOCOL_SEX_CONFIRMATION',
      field: 'protocolSex',
      message: 'Confirme o sexo de referência utilizado pelo protocolo.',
    };
  }

  const concreteProfileSex = input.profile.profileSex === 'male' || input.profile.profileSex === 'female'
    ? input.profile.profileSex
    : null;

  if (input.source === 'profile') {
    if (!concreteProfileSex || concreteProfileSex !== input.protocolSex) {
      return {
        code: concreteProfileSex
          ? 'PROTOCOL_SEX_DIVERGENCE_REQUIRES_REASON'
          : 'MISSING_PROTOCOL_SEX_CONFIRMATION',
        field: concreteProfileSex ? 'protocolSexOverrideReason' : 'protocolSexSource',
        message: concreteProfileSex
          ? 'A origem cadastral só pode ser usada quando o sexo de referência coincide com o cadastro.'
          : 'Sem sexo cadastral masculino ou feminino, registre uma confirmação profissional explícita.',
      };
    }
    return null;
  }

  if (!concreteProfileSex) {
    if (input.source !== 'professional_confirmation') {
      return {
        code: 'MISSING_PROTOCOL_SEX_CONFIRMATION',
        field: 'protocolSexSource',
        message: 'Sem sexo cadastral masculino ou feminino, registre uma confirmação profissional explícita.',
      };
    }
    return null;
  }

  if (concreteProfileSex !== input.protocolSex) {
    if (input.source !== 'professional_override' || !input.overrideReason?.trim()) {
      return {
        code: 'PROTOCOL_SEX_DIVERGENCE_REQUIRES_REASON',
        field: 'protocolSexOverrideReason',
        message: 'Informe o motivo da divergência entre cadastro e sexo de referência.',
      };
    }
  }

  return null;
}

export function buildAdipometryClinicalFingerprint(input: {
  legacyFingerprint: string;
  profile: AdipometryProfileAuthority;
  ageAtAssessment: number | null;
  decision: PersistedAdipometryProtocolSexDecision;
}): string {
  return createHash('sha256').update(stableJson({
    legacyFingerprint: input.legacyFingerprint,
    profileAuthority: {
      birthDate: input.profile.birthDate,
      profileSex: input.profile.profileSex,
      ageAtAssessment: input.ageAtAssessment,
    },
    protocolSexDecision: input.decision,
  })).digest('hex');
}

export function applyPersistedProtocolSexDecision(
  snapshot: AdipometryCalculationSnapshot,
  decision: PersistedAdipometryProtocolSexDecision
): AdipometryCalculationSnapshot {
  if (
    !decision.protocolSex
    || !decision.source
    || !decision.confirmedByUserId
    || !decision.confirmedAt
  ) {
    throw new Error('Persisted protocol sex confirmation is incomplete.');
  }

  return {
    ...snapshot,
    protocolSexDecision: {
      protocolSex: decision.protocolSex,
      profileSexSnapshot: decision.profileSexSnapshot,
      source: decision.source,
      confirmedByUserId: decision.confirmedByUserId,
      confirmedAt: decision.confirmedAt,
      overrideReason: decision.overrideReason,
    },
  } as AdipometryCalculationSnapshot;
}
