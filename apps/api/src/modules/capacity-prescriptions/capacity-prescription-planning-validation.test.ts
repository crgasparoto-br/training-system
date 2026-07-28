import {
  CapacityPlanningValidationError,
  normalizeCapacityPlanningParameters,
} from './capacity-prescription-planning-validation.js';

describe('capacity planning validation', () => {
  it('normaliza parâmetros internos e snapshots tipados para o contrato canônico', () => {
    expect(
      normalizeCapacityPlanningParameters({
        resisted: { sets: 3, repetitions: '8-12', expectedPse: 6 },
        cyclic: {
          type: 'cyclic',
          cyclic: {
            zoneBasis: 'heart_rate_reserve',
            zones: [{ name: 'Z2', minPercent: 60, maxPercent: 70 }],
          },
        },
      })
    ).toEqual({
      resisted: {
        type: 'resisted',
        resisted: { sets: 3, repetitions: '8-12', expectedPse: 6 },
      },
      cyclic: {
        type: 'cyclic',
        cyclic: {
          zoneBasis: 'heart_rate_reserve',
          zones: [{ name: 'Z2', minPercent: 60, maxPercent: 70 }],
        },
      },
    });
  });

  it('rejeita capacidade desconhecida e campos livres', () => {
    expect(() =>
      normalizeCapacityPlanningParameters({ invented: { enabled: true } })
    ).toThrow(CapacityPlanningValidationError);

    expect(() =>
      normalizeCapacityPlanningParameters({
        resisted: { sets: 3, hiddenSpreadsheetFormula: '=A1*B1' },
      })
    ).toThrow('Parâmetros técnicos inválidos para a capacidade resisted');
  });

  it('rejeita tipo divergente e zona cíclica inconsistente', () => {
    expect(() =>
      normalizeCapacityPlanningParameters({
        resisted: { type: 'cyclic', cyclic: { expectedPse: 5 } },
      })
    ).toThrow(CapacityPlanningValidationError);

    expect(() =>
      normalizeCapacityPlanningParameters({
        cyclic: { zones: [{ name: 'Z2', minPercent: 80, maxPercent: 60 }] },
      })
    ).toThrow(CapacityPlanningValidationError);
  });
});
