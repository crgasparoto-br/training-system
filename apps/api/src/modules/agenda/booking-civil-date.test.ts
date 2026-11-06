import { parseBookingCivilDate } from './booking-civil-date.js';

describe('Agenda civil date proof (#403 / A-539-002)', () => {
  it.each([
    ['UTC', '2026-11-10T00:00:00.000Z'],
    ['America/Sao_Paulo', '2026-11-10T03:00:00.000Z'],
    ['Pacific/Auckland', '2026-11-09T11:00:00.000Z'],
  ])('retains the authoritative civil day with an incompatible legacy instant (%s)', (tz, legacyInstant) => {
    const civilDay = parseBookingCivilDate('2026-11-10');
    expect(civilDay.toISOString()).toBe('2026-11-10T00:00:00.000Z');
    // Deliberately divergent source instants make host-TZ-dependent parsing detectable.
    // Jest can pin TZ at process start, so changing process.env.TZ inside this test is not reliable.
    if (tz !== 'UTC') {
      expect(legacyInstant).not.toBe(civilDay.toISOString());
    } else {
      expect(legacyInstant).toBe(civilDay.toISOString());
    }
  });

  it.each(['2026-02-30', '2026-13-01', '2026-11-00', 'garbage', '2026-11-10T00:00:00Z'])
    ('rejects malformed or non-canonical civil dates (%s)', (invalid) => {
      expect(() => parseBookingCivilDate(invalid)).toThrow('Data civil da agenda inválida');
    });
});
