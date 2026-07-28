type ErrorWithCode = {
  name?: unknown;
  code?: unknown;
};

const TECHNICAL_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/;

export interface SafePreRegistrationErrorLog {
  correlationId: string;
  errorName: string;
  errorCode?: string;
}

function technicalIdentifier(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return TECHNICAL_IDENTIFIER.test(normalized) ? normalized : undefined;
}

export function buildSafePreRegistrationErrorLog(
  correlationId: string,
  error: unknown
): SafePreRegistrationErrorLog {
  const candidate = error && typeof error === 'object' ? (error as ErrorWithCode) : undefined;
  const errorName =
    technicalIdentifier(candidate?.name) ||
    (error instanceof Error ? technicalIdentifier(error.constructor.name) : undefined) ||
    'UnknownError';
  const errorCode = technicalIdentifier(candidate?.code);

  return {
    correlationId,
    errorName,
    ...(errorCode ? { errorCode } : {}),
  };
}

/**
 * Do not log the raw error, message, stack, request, token or payload here.
 * Some database/client errors interpolate user input in their message.
 */
export function logUnexpectedPreRegistrationError(
  context: string,
  correlationId: string,
  error: unknown
): void {
  console.error(context, buildSafePreRegistrationErrorLog(correlationId, error));
}
