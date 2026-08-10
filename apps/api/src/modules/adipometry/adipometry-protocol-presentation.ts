import type {
  AdipometryProtocolCompatibility,
  AdipometryProtocolDefinitionSnapshot,
} from '@corrida/types';

export function buildAdipometryProtocolSelectionReason(
  definition: AdipometryProtocolDefinitionSnapshot,
  compatibility: AdipometryProtocolCompatibility
): string {
  const ageRange = `${definition.population.ageMinYears} a ${definition.population.ageMaxYears} anos`;
  if (compatibility.compatible) {
    return `Protocolo com aprovação clínica ativa e faixa etária compatível (${ageRange}) na data da avaliação.`;
  }

  const reasons = compatibility.reasons.map((item) => item.message).join(' ');
  return `Protocolo aprovado para a população de ${ageRange}, porém indisponível para cálculo enquanto persistirem as incompatibilidades: ${reasons}`;
}

export function buildAdipometryProtocolPresentation(
  definition: AdipometryProtocolDefinitionSnapshot,
  compatibility: AdipometryProtocolCompatibility
) {
  return {
    population: definition.population,
    selectionReason: buildAdipometryProtocolSelectionReason(definition, compatibility),
    displayPrecision: {
      measurementScale: definition.precision.measurementScale,
      resultScale: definition.precision.resultScale,
      skinfoldTotalScale:
        definition.precision.skinfoldTotalScale ?? definition.precision.measurementScale,
    },
  };
}
