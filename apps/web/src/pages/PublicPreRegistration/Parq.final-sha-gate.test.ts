import { describe, expect, it } from 'vitest';
import { PARQ_CATALOG } from '@corrida/types';

describe('PAR-Q frozen catalog cardinality', () => {
  it('exposes exactly seven active questions and no legacy declaration key', () => {
    const activeKeys = PARQ_CATALOG.questions
      .filter((question) => question.status === 'ACTIVE')
      .map((question) => question.key);

    expect(activeKeys).toHaveLength(7);
    expect(activeKeys).toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']);
    expect(activeKeys).not.toContain('q8');
  });
});
