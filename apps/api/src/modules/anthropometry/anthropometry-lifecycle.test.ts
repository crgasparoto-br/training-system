import {
  addAnthropometryVariations,
  calculateAnthropometryVariation,
  parseAnthropometryNumber,
} from './anthropometry-lifecycle.js';

describe('anthropometry lifecycle comparisons', () => {
  it('parses persisted pt-BR and decimal values deterministically', () => {
    expect(parseAnthropometryNumber('12,5')).toBe(12.5);
    expect(parseAnthropometryNumber('1.234,5')).toBe(1234.5);
    expect(parseAnthropometryNumber('12.5')).toBe(12.5);
    expect(parseAnthropometryNumber('')).toBeNull();
  });

  it('calculates absolute and percentage variation from persisted values', () => {
    expect(calculateAnthropometryVariation('55', '50', 'cm', 'cm')).toEqual({
      absolute: 5,
      percentage: 10,
    });
  });

  it('does not convert missing values or incompatible units into zero variation', () => {
    expect(calculateAnthropometryVariation('', '50', 'cm', 'cm')).toBeNull();
    expect(calculateAnthropometryVariation('55', null, 'cm', 'cm')).toBeNull();
    expect(calculateAnthropometryVariation('55', '50', 'cm', 'mm')).toBeNull();
  });

  it('keeps percentage null when the persisted previous value is zero', () => {
    expect(calculateAnthropometryVariation('5', '0', 'cm', 'cm')).toEqual({
      absolute: 5,
      percentage: null,
    });
  });

  it('uses chronological persisted assessments while preserving the requested output order', () => {
    const newest = {
      id: 'a2',
      assessmentDate: '2026-09-02T00:00:00.000Z',
      createdAt: '2026-09-02T00:00:00.000Z',
      values: [{ segmentId: 'waist', value: '82', unit: 'cm' }],
    };
    const oldest = {
      id: 'a1',
      assessmentDate: '2026-08-02T00:00:00.000Z',
      createdAt: '2026-08-02T00:00:00.000Z',
      values: [{ segmentId: 'waist', value: '80', unit: 'cm' }],
    };

    const result = addAnthropometryVariations([newest, oldest]);
    expect(result.map((assessment) => assessment.id)).toEqual(['a2', 'a1']);
    expect(result[0].values[0].variationFromPrevious).toEqual({ absolute: 2, percentage: 2.5 });
    expect(result[1].values[0].variationFromPrevious).toBeNull();
  });
});
