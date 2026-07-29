type ErrorWithDiagnostics = {
  code?: unknown;
  message?: unknown;
};

const RETRYABLE_PRISMA_CODES = new Set(['P2034', 'P2028']);
const RETRYABLE_MESSAGE_FRAGMENTS = [
  'write conflict',
  'deadlock',
  'could not serialize access',
  'serialization failure',
  'transaction already closed',
  'expired transaction',
];

export function isPrismaRetryableTransactionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const diagnostic = error as ErrorWithDiagnostics;
  if (typeof diagnostic.code === 'string' && RETRYABLE_PRISMA_CODES.has(diagnostic.code)) {
    return true;
  }
  const message = typeof diagnostic.message === 'string' ? diagnostic.message.toLowerCase() : '';
  return RETRYABLE_MESSAGE_FRAGMENTS.some((fragment) => message.includes(fragment));
}

export async function retryPrismaTransactionConflict<T>(
  operation: () => Promise<T>,
  maxAttempts = 2
): Promise<T> {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('maxAttempts deve ser um inteiro maior ou igual a 1');
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isPrismaRetryableTransactionError(error) || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 10));
    }
  }

  throw lastError;
}
