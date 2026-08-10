import { describe, expect, it } from 'vitest';
import {
  ADIPOMETRY_SKINFOLD_HELP,
  buildAdipometryMeasurements,
  emptyAdipometryMeasurements,
  parseAdipometryDecimal,
} from './adipometry-ui';

describe('adipometry-ui', () => {
  it('normaliza vírgula e ponto sem alterar o valor pretendido', () => {
    expect(parseAdipometryDecimal('12,5')).toBe(12.5);
    expect(parseAdipometryDecimal('12.5')).toBe(12.5);
    expect(parseAdipometryDecimal(' 12,50 ')).toBe(12.5);
  });

  it('preserva campos ausentes e aponta entradas inválidas por campo', () => {
    const values = emptyAdipometryMeasurements();
    values.weightKg = '72,4';
    values.tricepsMm = '12,3,4';

    const result = buildAdipometryMeasurements(values);

    expect(result.measurements).toEqual({ weightKg: 72.4 });
    expect(result.errors.tricepsMm).toMatch(/vírgula ou ponto/);
    expect(result.errors.weightKg).toBeUndefined();
  });

  it('mantém orientação e vídeo para as cinco dobras', () => {
    expect(ADIPOMETRY_SKINFOLD_HELP).toHaveLength(5);
    expect(new Set(ADIPOMETRY_SKINFOLD_HELP.map((item) => item.field)).size).toBe(5);
    expect(ADIPOMETRY_SKINFOLD_HELP.every((item) => item.videoUrl.startsWith('https://youtube.com/'))).toBe(true);
  });
});
