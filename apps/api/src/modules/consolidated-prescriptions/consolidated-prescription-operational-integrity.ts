import type { ConsolidatedPrescriptionDataRefInput } from '@corrida/types';
import {
  CONSOLIDATED_EXERCISE_SUBSTITUTION_ORIGIN,
  CONSOLIDATED_OPERATIONAL_PROJECTION_ORIGIN,
} from './consolidated-prescription-operational.service.js';

export const OPERATIONAL_MAPPING_REQUIRED_BLOCKS = [
  'plans.consolidatedPrescriptions.manage',
  'settings.parameters.capacityPrescriptions',
] as const;

const RESERVED_OPERATIONAL_ORIGINS = new Set([
  CONSOLIDATED_OPERATIONAL_PROJECTION_ORIGIN,
  CONSOLIDATED_EXERCISE_SUBSTITUTION_ORIGIN,
]);

export function hasReservedOperationalOrigin(
  ref: Pick<ConsolidatedPrescriptionDataRefInput, 'origin'>
) {
  return typeof ref.origin === 'string' && RESERVED_OPERATIONAL_ORIGINS.has(ref.origin);
}

export type OperationalSubstitutionCompatibilityDescriptor = {
  loadType: string | null;
  movementType: string | null;
  countingType: string | null;
  category: string | null;
  muscleGroup: string | null;
};

const STRUCTURED_FIELDS = [
  ['loadType', 'tipo de carga'],
  ['movementType', 'tipo de movimento'],
  ['countingType', 'tipo de contagem'],
] as const;

const SUPPLEMENTARY_FIELDS = [
  ['category', 'categoria'],
  ['muscleGroup', 'grupo muscular'],
] as const;

export function getOperationalSubstitutionCompatibilityIssue(
  original: OperationalSubstitutionCompatibilityDescriptor | null | undefined,
  substitute: OperationalSubstitutionCompatibilityDescriptor
): string | null {
  if (!original) {
    return 'A substituição exige snapshot operacional do exercício original para validar compatibilidade';
  }

  const knownStructuredFields = STRUCTURED_FIELDS.filter(([field]) => original[field] !== null);
  if (!knownStructuredFields.length) {
    return 'A biblioteca atual não modela atributos estruturais suficientes no exercício original para validar a substituição';
  }

  for (const [field, label] of knownStructuredFields) {
    if (substitute[field] !== original[field]) {
      return `O exercício substituto é incompatível com o exercício original no atributo ${label}`;
    }
  }

  for (const [field, label] of SUPPLEMENTARY_FIELDS) {
    if (original[field] !== null && substitute[field] !== original[field]) {
      return `O exercício substituto é incompatível com o exercício original no atributo ${label}`;
    }
  }

  return null;
}
