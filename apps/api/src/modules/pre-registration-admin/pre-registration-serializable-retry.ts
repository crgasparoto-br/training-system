type ErrorWithCode = { code?: unknown };

export function isPrismaSerializableConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as ErrorWithCode).code === 'P2034'
  );
}

export async function retryPrismaSerializableConflict<T>(
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
      if (!isPrismaSerializableConflict(error) || attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw lastError;
}
