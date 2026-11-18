import { Prisma } from '@prisma/client';

const RETRYABLE_SQLSTATES = new Set(['40P01', '40001']);
const MAX_ATTEMPTS = 3;

/** PostgreSQL deadlocks and serialization failures can safely replay a rolled-back transaction. */
export function isPostWorkoutDecisionRetryableConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  return error.code === 'P2010' &&
    typeof error.meta?.code === 'string' && RETRYABLE_SQLSTATES.has(error.meta.code);
}

export function isPostWorkoutDecisionDatabaseConflict(error: unknown): boolean {
  return isPostWorkoutDecisionRetryableConflict(error) ||
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002');
}

/** Reauthorize and replay the entire transaction, not only the failed SQL statement. */
export async function withPostWorkoutDecisionTransactionRetry<T>(
  execute: () => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await execute();
    } catch (error) {
      if (!isPostWorkoutDecisionRetryableConflict(error) || attempt === MAX_ATTEMPTS) throw error;
      await new Promise<void>(resolve => setTimeout(resolve, attempt * 20));
    }
  }
  throw new Error('Unreachable transaction retry state');
}
