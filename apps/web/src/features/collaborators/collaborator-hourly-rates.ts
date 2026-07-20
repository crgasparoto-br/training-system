import type { HourlyRateLevel } from '@corrida/types';

export type CollaboratorHourlyRateKey = 'personal' | 'consulting' | 'evaluation';

export const collaboratorHourlyRateSections: Array<{
  key: CollaboratorHourlyRateKey;
  label: string;
}> = [
  { key: 'personal', label: 'Personal' },
  { key: 'consulting', label: 'Consultoria' },
  { key: 'evaluation', label: 'Avaliação' },
];

export function parseCollaboratorRateInput(value?: string | null): number | null {
  const input = value?.trim().replace(/\s/g, '');
  if (!input) return null;

  const normalized = input.includes(',')
    ? input.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(input)
      ? input.replace(/\./g, '')
      : input;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(2)) : null;
}

export function isValidCollaboratorRateInput(value?: string | null) {
  return !value?.trim() || parseCollaboratorRateInput(value) !== null;
}

export function formatCollaboratorRateInput(value?: string | null) {
  const parsed = parseCollaboratorRateInput(value);
  if (parsed === null) return value?.trim() ? value : '';
  return parsed.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function getCollaboratorHourlyRateLevelLabel(
  value: string | undefined,
  levels: HourlyRateLevel[]
) {
  const parsed = parseCollaboratorRateInput(value);
  if (parsed === null) return 'Não configurado';

  const configuredLevels = levels
    .filter(
      (level): level is HourlyRateLevel & { minValue: number; maxValue: number } =>
        level.isActive !== false &&
        typeof level.minValue === 'number' &&
        typeof level.maxValue === 'number'
    )
    .sort((first, second) => first.order - second.order);

  if (configuredLevels.length === 0) return 'Faixas pendentes de configuração';

  return (
    configuredLevels.find(
      (level) => parsed >= level.minValue && parsed <= level.maxValue
    )?.label ?? 'Não classificado'
  );
}
