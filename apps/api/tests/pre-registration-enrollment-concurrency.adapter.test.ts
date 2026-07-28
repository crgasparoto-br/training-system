import {
  isEnrollmentConcurrencyError,
  translateEnrollmentConcurrencyError,
} from '../src/modules/pre-registration-enrollment/pre-registration-enrollment-concurrency.adapter.js';
import { PreRegistrationEnrollmentError } from '../src/modules/pre-registration-enrollment/pre-registration-enrollment.service.js';

describe('issue 274 enrollment concurrency adapter', () => {
  it.each([
    [{ code: 'P2034', message: 'Transaction failed due to a write conflict' }],
    [{ code: 'P2010', meta: { code: '40001' } }],
    [{ meta: { sqlState: '40001' } }],
    [{ message: 'could not serialize access due to concurrent update' }],
    [{ message: 'deadlock detected while updating the enrollment record' }],
  ])('recognizes database concurrency failures without exposing their message', (error) => {
    expect(isEnrollmentConcurrencyError(error)).toBe(true);
    expect(() => translateEnrollmentConcurrencyError(error)).toThrow(
      expect.objectContaining({
        code: 'CONCURRENT_MODIFICATION',
        message: 'Os dados foram alterados por outra operação. Recarregue e refaça a revisão antes de continuar.',
      })
    );
  });

  it('does not rewrite unrelated failures', () => {
    const original = new Error('falha não relacionada');
    expect(isEnrollmentConcurrencyError(original)).toBe(false);
    expect(() => translateEnrollmentConcurrencyError(original)).toThrow(original);
  });

  it('preserves an existing enrollment domain error', () => {
    const original = new PreRegistrationEnrollmentError(
      'A revisão está desatualizada.',
      'REVIEW_STALE'
    );
    expect(() => translateEnrollmentConcurrencyError(original)).toThrow(original);
  });
});
