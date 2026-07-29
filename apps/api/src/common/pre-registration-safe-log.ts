import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ErrorRequestHandler, RequestHandler } from 'express';

type ErrorWithCode = {
  name?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

type PreRegistrationRequestContext = {
  correlationId: string;
  unexpectedErrorLogged: boolean;
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

const requestContext = new AsyncLocalStorage<PreRegistrationRequestContext>();
const originalConsoleError = console.error.bind(console);
let safeConsoleInstalled = false;

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

function errorCandidate(args: unknown[]): unknown {
  return [...args].reverse().find(
    (value) =>
      value instanceof Error ||
      (value && typeof value === 'object' && ('name' in value || 'code' in value))
  );
}

function isSafePreRegistrationErrorLog(value: unknown): value is SafePreRegistrationErrorLog {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => !['correlationId', 'errorName', 'errorCode'].includes(key))) return false;
  if (typeof record.correlationId !== 'string' || !record.correlationId.trim()) return false;
  if (
    record.errorName !== 'UnknownError' &&
    !allowedIdentifier(record.errorName, ALLOWED_ERROR_NAMES)
  ) {
    return false;
  }
  return (
    record.errorCode === undefined ||
    Boolean(allowedIdentifier(record.errorCode, ALLOWED_ERROR_CODES))
  );
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
 * Install once at API startup. Calls outside a pre-registration request keep the
 * existing console behavior. Calls inside the protected namespaces are reduced
 * to an allowlisted technical envelope, even when a legacy route catches the
 * exception before the global error handler.
 */
export function installPreRegistrationSafeConsoleError(): void {
  if (safeConsoleInstalled) return;
  safeConsoleInstalled = true;
  console.error = (...args: unknown[]) => {
    const context = requestContext.getStore();
    if (!context) {
      originalConsoleError(...args);
      return;
    }

    context.unexpectedErrorLogged = true;
    if (
      args.length === 2 &&
      typeof args[0] === 'string' &&
      isSafePreRegistrationErrorLog(args[1])
    ) {
      originalConsoleError(args[0], args[1]);
      return;
    }

    originalConsoleError(
      'Erro inesperado na fronteira HTTP da pré-matrícula',
      buildSafePreRegistrationErrorLog(context.correlationId, errorCandidate(args))
    );
  };
}

/**
 * Establishes a request-local correlation id and sanitizes every 5xx payload at
 * the HTTP boundary. This remains effective when an inner handler consumes the
 * exception and tries to return error.message/details directly.
 */
export function createPreRegistrationSafeBoundary(): RequestHandler {
  return (_req, res, next) => {
    const context: PreRegistrationRequestContext = {
      correlationId: crypto.randomUUID(),
      unexpectedErrorLogged: false,
    };
    const originalJson = res.json;
    res.json = ((body: unknown) => {
      if (res.statusCode >= 500) {
        return originalJson.call(res, {
          error: 'PRE_REGISTRATION_INTERNAL_ERROR',
          message: 'Não foi possível continuar.',
          correlationId: context.correlationId,
        });
      }
      return originalJson.call(res, body);
    }) as typeof res.json;
    requestContext.run(context, next);
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

    const context = requestContext.getStore();
    const correlationId = context?.correlationId || crypto.randomUUID();
    if (!context?.unexpectedErrorLogged) {
      logUnexpectedPreRegistrationError(
        'Erro inesperado na fronteira HTTP da pré-matrícula',
        correlationId,
        error
      );
      if (context) context.unexpectedErrorLogged = true;
    }

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
