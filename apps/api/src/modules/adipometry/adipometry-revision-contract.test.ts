import { formatAdipometryRevisionLabel } from '@corrida/types';

describe('adipometry revision contract', () => {
  it('formats revisions without imposing an artificial upper bound', () => {
    expect(formatAdipometryRevisionLabel(1)).toBe('R1');
    expect(formatAdipometryRevisionLabel(1000)).toBe('R1000');
  });

  it('rejects invalid revision identities', () => {
    expect(() => formatAdipometryRevisionLabel(0)).toThrow(RangeError);
    expect(() => formatAdipometryRevisionLabel(1.5)).toThrow(RangeError);
  });
});
