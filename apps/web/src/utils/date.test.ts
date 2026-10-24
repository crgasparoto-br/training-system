import { describe, expect, it } from 'vitest';
import { parseDateOnly, resolveDateForDayOfWeek, toDateInputValue } from './date';

describe('calendar date helpers', () => {
  it('keeps an ISO midnight anchor on its civil date in every local timezone', () => {
    const anchor = '2026-09-28T00:00:00.000Z';

    expect(toDateInputValue(resolveDateForDayOfWeek(anchor, 1))).toBe('2026-09-28');
    expect(toDateInputValue(resolveDateForDayOfWeek(anchor, 5))).toBe('2026-10-02');
  });

  it('handles month and year boundaries using weekday labels, not elapsed instants', () => {
    const anchor = '2026-12-28T00:00:00.000Z';

    expect(toDateInputValue(resolveDateForDayOfWeek(anchor, 7))).toBe('2027-01-03');
  });

  it('normalizes a Date instant by its UTC civil date instead of the local timezone', () => {
    expect(toDateInputValue(new Date('2026-09-28T00:00:00.000Z'))).toBe('2026-09-28');
    expect(toDateInputValue(resolveDateForDayOfWeek(new Date('2026-09-28T00:00:00.000Z'), 7)))
      .toBe('2026-10-04');
  });

  it('rejects impossible civil dates rather than normalizing them into another day', () => {
    expect(parseDateOnly('2026-02-31')).toBeNull();
  });
});
