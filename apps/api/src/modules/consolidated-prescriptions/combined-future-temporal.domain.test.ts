import {
  FutureTemporalInputError, assertFutureWindow,
  canonicalTimeZone, resolveAgendaBookingUtc,
} from './combined-future-temporal.domain.js';

const today = new Date('2026-11-06T12:00:00.000Z');
const date = (value: string) => new Date(value + 'T00:00:00.000Z');

describe('#403 future IANA local time proof', () => {
  it('resolves a known UTC appointment without inferring a clinical rule', () => {
    expect(resolveAgendaBookingUtc(date('2026-11-10'), '08:00', '09:00', 'UTC'))
      .toEqual({ status: 'verified', startAtUtc: '2026-11-10T08:00:00.000Z', endAtUtc: '2026-11-10T09:00:00.000Z' });
    expect(resolveAgendaBookingUtc(date('2026-11-10'), '08:00', '09:00', 'America/Sao_Paulo'))
      .toEqual({ status: 'verified', startAtUtc: '2026-11-10T11:00:00.000Z', endAtUtc: '2026-11-10T12:00:00.000Z' });
  });

  it('does not guess repeated local time at fall-back DST', () => {
    expect(resolveAgendaBookingUtc(date('2026-11-01'), '01:30', '02:30', 'America/New_York'))
      .toEqual({ status: 'unverified', reason: 'ambiguous_local_time' });
  });

  it('does not invent a timestamp for spring-forward clock gap', () => {
    expect(resolveAgendaBookingUtc(date('2026-03-08'), '02:30', '03:30', 'America/New_York'))
      .toEqual({ status: 'unverified', reason: 'nonexistent_local_time' });
  });

  it('rejects legacy non-midnight date, malformed intervals and timezone', () => {
    expect(resolveAgendaBookingUtc(new Date('2026-11-10T03:00:00.000Z'), '08:00', '09:00', 'UTC'))
      .toMatchObject({ status: 'unverified', reason: 'invalid_source_date' });
    expect(resolveAgendaBookingUtc(date('2026-11-10'), '09:00', '09:00', 'UTC'))
      .toMatchObject({ status: 'unverified', reason: 'invalid_local_range' });
    expect(() => canonicalTimeZone('UTC;DROP TABLE')).toThrow(FutureTemporalInputError);
  });

  it('TEMP-CURRENT/FUTURE rejects malformed dates, expired/far-future windows and accepts UTC bounds', () => {
    expect(() => assertFutureWindow('invalid', '2026-11-10T00:00:00.000Z', today)).toThrow(FutureTemporalInputError);
    expect(() => assertFutureWindow('2026-11-01T00:00:00.000Z', '2026-11-02T00:00:00.000Z', today)).toThrow(FutureTemporalInputError);
    expect(() => assertFutureWindow('2026-11-07T00:00:00.000Z', '2026-12-15T00:00:00.000Z', today)).toThrow(FutureTemporalInputError);
    expect(assertFutureWindow('2026-11-10T00:00:00.000Z', '2026-11-11T00:00:00.000Z', today).to.toISOString())
      .toBe('2026-11-11T00:00:00.000Z');
  });
});
