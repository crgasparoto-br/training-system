type ErrorWithCode = {
  name?: unknown;
  code?: unknown;
};

export interface SafePreRegistrationErrorLog {
  correlationId: string;
  errorName: string;
  errorCode?: string;
}

export function buildSafePreRegistrationErrorLog(
  correlationId: string,
  error: unknown
): SafePreRegistrationErrorLog {
  const candidate = error && typeof error === 'object' ? (error as ErrorWithCode) : undefined;
  const errorName =
    typeof candidate?.name === 'string' && candidate.name.trim()
      ? candidate.name.trim().slice(0, 120)
      : error instanceof Error
        ? error.constructor.name.slice(0, 120)
        : 'UnknownError';
  const errorCode =
    typeof candidate?.code === 'string' && candidate.code.trim()
      ? candidate.code.trim().slice(0, 120)
      : undefined;

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
