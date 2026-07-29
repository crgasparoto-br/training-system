import {
  isPrismaRetryableTransactionError,
  retryPrismaTransactionConflict,
} from '../src/modules/pre-registration-admin/pre-registration-serializable-retry.js';

describe('pre-registration transaction retry', () => {
  it.each(['P2034', 'P2028'])('retries Prisma transaction code %s and returns success', async (code) => {
    const operation = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce({ code })
      .mockResolvedValueOnce('updated');

    await expect(retryPrismaTransactionConflict(operation, 2)).resolves.toBe('updated');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it.each([
    'write conflict or a deadlock occurred',
    'could not serialize access due to concurrent update',
    'Transaction already closed: A query cannot be executed on an expired transaction',
  ])('retries a recognized Prisma transaction message: %s', async (message) => {
    const operation = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error(message))
      .mockResolvedValueOnce('updated');

    await expect(retryPrismaTransactionConflict(operation, 2)).resolves.toBe('updated');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry unrelated errors', async () => {
    const error = Object.assign(new Error('database unavailable'), { code: 'P1001' });
    const operation = jest.fn<Promise<string>, []>().mockRejectedValue(error);

    await expect(retryPrismaTransactionConflict(operation, 2)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('rethrows the last retryable error after exhausting attempts', async () => {
    const first = { code: 'P2034', attempt: 1 };
    const last = { code: 'P2028', attempt: 2 };
    const operation = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(first)
      .mockRejectedValueOnce(last);

    await expect(retryPrismaTransactionConflict(operation, 2)).rejects.toBe(last);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(isPrismaRetryableTransactionError(last)).toBe(true);
  });

  it('rejects invalid retry configuration', async () => {
    await expect(retryPrismaTransactionConflict(async () => 'unused', 0)).rejects.toThrow(
      'maxAttempts deve ser um inteiro maior ou igual a 1'
    );
  });
});
