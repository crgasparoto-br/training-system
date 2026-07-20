import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmDiscardChanges, useUnsavedChangesGuard } from './useUnsavedChangesGuard';

describe('useUnsavedChangesGuard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('confirma descarte apenas quando existem alterações', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(confirmDiscardChanges(false)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(confirmDiscardChanges(true)).toBe(false);
  });

  it('bloqueia links internos quando o usuário rejeita o descarte', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderHook(() => useUnsavedChangesGuard(true));
    const anchor = document.createElement('a');
    anchor.href = '/consultas/colaboradores';
    document.body.appendChild(anchor);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    anchor.remove();
  });

  it('registra proteção contra recarga enquanto o formulário está sujo', () => {
    renderHook(() => useUnsavedChangesGuard(true));
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
