import {
  ADIPOMETRY_FORMULA_VERSION,
  calculateAdipometryComposition,
} from './capacity-prescription-formulas.js';

describe('capacity prescription formulas', () => {
  it('identifica explicitamente o protocolo de Guedes com conversão de Siri', () => {
    expect(ADIPOMETRY_FORMULA_VERSION).toBe('guedes-three-fold-siri-v1');
  });

  it('reproduz a composição masculina da planilha com versão explícita', () => {
    const result = calculateAdipometryComposition({
      sex: 'male',
      weightKg: 80,
      skinfoldsMm: {
        triceps: 10,
        subscapular: 15,
        suprailiac: 20,
        abdominal: 25,
        thigh: 30,
      },
    });

    const expectedDensity = 1.17136 - 0.06706 * Math.log10(55);
    const expectedBodyFat = (4.95 / expectedDensity - 4.5) * 100;

    expect(result.formulaVersion).toBe(ADIPOMETRY_FORMULA_VERSION);
    expect(result.densitySkinfoldSumMm).toBe(55);
    expect(result.totalSkinfoldsMm).toBe(100);
    expect(result.bodyDensity).toBeCloseTo(expectedDensity, 10);
    expect(result.bodyFatPercentage).toBeCloseTo(expectedBodyFat, 10);
    expect(result.fatMassKg).toBeCloseTo((expectedBodyFat * 80) / 100, 10);
    expect(result.leanMassKg).toBeCloseTo(80 - (expectedBodyFat * 80) / 100, 10);
  });

  it('usa as três dobras femininas definidas pela planilha', () => {
    const result = calculateAdipometryComposition({
      sex: 'female',
      weightKg: 60,
      skinfoldsMm: {
        triceps: 8,
        subscapular: 12,
        suprailiac: 18,
        abdominal: 20,
        thigh: 22,
      },
    });

    const expectedDensity = 1.1665 - 0.07063 * Math.log10(52);
    expect(result.densitySkinfoldSumMm).toBe(52);
    expect(result.bodyDensity).toBeCloseTo(expectedDensity, 10);
  });

  it('rejeita peso e dobras ausentes ou inválidas', () => {
    expect(() =>
      calculateAdipometryComposition({
        sex: 'male',
        weightKg: 0,
        skinfoldsMm: { triceps: 10, suprailiac: 10, abdominal: 10 },
      })
    ).toThrow('Peso deve ser maior que zero');

    expect(() =>
      calculateAdipometryComposition({
        sex: 'female',
        weightKg: 60,
        skinfoldsMm: { subscapular: 10, suprailiac: 10 },
      })
    ).toThrow('Ao menos três dobras cutâneas devem ser informadas');
  });
});
