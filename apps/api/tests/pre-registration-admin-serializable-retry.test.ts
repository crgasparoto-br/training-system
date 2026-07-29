import {
  isPrismaSerializableConflict,
  retryPrismaSerializableConflict,
} from '../src/modules/pre-registration-admin/pre-registration-serializable-retry.js';

describe('pre-registration serializable transaction retry', () => {
  it('retries one Prisma P2034 conflict and returns the successful result', async () => {
    const operation = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockResolvedValueOnce('updated');

    await expect(retryPrismaSerializableConflict(operation, 2)).resolves.toBe('updated');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry unrelated errors', async () => {
    const error = Object.assign(new Error('database unavailable'), { code: 'P1001' });
    const operation = jest.fn<Promise<string>, []>().mockRejectedValue(error);

    await expect(retryPrismaSerializableConflict(operation, 2)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('rethrows the last P2034 after exhausting attempts', async () => {
    const first = { code: 'P2034', attempt: 1 };
    const last = { code: 'P2034', attempt: 2 };
    const operation = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(first)
      .mockRejectedValueOnce(last);

    await expect(retryPrismaSerializableConflict(operation, 2)).rejects.toBe(last);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(isPrismaSerializableConflict(last)).toBe(true);
  });

  it('rejects invalid retry configuration', async () => {
    await expect(retryPrismaSerializableConflict(async () => 'unused', 0)).rejects.toThrow(
      'maxAttempts deve ser um inteiro maior ou igual a 1'
    );
  });
});
