import { describe, expect, it, vi } from 'vitest';
import { getPreWorkoutCheckInSaveError, getPreWorkoutCheckInSaveFailure } from './pre-workout-check-in.service';

vi.mock('./api', () => ({ default: { put: vi.fn() } }));

const failure = (status: number, code?: string, error?: unknown, message?: unknown) => ({
  response: { status, data: { success: false, error, message, details: { code } } },
});

describe('check-in save error contract (#388)', () => {
  it('only the canonical LOCKED code with HTTP 409 makes the form read-only', () => {
    expect(getPreWorkoutCheckInSaveFailure(failure(409, 'PRE_WORKOUT_CHECK_IN_LOCKED'))).toMatchObject({
      kind: 'session-locked', message: expect.stringContaining('somente leitura'),
    });
    expect(getPreWorkoutCheckInSaveFailure(failure(500, 'PRE_WORKOUT_CHECK_IN_LOCKED')).kind).toBe('temporary');
  });

  it('does not confuse an idempotency conflict with a started session', () => {
    const result = getPreWorkoutCheckInSaveFailure(failure(409, 'PRE_WORKOUT_CHECK_IN_IDEMPOTENCY_CONFLICT', 'Chave reutilizada'));
    expect(result.kind).toBe('conflict');
    expect(result.message).toContain('Revise os dados');
    expect(result.message).not.toMatch(/iniciado|somente leitura|operationKey|Chave reutilizada/);
  });

  it('uses the canonical error field before the legacy message field', () => {
    expect(getPreWorkoutCheckInSaveError(failure(400, 'PRE_WORKOUT_CHECK_IN_INVALID', '  PSR deve ser inteiro  ', 'legacy')))
      .toBe('PSR deve ser inteiro');
    expect(getPreWorkoutCheckInSaveError(failure(400, undefined, undefined, 'legacy'))).toBe('legacy');
  });

  it('keeps unknown 409 neutral instead of inventing a session transition', () => {
    expect(getPreWorkoutCheckInSaveFailure(failure(409, 'OTHER_CONFLICT')).kind).toBe('conflict');
    expect(getPreWorkoutCheckInSaveError(failure(409))).not.toMatch(/iniciado|somente leitura/);
    expect(getPreWorkoutCheckInSaveError(failure(409, undefined, 'Conflito informado pela API')))
      .toBe('Conflito informado pela API');
  });

  it.each([undefined, null, new Error('network'), { response: { status: 500, data: { error: 'secret SQL detail' } } }])(
    'keeps temporary failures recoverable and hides raw server internals', (error) => {
      const result = getPreWorkoutCheckInSaveFailure(error);
      expect(result.kind).toBe('temporary');
      expect(result.message).toContain('Seus dados continuam nesta tela');
      expect(result.message).not.toContain('secret SQL detail');
    }
  );

  it('accepts malformed or absent error details without throwing', () => {
    expect(getPreWorkoutCheckInSaveFailure({ response: { status: 409, data: { details: null, error: 42 } } }).kind)
      .toBe('conflict');
  });
});
