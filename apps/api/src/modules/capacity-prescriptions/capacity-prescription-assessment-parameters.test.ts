import { mergeFlexibilityArticulationsFromAssessments } from './capacity-prescription-assessment-parameters.js';

describe('capacity assessment parameter derivation', () => {
  it('deriva ângulos de ombro e dedos a partir das medições selecionadas', () => {
    const result = mergeFlexibilityArticulationsFromAssessments([
      {
        measurements: [
          {
            metricKey: 'flexao_ombro_angulo',
            metricLabel: 'Flexão de ombro',
            valueNumber: 142,
          },
          {
            metricKey: 'extensao_dedos_angulo',
            metricLabel: 'Extensão dos dedos',
            valueText: '37,5',
          },
          {
            metricKey: 'forca_ombro',
            metricLabel: 'Força do ombro',
            valueNumber: 80,
            unit: 'kgf',
          },
        ],
      },
    ]);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Ombro', angle: 142, priority: 'medium' }),
        expect.objectContaining({ name: 'Dedos', angle: 37.5, priority: 'medium' }),
      ])
    );
    expect(result).toHaveLength(2);
  });

  it('preserva o valor revisado pelo professor e preenche somente ângulos vazios', () => {
    const result = mergeFlexibilityArticulationsFromAssessments(
      [
        {
          measurements: [
            { metricKey: 'ombro_angulo', valueNumber: 130 },
            { metricKey: 'joelho_angulo', valueNumber: 115 },
          ],
        },
      ],
      [
        { name: 'Ombro', angle: 150, priority: 'high', deficit: 'revisado' },
        { name: 'Joelho', angle: null, priority: 'low' },
      ]
    );

    expect(result).toEqual([
      { name: 'Ombro', angle: 150, priority: 'high', deficit: 'revisado' },
      { name: 'Joelho', angle: 115, priority: 'low' },
    ]);
  });

  it('usa a regra angular compartilhada e rejeita força, dor, carga, percentual e comprimento', () => {
    const result = mergeFlexibilityArticulationsFromAssessments([
      {
        measurements: [
          { metricKey: 'forca_ombro', valueNumber: 80, unit: 'kgf' },
          { metricKey: 'dor_joelho', valueNumber: 7 },
          { metricKey: 'carga_quadril', valueNumber: 45, unit: 'kg' },
          { metricKey: 'deficit_quadril', valueNumber: 12, unit: '%' },
          { metricKey: 'circunferencia_tornozelo', valueNumber: 24, unit: 'cm' },
          { metricKey: 'mobilidade_punho_percentual', valueNumber: 80, unit: '%' },
          { metricKey: 'amplitude_cotovelo', valueNumber: 120 },
          { metricKey: 'extensao_dedos', valueText: '37,5', unit: '°' },
        ],
      },
    ]);

    expect(result).toEqual([
      { name: 'Cotovelo', angle: 120, priority: 'medium' },
      { name: 'Dedos', angle: 37.5, priority: 'medium' },
    ]);
  });
});
