import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { sendError } from '@corrida/utils';
import { StudentIdentityLockTimeoutError } from './student-identity.service.js';

type ErrorLike = {
  name?: unknown;
  code?: unknown;
  message?: unknown;
  stack?: unknown;
  meta?: { target?: unknown } | null;
};

const asErrorLike = (error: unknown): ErrorLike =>
  error && typeof error === 'object' ? (error as ErrorLike) : {};

export const isDuplicateStudentEmailError = (error: unknown) => {
  const candidate = asErrorLike(error);
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  if (message === 'Email já está registrado' || message === 'Email jÃ¡ estÃ¡ registrado') {
    return true;
  }

  if (candidate.code !== 'P2002') return false;
  const target = candidate.meta?.target;
  if (Array.isArray(target)) {
    return target.some((item) => String(item).toLowerCase().includes('email'));
  }

  return String(target ?? '').toLowerCase().includes('email');
};

export const isStudentInterestServiceBusinessError = (error: unknown) => {
  const candidate = asErrorLike(error);
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return (
    message === 'Serviço selecionado não pertence ao contrato' ||
    message === 'Serviço selecionado está inativo' ||
    message === 'Selecione um serviço principal no campo Serviço de Interesse'
  );
};

export const handleKnownStudentCreationError = (
  res: Response,
  error: unknown
): Response | null => {
  const candidate = asErrorLike(error);

  if (isDuplicateStudentEmailError(error)) {
    return sendError(res, 'Email já está registrado', 409);
  }

  if (isStudentInterestServiceBusinessError(error)) {
    return sendError(res, String(candidate.message), 400);
  }

  if (error instanceof StudentIdentityLockTimeoutError) {
    return sendError(res, error.message, 409);
  }

  return null;
};

export const sendUnexpectedStudentCreationError = (
  res: Response,
  error: unknown,
  options: { stage: string; logMessage: string }
) => {
  const candidate = asErrorLike(error);
  const correlationId = randomUUID();

  console.error(options.logMessage, {
    correlationId,
    stage: options.stage,
    errorName: candidate.name,
    errorCode: candidate.code,
    message: candidate.message,
    stack: candidate.stack,
  });

  return sendError(res, 'Erro ao criar aluno', 500, {
    code: 'ALUNO_CREATE_INTERNAL_ERROR',
    correlationId,
  });
};
