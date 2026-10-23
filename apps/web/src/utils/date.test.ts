import { describe, expect, it } from 'vitest';
import { resolveDateForDayOfWeek, toDateInputValue } from './date';

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
});
