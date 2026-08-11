import {
  getOperationalSubstitutionCompatibilityIssue,
  hasReservedOperationalOrigin,
  OPERATIONAL_MAPPING_REQUIRED_BLOCKS,
} from './consolidated-prescription-operational-integrity.js';

const descriptor = (overrides: Partial<{
  loadType: string | null;
  movementType: string | null;
  countingType: string | null;
  category: string | null;
  muscleGroup: string | null;
}> = {}) => ({
  loadType: 'external_load',
  movementType: 'resistance',
  countingType: 'repetitions',
  category: 'resisted',
  muscleGroup: 'quadriceps',
  ...overrides,
});

describe('operational integration integrity controls', () => {
  it.each([
    'consolidated_operational_projection_v1',
    'consolidated_exercise_substitution_v1',
  ])('treats reserved origin %s as server-owned regardless of client sourceType', (origin) => {
    expect(
      hasReservedOperationalOrigin({
        origin,
      })
    ).toBe(true);
  });

  it('does not reserve ordinary client origins', () => {
    expect(hasReservedOperationalOrigin({ origin: 'prontuario_goal' })).toBe(false);
  });

  it('requires global catalog permission in addition to assembly management for mappings', () => {
    expect(OPERATIONAL_MAPPING_REQUIRED_BLOCKS).toEqual([
      'plans.consolidatedPrescriptions.manage',
      'settings.parameters.capacityPrescriptions',
    ]);
  });

  it('accepts a substitute with the same modeled structural attributes', () => {
    expect(getOperationalSubstitutionCompatibilityIssue(descriptor(), descriptor())).toBeNull();
  });

  it('rejects a substitute with a different modeled movement type', () => {
    expect(
      getOperationalSubstitutionCompatibilityIssue(
        descriptor(),
        descriptor({ movementType: 'cyclic' })
      )
    ).toContain('tipo de movimento');
  });

  it('rejects a substitute when the original has no structured compatibility attributes', () => {
    expect(
      getOperationalSubstitutionCompatibilityIssue(
        descriptor({ loadType: null, movementType: null, countingType: null }),
        descriptor()
      )
    ).toContain('atributos estruturais suficientes');
  });

  it('does not use matching name/text and rejects a supplementary mismatch after structural checks', () => {
    expect(
      getOperationalSubstitutionCompatibilityIssue(
        descriptor(),
        descriptor({ muscleGroup: 'hamstrings' })
      )
    ).toContain('grupo muscular');
  });
});
