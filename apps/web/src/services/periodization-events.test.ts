import { describe, expect, it } from 'vitest';
import { shouldRefreshPeriodizationMatrix } from './periodization-events';

describe('shouldRefreshPeriodizationMatrix', () => {
  it('atualiza o plano quando uma matriz é criada para ele', () => {
    expect(
      shouldRefreshPeriodizationMatrix('plan-1', null, {
        planId: 'plan-1',
        matrixId: 'matrix-new',
        source: 'matrix',
      })
    ).toBe(true);
  });

  it('atualiza o plano quando um estímulo da matriz atual é persistido', () => {
    expect(
      shouldRefreshPeriodizationMatrix('plan-1', 'matrix-1', {
        matrixId: 'matrix-1',
        source: 'cyclic',
      })
    ).toBe(true);
  });

  it('ignora mutações pertencentes a outro plano e outra matriz', () => {
    expect(
      shouldRefreshPeriodizationMatrix('plan-1', 'matrix-1', {
        planId: 'plan-2',
        matrixId: 'matrix-2',
        source: 'resisted',
      })
    ).toBe(false);
  });
});
