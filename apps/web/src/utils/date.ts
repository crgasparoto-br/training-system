const padTwo = (value: number) => String(value).padStart(2, '0');
const civilDates = new WeakSet<Date>();

const markCivilDate = (date: Date): Date => {
  civilDates.add(date);
  return date;
};

const isMarkedCivilDate = (date: Date): boolean => civilDates.has(date);

const fromCivilParts = (year: number, month: number, day: number): Date | null => {
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }
  return markCivilDate(date);
};

export const parseDateOnly = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const isoDate = value.toISOString().slice(0, 10);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
    return match
      ? fromCivilParts(Number(match[1]), Number(match[2]), Number(match[3]))
      : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const datePart = trimmed.split('T')[0];
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      return fromCivilParts(year, month, day);
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    const isoDate = parsed.toISOString().slice(0, 10);
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
    return isoMatch
      ? fromCivilParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))
      : null;
  }

  return null;
};

export const toDateInputValue = (value: string | Date | null | undefined): string => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    if (isMarkedCivilDate(value)) {
      return `${value.getFullYear()}-${padTwo(value.getMonth() + 1)}-${padTwo(value.getDate())}`;
    }
    return value.toISOString().slice(0, 10);
  }
  const date = parseDateOnly(value);
  if (!date) return '';
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
};

export const toIsoDateAtNoonUTC = (value: string): string => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return '';
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString();
};

/** Resolve a weekday from a calendar week anchor without interpreting an ISO
 * midnight as a local instant. The returned Date is local-calendar based and
 * can safely be serialized with toDateInputValue/toIsoDateAtNoonUTC. */
export const resolveDateForDayOfWeek = (
  weekStartDate: string | Date | null | undefined,
  dayOfWeek: number
): Date | null => {
  const start = parseDateOnly(weekStartDate);
  if (!start || !Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) return null;
  const jsDay = start.getDay();
  const startWeekday = jsDay === 0 ? 7 : jsDay;
  const result = new Date(start);
  result.setDate(start.getDate() + dayOfWeek - startWeekday);
  return markCivilDate(result);
};

export const formatDateBR = (value: string | Date | null | undefined): string => {
  const date = parseDateOnly(value);
  if (!date) return '';
  return `${padTwo(date.getDate())}/${padTwo(date.getMonth() + 1)}/${date.getFullYear()}`;
};

export const getDateRangeBounds = (
  start: string | Date | null | undefined,
  end: string | Date | null | undefined
) => {
  const startDate = parseDateOnly(start);
  const endDate = parseDateOnly(end);

  const startOfDay = startDate
    ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0)
    : null;
  const endOfDay = endDate
    ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999)
    : null;

  return { startOfDay, endOfDay };
};

export const isDateWithinRange = (
  date: Date,
  start: string | Date | null | undefined,
  end: string | Date | null | undefined
) => {
  const { startOfDay, endOfDay } = getDateRangeBounds(start, end);
  if (!startOfDay || !endOfDay) return false;
  return date >= startOfDay && date <= endOfDay;
};
