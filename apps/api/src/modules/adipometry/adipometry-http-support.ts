import { Prisma } from '@prisma/client';
import { AdipometryServiceError } from './adipometry.service.js';

const CONFLICT_CODES = [
  'ADIPOMETRY_CORRECTION_ALREADY_OPEN',
  'ADIPOMETRY_INVALID_CORRECTION_TARGET',
  'ADIPOMETRY_CORRECTION_NO_CHANGES',
  'ADIPOMETRY_CORRECTION_STATE_INVALID',
  'ADIPOMETRY_FINALIZED_IMMUTABLE',
  'ADIPOMETRY_PROTOCOL_APPROVAL_REVOKED',
  'ADIPOMETRY_PROTOCOL_APPROVAL_NOT_ACTIVE',
  'ADIPOMETRY_PROTOCOL_CHANGE_CONFIRMATION_REQUIRED',
  'ADIPOMETRY_CAPACITY_WARNING_CONFIRMATION_REQUIRED',
] as const;

const VALIDATION_CODES = [
  'ADIPOMETRY_CORRECTION_METADATA_REQUIRED',
  'ADIPOMETRY_INVALID_PROTOCOL_SEX_DECISION',
  'ADIPOMETRY_INVALID_CALCULATION_SNAPSHOT',
] as const;

function persistenceMessage(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = error.meta as Record<string, unknown> | undefined;
    return [meta?.message, meta?.database_error, error.message]
      .filter((value): value is string => typeof value === 'string')
      .join(' ');
  }
  if (error instanceof Error) return error.message;
  return '';
}

/**
 * Converts PostgreSQL/Prisma implementation details into the stable public
 * contract used by the ADPT routes. The returned error never includes the raw
 * database message.
 */
export function mapAdipometryPersistenceError(error: unknown): AdipometryServiceError | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
    return new AdipometryServiceError(
      'A operação concorreu com outra alteração. Recarregue e tente novamente.',
      'ADIPOMETRY_CONCURRENT_OPERATION',
      409
    );
  }

  const message = persistenceMessage(error);
  for (const code of CONFLICT_CODES) {
    if (message.includes(code)) {
      return new AdipometryServiceError(
        'A operação conflita com o estado atual da avaliação.',
        code,
        409
      );
    }
  }
  for (const code of VALIDATION_CODES) {
    if (message.includes(code)) {
      return new AdipometryServiceError(
        'Os dados informados não atendem às regras da adipometria.',
        code,
        400
      );
    }
  }
  if (
    message.includes('ADIPOMETRY_ACTOR_CROSS_TENANT_OR_INACTIVE')
    || message.includes('ADIPOMETRY_RESPONSIBLE_NOT_AVAILABLE')
  ) {
    return new AdipometryServiceError(
      'Avaliação não encontrada.',
      'ADIPOMETRY_RESOURCE_NOT_FOUND',
      404
    );
  }

  // Prisma wraps PostgreSQL trigger failures that have no stable client code
  // as UnknownRequestError. Emit the original server-side text only in the
  // disposable test environment so the integrated verifier can identify the
  // violated invariant. Public HTTP responses remain generic and correlated.
  if (process.env.NODE_ENV === 'test' && message) {
    console.error('ADIPOMETRY_PERSISTENCE_DIAGNOSTIC', {
      errorType: error instanceof Error ? error.name : typeof error,
      message,
    });
  }
  return null;
}
