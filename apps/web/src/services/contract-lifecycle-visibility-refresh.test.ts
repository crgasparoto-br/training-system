import { describe, expect, it } from 'vitest';
import { shouldRefreshContractLifecycleOnVisibility } from './contract-lifecycle-visibility-refresh';

describe('shouldRefreshContractLifecycleOnVisibility', () => {
  it('recarrega o ciclo contratual quando a aba volta a ficar visível', () => {
    expect(shouldRefreshContractLifecycleOnVisibility('visible')).toBe(true);
  });

  it('não recarrega enquanto a aba permanece oculta', () => {
    expect(shouldRefreshContractLifecycleOnVisibility('hidden')).toBe(false);
  });
});
