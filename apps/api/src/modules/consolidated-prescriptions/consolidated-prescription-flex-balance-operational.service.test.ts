import { buildOperationalProjectionItems } from './consolidated-prescription-operational.service.js';

describe('flexibility and balance operational projection', () => {
  it('maps complete flexibility parameters to WorkoutDay detailNotes and preserves the structured snapshot', () => {
    const sourceParameters = {
      articulations: [
        {
          name: 'Ombro',
          angle: 120,
          deficit: '10°',
          priority: 'high' as const,
          suggestedPrescription: '3 x 30 s',
        },
      ],
      expectedPse: 3,
    };

    const [item] = buildOperationalProjectionItems(
      [
        {
          id: 'capacity-flexibility-v1',
          capacity: 'flexibility',
          parameters: { type: 'flexibility', flexibility: sourceParameters },
        },
      ],
      new Map()
    );

    expect(item).toMatchObject({
      capacity: 'flexibility',
      compatibility: 'mapped',
      target: 'WorkoutDay',
      unsupportedParameters: [],
      proposedFields: {
        WorkoutDay: {
          detailNotes:
            'Flexibilidade — Ombro (prescrição: 3 x 30 s, ângulo: 120°, déficit: 10°, prioridade: alta). PSE esperada: 3.',
        },
      },
    });
    expect(item.sourceParameters).toEqual(sourceParameters);
  });

  it('maps complete balance parameters to WorkoutDay complementNotes and preserves the structured snapshot', () => {
    const sourceParameters = {
      focus: 'estabilidade unipodal',
      supports: ['bipodal', 'unipodal'],
      progressionNotes: 'reduzir apoio progressivamente',
      expectedPse: 2,
    };

    const [item] = buildOperationalProjectionItems(
      [
        {
          id: 'capacity-balance-v1',
          capacity: 'balance',
          parameters: { type: 'balance', balance: sourceParameters },
        },
      ],
      new Map()
    );

    expect(item).toMatchObject({
      capacity: 'balance',
      compatibility: 'mapped',
      target: 'WorkoutDay',
      unsupportedParameters: [],
      proposedFields: {
        WorkoutDay: {
          complementNotes:
            'Equilíbrio — Foco: estabilidade unipodal. Apoios: bipodal, unipodal. Progressão: reduzir apoio progressivamente. PSE esperada: 2.',
        },
      },
    });
    expect(item.sourceParameters).toEqual(sourceParameters);
  });
});
