import type {
  AdipometryInputField,
  AdipometryMeasurements,
  AdipometrySkinfoldField,
} from '@corrida/types';

export type AdipometryFormMeasurements = Record<AdipometryInputField, string>;

export interface AdipometrySkinfoldHelp {
  field: AdipometrySkinfoldField;
  label: string;
  description: string;
  videoUrl: string;
  imageUrl?: string;
}

export const ADIPOMETRY_INPUTS: Array<{
  field: AdipometryInputField;
  label: string;
  unit: 'kg' | 'mm';
}> = [
  { field: 'weightKg', label: 'Peso', unit: 'kg' },
  { field: 'tricepsMm', label: 'Dobra tricipital', unit: 'mm' },
  { field: 'subscapularMm', label: 'Dobra subescapular', unit: 'mm' },
  { field: 'suprailiacMm', label: 'Dobra suprailíaca', unit: 'mm' },
  { field: 'abdominalMm', label: 'Dobra abdominal', unit: 'mm' },
  { field: 'thighMm', label: 'Dobra da coxa', unit: 'mm' },
];

export const ADIPOMETRY_SKINFOLD_HELP: AdipometrySkinfoldHelp[] = [
  {
    field: 'tricepsMm',
    label: 'Dobra tricipital',
    description:
      'Prega vertical na linha posterior do braço, no ponto médio entre a articulação acrômio-clavicular e o olécrano.',
    videoUrl: 'https://youtube.com/shorts/YLiJ0OSeThM',
  },
  {
    field: 'subscapularMm',
    label: 'Dobra subescapular',
    description: 'Prega oblíqua a 2 cm abaixo do ângulo inferior da escápula.',
    videoUrl: 'https://youtube.com/shorts/3faLi9PWMc0',
  },
  {
    field: 'suprailiacMm',
    label: 'Dobra suprailíaca',
    description:
      'Prega oblíqua imediatamente acima da crista ilíaca, na linha axilar anterior.',
    videoUrl: 'https://youtube.com/shorts/dO_tLj2a4r4',
  },
  {
    field: 'abdominalMm',
    label: 'Dobra abdominal',
    description: 'Prega vertical, 2 cm à direita da cicatriz umbilical.',
    videoUrl: 'https://youtube.com/shorts/9IDOMGhLeTE',
  },
  {
    field: 'thighMm',
    label: 'Dobra da coxa',
    description:
      'Prega vertical no ponto médio entre o ligamento inguinal e a borda superior da patela.',
    videoUrl: 'https://youtube.com/shorts/ZF9L-J_kCqs',
  },
];

export function todayLocalDate(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function emptyAdipometryMeasurements(): AdipometryFormMeasurements {
  return {
    weightKg: '',
    tricepsMm: '',
    subscapularMm: '',
    suprailiacMm: '',
    abdominalMm: '',
    thighMm: '',
  };
}

export function formatAdipometryInput(
  value?: number,
  scale?: number
): string {
  if (value === undefined) return '';
  if (scale === undefined) return String(value).replace('.', ',');
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
    useGrouping: false,
  }).format(value);
}

export function parseAdipometryDecimal(rawValue: string): number | undefined {
  const value = rawValue.trim();
  if (!value) return undefined;
  if (!/^\d+(?:[.,]\d+)?$/.test(value)) {
    throw new Error(
      'Use apenas números com vírgula ou ponto como separador decimal.'
    );
  }
  const parsed = Number(value.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Informe um valor maior que zero.');
  }
  return parsed;
}

export function buildAdipometryMeasurements(values: AdipometryFormMeasurements): {
  measurements: AdipometryMeasurements;
  errors: Partial<Record<AdipometryInputField, string>>;
} {
  const measurements: AdipometryMeasurements = {};
  const errors: Partial<Record<AdipometryInputField, string>> = {};

  for (const input of ADIPOMETRY_INPUTS) {
    try {
      const parsed = parseAdipometryDecimal(values[input.field]);
      if (parsed !== undefined) measurements[input.field] = parsed;
    } catch (error) {
      errors[input.field] =
        error instanceof Error ? error.message : 'Valor inválido.';
    }
  }

  return { measurements, errors };
}

export function countPersistedAdipometryInputs(
  measurements: AdipometryMeasurements
): number {
  return ADIPOMETRY_INPUTS.filter(
    ({ field }) => measurements[field] !== undefined
  ).length;
}

export type AdipometryProtocolSexValue = 'male' | 'female' | '';
export type AdipometryProtocolSexSourceValue =
  | 'profile'
  | 'professional_confirmation'
  | 'professional_override'
  | '';

export interface AdipometryFormState {
  assessmentDate: string;
  protocolKey: string;
  protocolSex: AdipometryProtocolSexValue;
  protocolSexSource: AdipometryProtocolSexSourceValue;
  protocolSexOverrideReason: string;
  anthropometryAssessmentId: string;
  notes: string;
  measurements: AdipometryFormMeasurements;
}

export function adipometryProtocolKey(protocol: {
  code: string;
  version: number;
}): string {
  return `${protocol.code}::${protocol.version}`;
}

export function createEmptyAdipometryForm(): AdipometryFormState {
  return {
    assessmentDate: todayLocalDate(),
    protocolKey: '',
    protocolSex: '',
    protocolSexSource: '',
    protocolSexOverrideReason: '',
    anthropometryAssessmentId: '',
    notes: '',
    measurements: emptyAdipometryMeasurements(),
  };
}
