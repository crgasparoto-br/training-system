import { PARQ_CATALOG, PARQ_CATALOG_VERSION } from '@corrida/types';
import {
  ParqDomainError,
  evaluateParqResponses,
  validateParqCatalogVersion,
  validateParqResponses,
} from '../src/modules/pre-registration-public/pre-registration-parq.domain.js';

describe('canonical PAR-Q domain', () => {
  it('publishes exactly the seven canonical stable keys', () => {
    expect(PARQ_CATALOG.version).toBe(PARQ_CATALOG_VERSION);
    expect(PARQ_CATALOG.questions.map((question) => question.key)).toEqual([
      'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7',
    ]);
  });

  it('rejects legacy q8 and unknown versions', () => {
    expect(() => validateParqResponses({ q1: false, q8: false } as never, false)).toThrowError(
      expect.objectContaining<Partial<ParqDomainError>>({ code: 'INVALID_QUESTION_SET' })
    );
    expect(() => validateParqCatalogVersion('legacy-v0')).toThrowError(
      expect.objectContaining<Partial<ParqDomainError>>({ code: 'UNKNOWN_CATALOG_VERSION' })
    );
  });

  it('requires all active questions to complete', () => {
    expect(() => validateParqResponses({ q1: false }, true)).toThrowError(
      expect.objectContaining<Partial<ParqDomainError>>({ code: 'INCOMPLETE_RESPONSES' })
    );
  });

  it('calculates positive items and review state on the backend', () => {
    const result = evaluateParqResponses({
      q1: false,
      q2: true,
      q3: false,
      q4: false,
      q5: true,
      q6: false,
      q7: false,
    });
    expect(result.positiveCount).toBe(2);
    expect(result.positiveItems.map((item) => item.key)).toEqual(['q2', 'q5']);
    expect(result.status).toBe('COMPLETED_REVIEW_REQUIRED');
  });

  it('does not equate an all-negative submission with medical clearance', () => {
    const result = evaluateParqResponses({
      q1: false,
      q2: false,
      q3: false,
      q4: false,
      q5: false,
      q6: false,
      q7: false,
    });
    expect(result.status).toBe('COMPLETED_NO_ALERT');
    expect(result).not.toHaveProperty('medicallyCleared');
  });
});
