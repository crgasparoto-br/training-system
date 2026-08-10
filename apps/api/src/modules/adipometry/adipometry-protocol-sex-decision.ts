import type {
  AdipometryProtocolSex,
  AdipometryProtocolSexSource,
  UpdateAdipometryDraftInput,
} from '@corrida/types';

export type PersistedAdipometryProtocolSexDecisionFields = {
  protocolSex: AdipometryProtocolSex | null;
  protocolSexSource: AdipometryProtocolSexSource | null;
  protocolSexOverrideReason: string | null;
};

const PROTOCOL_SEX_DECISION_FIELDS = [
  'protocolSex',
  'protocolSexSource',
  'protocolSexOverrideReason',
] as const;

function hasOwn<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function hasAdipometryProtocolSexDecisionPatch(
  input: UpdateAdipometryDraftInput
): boolean {
  return PROTOCOL_SEX_DECISION_FIELDS.some((field) => hasOwn(input, field));
}

export function mergeAdipometryProtocolSexDecisionPatch(
  input: UpdateAdipometryDraftInput,
  current: PersistedAdipometryProtocolSexDecisionFields
): PersistedAdipometryProtocolSexDecisionFields {
  return {
    protocolSex: hasOwn(input, 'protocolSex')
      ? input.protocolSex ?? null
      : current.protocolSex,
    protocolSexSource: hasOwn(input, 'protocolSexSource')
      ? input.protocolSexSource ?? null
      : current.protocolSexSource,
    protocolSexOverrideReason: hasOwn(input, 'protocolSexOverrideReason')
      ? input.protocolSexOverrideReason ?? null
      : current.protocolSexOverrideReason,
  };
}
