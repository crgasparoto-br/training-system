import { formatAdipometryCode } from '@corrida/types';

describe('adipometry foundation contracts', () => {
  it.each([
    [1, 'ADPT-001'],
    [9, 'ADPT-009'],
    [999, 'ADPT-999'],
    [1000, 'ADPT-1000'],
    [10000, 'ADPT-10000'],
  ])('formats sequence %i with a minimum width of three digits', (sequence, expected) => {
    expect(formatAdipometryCode(sequence)).toBe(expected);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid sequence value %s',
    (sequence) => {
      expect(() => formatAdipometryCode(sequence)).toThrow(RangeError);
    }
  );
});
