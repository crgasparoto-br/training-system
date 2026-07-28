import crypto from 'node:crypto';
import type { ErrorRequestHandler } from 'express';

type ErrorWithCode = {
  name?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

const TECHNICAL_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/;
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

function technicalIdentifier(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return TECHNICAL_IDENTIFIER.test(normalized) ? normalized : undefined;
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
