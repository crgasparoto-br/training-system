import crypto from 'node:crypto';
import type { ErrorRequestHandler } from 'express';

type ErrorWithCode = {
  name?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

const ALLOWED_ERROR_NAMES = new Set([
  'Error',
  'SyntaxError',
  'TypeError',
  'RangeError',
  'ZodError',
  'JsonWebTokenError',
  'TokenExpiredError',
  'PrismaClientKnownRequestError',
  'PrismaClientValidationError',
  'PreRegistrationPublicError',
  'PreRegistrationAdminError',
  'PreRegistrationEnrollmentError',
  'PreRegistrationInviteError',
  'HealthIntakeError',
  'ParqServiceError',
]);

const ALLOWED_ERROR_CODES = new Set([
  'P2002',
  'P2025',
  'P2034',
  'INVALID_INPUT',
  'NOT_FOUND',
  'FORBIDDEN',
  'CONCURRENT_MODIFICATION',
  'PRECONDITION_FAILED',
  'INVALID_INVITE',
  'ACTIVE_INVITE_EXISTS',
  'ACCOUNT_INCOMPATIBLE',
  'ACCOUNT_ALREADY_LINKED',
  'DUPLICATE_REVIEW_REQUIRED',
  'BLOCKING_DUPLICATE',
  'REVIEW_STALE',
  'MISSING_REQUIRED_FIELDS',
  'CONSENT_REQUIRED',
  'CONSENT_VERSION_MISMATCH',
  'BASIC_PRE_REGISTRATION_REQUIRED',
  'INCOMPLETE_RESPONSES',
  'HEALTH_INTAKE_COMPLETED',
  'PRE_REGISTRATION_COMPLETED',
]);

const PRE_REGISTRATION_PATHS = [
  /^\/api\/v1\/pre-cadastro(?:\/|$)/,
  /^\/api\/v1\/pre-registration(?:\/|$)/,
  /^\/api\/v1\/pre-registration-admin(?:\/|$)/,
  /^\/api\/v1\/alunos\/[^/]+\/pre-registration-invites(?:\/|$)/,
];

export interface SafePreRegistrationErrorLog {
  correlationId: string;
  errorName: string;
  errorCode?: string;
}

function allowedIdentifier(value: unknown, allowed: ReadonlySet<string>): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return allowed.has(normalized) ? normalized : undefined;
}

function clientStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as ErrorWithCode;
  const value = Number(candidate.statusCode ?? candidate.status);
  return Number.isInteger(value) && value >= 400 && value < 500 ? value : undefined;
}

export function isPreRegistrationRequestPath(path: string): boolean {
  const pathname = path.split('?', 1)[0] || '/';
  return PRE_REGISTRATION_PATHS.some((pattern) => pattern.test(pathname));
}

export function buildSafePreRegistrationErrorLog(
  correlationId: string,
  error: unknown
): SafePreRegistrationErrorLog {
  const candidate = error && typeof error === 'object' ? (error as ErrorWithCode) : undefined;
  const constructorName = error instanceof Error ? error.constructor.name : undefined;
  const errorName =
    allowedIdentifier(candidate?.name, ALLOWED_ERROR_NAMES) ||
    allowedIdentifier(constructorName, ALLOWED_ERROR_NAMES) ||
    'UnknownError';
  const errorCode = allowedIdentifier(candidate?.code, ALLOWED_ERROR_CODES);

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

/**
 * Last-resort boundary for parser, authentication and other middleware failures
 * that occur before a route-level handler can sanitize the error.
 */
export function createPreRegistrationUnexpectedErrorHandler(): ErrorRequestHandler {
  return (error, req, res, next) => {
    if (!isPreRegistrationRequestPath(req.originalUrl || req.path)) {
      next(error);
      return;
    }

    const correlationId = crypto.randomUUID();
    logUnexpectedPreRegistrationError(
      'Erro inesperado na fronteira HTTP da pré-matrícula',
      correlationId,
      error
    );

    const statusCode = clientStatus(error) ?? 500;
    if (statusCode < 500) {
      res.status(statusCode).json({
        error: 'PRE_REGISTRATION_REQUEST_REJECTED',
        message: 'Não foi possível processar os dados enviados. Revise as informações e tente novamente.',
      });
      return;
    }

    res.status(500).json({
      error: 'PRE_REGISTRATION_INTERNAL_ERROR',
      message: 'Não foi possível continuar.',
      correlationId,
    });
  };
}
