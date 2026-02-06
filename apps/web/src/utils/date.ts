const padTwo = (value: number) => String(value).padStart(2, '0');

export const parseDateOnly = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
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
      return new Date(year, month - 1, day);
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  return null;
};

export const toDateInputValue = (value: string | Date | null | undefined): string => {
  const date = parseDateOnly(value);
  if (!date) return '';
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
};

export const toIsoDateAtNoonUTC = (value: string): string => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return '';
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString();
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
