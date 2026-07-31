import { buildAdipometrySpecificationHash } from './adipometry-governance.service.js';

describe('buildAdipometrySpecificationHash', () => {
  it('is deterministic when JSON object keys arrive in another order', () => {
    const first = buildAdipometrySpecificationHash({
      code: 'GUEDES_1991_ADULT_YOUNG',
      version: 1,
      reference: 'canonical-reference',
      definitionSnapshot: {
        population: { ageMinYears: 18, ageMaxYears: 30 },
        equations: [{ output: 'bodyFatPercentage', expression: { op: 'constant', value: 1 } }],
      },
    });

    const second = buildAdipometrySpecificationHash({
      code: 'GUEDES_1991_ADULT_YOUNG',
      version: 1,
      reference: 'canonical-reference',
      definitionSnapshot: {
        equations: [{ expression: { value: 1, op: 'constant' }, output: 'bodyFatPercentage' }],
        population: { ageMaxYears: 30, ageMinYears: 18 },
      },
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when a clinically relevant field changes', () => {
    const base = {
      code: 'GUEDES_1991_ADULT_YOUNG',
      version: 1,
      reference: 'canonical-reference',
      definitionSnapshot: { population: { ageMinYears: 18, ageMaxYears: 30 } },
    };

    expect(buildAdipometrySpecificationHash(base)).not.toBe(
      buildAdipometrySpecificationHash({
        ...base,
        definitionSnapshot: { population: { ageMinYears: 18, ageMaxYears: 31 } },
      })
    );
  });
});
