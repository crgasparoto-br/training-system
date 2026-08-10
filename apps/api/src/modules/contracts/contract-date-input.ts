const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

export const DEFAULT_CONTRACT_TIME_ZONE = 'America/Sao_Paulo';

const datePartsInTimeZone = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
};

export const dateOnlyAtStartOfDayInTimeZone = (
  value: string,
  timeZone = DEFAULT_CONTRACT_TIME_ZONE
) => {
  const match = DATE_ONLY_PATTERN.exec(value.trim());
  if (!match) throw new Error('Data de contrato inválida');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const canonical = new Date(Date.UTC(year, month - 1, day));
  if (
    canonical.getUTCFullYear() !== year
    || canonical.getUTCMonth() !== month - 1
    || canonical.getUTCDate() !== day
  ) {
    throw new Error('Data de contrato inválida');
  }

  const desiredWallClock = Date.UTC(year, month - 1, day, 0, 0, 0);
  let utcInstant = desiredWallClock;

  // Resolve the timezone offset without depending on the process timezone.
  // Two passes cover offset changes around timezone transitions.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = datePartsInTimeZone(new Date(utcInstant), timeZone);
    const representedWallClock = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    utcInstant = desiredWallClock - (representedWallClock - utcInstant);
  }

  return new Date(utcInstant);
};

export const normalizeContractDateInput = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  if (!DATE_ONLY_PATTERN.test(normalized)) return value;
  return dateOnlyAtStartOfDayInTimeZone(normalized).toISOString();
};

export const normalizeContractDateFields = (body: unknown) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const normalized = { ...(body as Record<string, unknown>) };
  for (const field of ['dataInicio', 'dataAssinatura'] as const) {
    if (field in normalized) normalized[field] = normalizeContractDateInput(normalized[field]);
  }
  return normalized;
};
