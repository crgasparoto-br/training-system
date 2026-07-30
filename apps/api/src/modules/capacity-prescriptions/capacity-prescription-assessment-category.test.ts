import {
  assessmentSourceTypeForPersistence,
  isAssessmentCategoryCompatible,
  normalizeAssessmentSourceProjection,
} from './capacity-prescription-assessment-category.js';

describe('capacity prescription assessment category compatibility', () => {
  it('preserva tipos específicos quando a categoria usa um alias canônico', () => {
    expect(isAssessmentCategoryCompatible('adipometry', 'ADIPOMETRIA')).toBe(true);
    expect(assessmentSourceTypeForPersistence('ventilometry', 'metabolic')).toBe(
      'ventilometry'
    );
  });

  it('converte categorias descritivas para physical_assessment antes da persistência', () => {
    expect(
      assessmentSourceTypeForPersistence('adipometry', 'Adipometria 7 dobras')
    ).toBe('physical_assessment');
    expect(
      assessmentSourceTypeForPersistence('flexibility_assessment', 'Flexibilidade funcional')
    ).toBe('physical_assessment');
  });

  it('mantém a mesma chave de fonte na projeção pública e na persistência', () => {
    const projected = normalizeAssessmentSourceProjection([
      {
        ref: {
          type: 'adipometry',
          id: 'assessment-1',
          label: 'Adipometria de sete dobras',
        },
        category: 'Adipometria 7 dobras',
        status: 'completed',
      },
    ]);

    expect(projected).toEqual([
      expect.objectContaining({
        ref: expect.objectContaining({
          type: 'physical_assessment',
          id: 'assessment-1',
        }),
      }),
    ]);
  });

  it('não altera fontes que não dependem da categoria da avaliação', () => {
    expect(
      assessmentSourceTypeForPersistence('prontuario_alert', 'qualquer categoria')
    ).toBe('prontuario_alert');
    expect(
      assessmentSourceTypeForPersistence('physical_assessment', 'avaliação livre')
    ).toBe('physical_assessment');
  });
});
