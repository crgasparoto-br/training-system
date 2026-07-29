export const PRE_REGISTRATION_DISABLED_EVENT = 'pre-registration-disabled';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function responseCode(payload: unknown): string | undefined {
  const record = asRecord(payload);
  const details = asRecord(record?.details);
  for (const candidate of [record?.code, details?.code, record?.error]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

export function isPreRegistrationRequestUrl(url: string): boolean {
  const normalized = url.split('?', 1)[0] || '';
  return (
    /(?:^|\/)pre-cadastro(?:\/|$)/.test(normalized) ||
    /(?:^|\/)pre-registration(?:-admin)?(?:\/|$)/.test(normalized) ||
    normalized.includes('/pre-registration-invites')
  );
}

export function isPreRegistrationDisabledResponse(
  status: number | undefined,
  payload: unknown
): boolean {
  return status === 503 && responseCode(payload) === 'PRE_REGISTRATION_DISABLED';
}

export function isPreRegistrationDisabledError(error: unknown): boolean {
  const response = asRecord(error)?.response;
  const responseRecord = asRecord(response);
  return isPreRegistrationDisabledResponse(
    typeof responseRecord?.status === 'number' ? responseRecord.status : undefined,
    responseRecord?.data
  );
}

export function dispatchPreRegistrationDisabled(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PRE_REGISTRATION_DISABLED_EVENT));
}
