import type { FlexibilityArticulationParameters } from '@corrida/types';

export type CapacityAssessmentMeasurement = {
  metricKey: string;
  metricLabel?: string | null;
  valueNumber?: unknown;
  valueText?: string | null;
};

export type CapacityAssessmentRecord = {
  measurements: CapacityAssessmentMeasurement[];
};

const articulationAliases = [
  { name: 'Coluna cervical', aliases: ['coluna_cervical', 'cervical', 'pescoco'] },
  { name: 'Ombro', aliases: ['ombro'] },
  { name: 'Cotovelo', aliases: ['cotovelo'] },
  { name: 'Punho', aliases: ['punho'] },
  { name: 'Dedos', aliases: ['dedos', 'dedo'] },
  { name: 'Quadril', aliases: ['quadril'] },
  { name: 'Joelho', aliases: ['joelho'] },
  { name: 'Tornozelo', aliases: ['tornozelo'] },
] as const;

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    const parsed = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function articulationForMeasurement(measurement: CapacityAssessmentMeasurement) {
  const descriptor = normalize(`${measurement.metricKey} ${measurement.metricLabel ?? ''}`);
  return articulationAliases.find((candidate) =>
    candidate.aliases.some((alias) => descriptor.includes(alias))
  );
}

export function mergeFlexibilityArticulationsFromAssessments(
  records: CapacityAssessmentRecord[],
  existing: FlexibilityArticulationParameters[] = []
): FlexibilityArticulationParameters[] {
  const merged = existing.map((item) => ({ ...item }));
  const indexByName = new Map(merged.map((item, index) => [normalize(item.name), index]));
  const derivedNames = new Set<string>();

  for (const record of records) {
    for (const measurement of record.measurements) {
      const articulation = articulationForMeasurement(measurement);
      const angle = finiteNumber(measurement.valueNumber ?? measurement.valueText);
      if (!articulation || angle === null) continue;

      const normalizedName = normalize(articulation.name);
      if (derivedNames.has(normalizedName)) continue;
      derivedNames.add(normalizedName);

      const existingIndex = indexByName.get(normalizedName);
      if (existingIndex !== undefined) {
        if (merged[existingIndex].angle === null || merged[existingIndex].angle === undefined) {
          merged[existingIndex] = { ...merged[existingIndex], angle };
        }
        continue;
      }

      indexByName.set(normalizedName, merged.length);
      merged.push({ name: articulation.name, angle, priority: 'medium' });
    }
  }

  return merged;
}
