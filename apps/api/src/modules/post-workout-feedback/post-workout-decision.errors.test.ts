import { Prisma } from '@prisma/client';
import {
  isPostWorkoutDecisionDatabaseConflict, isPostWorkoutDecisionRetryableConflict,
  withPostWorkoutDecisionTransactionRetry,
} from './post-workout-decision.errors.js';

const dbError = (code: string, sqlstate?: string) =>
  new Prisma.PrismaClientKnownRequestError('Database conflict', {
    code, clientVersion: '5.22.0', ...(sqlstate ? { meta: { code: sqlstate } } : {}),
  });

describe('issue #406 database transaction contention and HTTP conflict classification', () => {
  it.each([
    ['P2010', '40P01', true], ['P2010', '40001', true],
    ['P2034', undefined, true], ['P2010', '23514', false],
    ['P2002', undefined, false], ['P2010', undefined, false],
  ])('classifies %s / %s retryable=%s', (code, sqlstate, expected) => {
    expect(isPostWorkoutDecisionRetryableConflict(dbError(code, sqlstate))).toBe(expected);
  });

  it('maps exhausted SQL deadlocks and unique conflicts to HTTP 409, not generic 500', () => {
    for (const error of [dbError('P2010','40P01'),dbError('P2010','40001'),dbError('P2034'),dbError('P2002')]) {
      expect(isPostWorkoutDecisionDatabaseConflict(error)).toBe(true);
    }
    expect(isPostWorkoutDecisionDatabaseConflict(dbError('P2010','23514'))).toBe(false);
    expect(isPostWorkoutDecisionDatabaseConflict(new Error('deadlock text'))).toBe(false);
  });

  it('retries a rolled-back transaction and returns one successful logical outcome', async () => {
    let attempts = 0;
    const result = await withPostWorkoutDecisionTransactionRetry(async () => {
      attempts++;
      if (attempts < 3) throw dbError('P2010','40P01');
      return { version: 2, eventCount: 1 };
    });
    expect(result).toEqual({ version: 2, eventCount: 1 });
    expect(attempts).toBe(3);
  });

  it('stops after bounded retries and never retries non-transient errors', async () => {
    let attempts = 0;
    await expect(withPostWorkoutDecisionTransactionRetry(async () => {
      attempts++;
      throw dbError('P2010','40P01');
    })).rejects.toMatchObject({ code: 'P2010' });
    expect(attempts).toBe(3);
    attempts = 0;
    await expect(withPostWorkoutDecisionTransactionRetry(async () => {
      attempts++;
      throw dbError('P2002');
    })).rejects.toMatchObject({ code: 'P2002' });
    expect(attempts).toBe(1);
  });
});
