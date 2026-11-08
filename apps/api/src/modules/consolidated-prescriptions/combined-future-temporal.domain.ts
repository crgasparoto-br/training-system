/** #403: canonical civil appointment times are not UTC instants until an IANA zone resolves uniquely. */
export type TemporalProofIssue =
  | 'invalid_source_date'
  | 'invalid_local_range'
  | 'nonexistent_local_time'
  | 'ambiguous_local_time';

export type TemporalResolution =
  | { status: 'verified'; startAtUtc: string; endAtUtc: string }
  | { status: 'unverified'; reason: TemporalProofIssue };

export class FutureTemporalInputError extends Error {
  constructor(message: string) { super(message); this.name = 'FutureTemporalInputError'; }
}

const DAY_MS = 86_400_000;
const FUTURE_HORIZON_MS = 31 * DAY_MS;
// Client/server clock skew affects only the start, never the horizon end.
const START_CLOCK_SKEW_MS = 5 * 60_000;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/u;

export function parseCanonicalUtc(value: string): Date {
  const date = new Date(value);
  if (!UTC_TIMESTAMP.test(value) || !Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new FutureTemporalInputError('Use um instante ISO UTC canônico.');
  }
  return date;
}

export function assertFutureWindow(start: string, end: string, now: Date) {
  const from = parseCanonicalUtc(start);
  const to = parseCanonicalUtc(end);
  if (to <= from || to <= now ||
      from.getTime() < now.getTime() - START_CLOCK_SKEW_MS ||
      to.getTime() > now.getTime() + FUTURE_HORIZON_MS ||
      to.getTime() - from.getTime() > FUTURE_HORIZON_MS) {
    throw new FutureTemporalInputError('A janela deve conter um período futuro de até 31 dias.');
  }
  return { from, to };
}

export function canonicalTimeZone(value: string) {
  if (typeof value !== 'string' || value.length > 90 || !/^[A-Za-z0-9_+\-/]+$/u.test(value)) {
    throw new FutureTemporalInputError('Informe um fuso IANA válido.');
  }
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    throw new FutureTemporalInputError('Fuso IANA não reconhecido.');
  }
}

function calendarDate(date: Date | null) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(10) !== 'T00:00:00.000Z') return null;
  return date.toISOString().slice(0, 10);
}

function utcPossibilities(civilDate: string, time: string, formatter: Intl.DateTimeFormat): Date[] {
  const hhmm = HHMM.exec(time);
  if (!hhmm) return [];
  const [y, m, d] = civilDate.split('-').map(Number);
  if (!y || !m || !d || new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) !== civilDate) return [];
  const naive = Date.UTC(y, m - 1, d, Number(hhmm[1]), Number(hhmm[2]));
  const found: Date[] = [];
  // Full IANA offset envelope (15-minute steps): detects nonexistent and duplicated wall times.
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const candidate = new Date(naive - offsetMinutes * 60_000);
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map(({ type, value }) => [type, value]));
    if (parts.year === String(y).padStart(4, '0') &&
        parts.month === String(m).padStart(2, '0') &&
        parts.day === String(d).padStart(2, '0') &&
        parts.hour === hhmm[1] && parts.minute === hhmm[2]) found.push(candidate);
  }
  return found;
}

/** Booking supplies the civil date & clock; zone is an explicit preview assumption, never inferred from address. */
export function resolveAgendaBookingUtc(
  bookingCivilDate: Date | null, startTime: string, endTime: string, timeZone: string
): TemporalResolution {
  const day = calendarDate(bookingCivilDate);
  if (!day) return { status: 'unverified', reason: 'invalid_source_date' };
  const start = HHMM.exec(startTime), end = HHMM.exec(endTime);
  if (!start || !end || startTime >= endTime) {
    return { status: 'unverified', reason: 'invalid_local_range' };
  }
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: canonicalTimeZone(timeZone),
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const starts = utcPossibilities(day, startTime, formatter);
  const ends = utcPossibilities(day, endTime, formatter);
  if (starts.length !== 1 || ends.length !== 1) {
    return { status: 'unverified', reason: starts.length > 1 || ends.length > 1
      ? 'ambiguous_local_time' : 'nonexistent_local_time' };
  }
  if (ends[0] <= starts[0]) return { status: 'unverified', reason: 'invalid_local_range' };
  return { status: 'verified', startAtUtc: starts[0].toISOString(), endAtUtc: ends[0].toISOString() };
}
