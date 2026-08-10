import type { AdipometryProtocolDefinitionSnapshot } from '@corrida/types';
import {
  buildAdipometryProtocolPresentation,
  buildAdipometryProtocolSelectionReason,
} from './adipometry-protocol-presentation.js';

const definition = {
  population: {
    ageMinYears: 18,
    ageMaxYears: 30,
    sexCriteria: ['MALE', 'FEMALE'],
    maturationCriteria: 'adult',
  },
  precision: {
    measurementScale: 1,
    resultScale: 2,
    internalScale: 8,
    skinfoldTotalScale: 1,
  },
} as AdipometryProtocolDefinitionSnapshot;

describe('adipometry protocol presentation', () => {
  it('expõe população, motivo positivo e escalas distintas sem perder precisão', () => {
    const result = buildAdipometryProtocolPresentation(definition, {
      compatible: true,
      reasons: [],
      warnings: [],
    });

    expect(result.population).toEqual(definition.population);
    expect(result.selectionReason).toContain('18 a 30 anos');
    expect(result.selectionReason).toContain('compatível');
    expect(result.displayPrecision).toEqual({
      measurementScale: 1,
      resultScale: 2,
      skinfoldTotalScale: 1,
    });
  });

  it('não apresenta protocolo incompatível como selecionável', () => {
    const reason = buildAdipometryProtocolSelectionReason(definition, {
      compatible: false,
      reasons: [
        {
          code: 'AGE_NOT_APPLICABLE',
          field: 'assessmentDate',
          message: 'Idade fora da faixa aplicável.',
        },
      ],
      warnings: [],
    });

    expect(reason).toContain('indisponível para cálculo');
    expect(reason).toContain('Idade fora da faixa aplicável.');
  });
});
