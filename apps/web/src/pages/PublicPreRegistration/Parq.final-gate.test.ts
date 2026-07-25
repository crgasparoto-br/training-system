import { describe, expect, it } from 'vitest';
import { PARQ_CATALOG, PARQ_CATALOG_VERSION } from '@corrida/types';

describe('PAR-Q final shared-contract gate', () => {
  it('keeps the public flow on the canonical seven-question catalog', () => {
    expect(PARQ_CATALOG.version).toBe(PARQ_CATALOG_VERSION);
    expect(PARQ_CATALOG.questions.map((question) => question.key)).toEqual([
      'q1',
      'q2',
      'q3',
      'q4',
      'q5',
      'q6',
      'q7',
    ]);
    expect(PARQ_CATALOG.questions.some((question) => question.key === ('q8' as never))).toBe(false);
  });
});
