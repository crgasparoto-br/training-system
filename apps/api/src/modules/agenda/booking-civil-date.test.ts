import { parseBookingCivilDate } from './booking-civil-date.js';

describe('Agenda civil date proof (#403 / A-539-002)', () => {
  it.each(['UTC', 'America/Sao_Paulo', 'Pacific/Auckland'])('does not depend on the API server timezone (%s)', (tz) => {
    const before = process.env.TZ;
    try {
      process.env.TZ = tz;
      const day = parseBookingCivilDate('2026-11-10');
      expect(day.toISOString()).toBe('2026-11-10T00:00:00.000Z');
      // The legacy instant demonstrably differs from the canonical civil date in non-UTC hosts.
      if (tz === 'America/Sao_Paulo') {
        expect(new Date('2026-11-10T00:00:00').toISOString()).not.toBe(day.toISOString());
      }
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });

  it.each(['2026-02-30', '2026-13-01', '2026-11-00', 'garbage', '2026-11-10T00:00:00Z'])
    ('rejects malformed or non-canonical civil dates (%s)', (invalid) => {
      expect(() => parseBookingCivilDate(invalid)).toThrow('Data civil da agenda inválida');
    });
});
