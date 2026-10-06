// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PreWorkoutCheckInView } from '@corrida/types';
import { PreWorkoutCheckInCard } from './PreWorkoutCheckInCard';

vi.mock('../../services/api', () => ({ default: { put: vi.fn() } }));
afterEach(cleanup);

const saved: PreWorkoutCheckInView = {
  id: 'checkin-388', sessionId: 'day-388', editable: true,
  createdAt: '2026-10-05T12:00:00Z', updatedAt: '2026-10-05T12:00:00Z',
  values: { psr: 8, sleepQuality: null, fatigue: null, painLevel: null, motivation: null, availableMinutes: null, notes: 'Rascunho' },
  guidance: { painTriage: null, studentMessage: null, blocksWorkout: false, changesWorkoutAutomatically: false },
};
const conflict = (code: string) => ({ response: { status: 409, data: { success: false, error: 'Domain conflict', details: { code } } } });
const psr = () => screen.getByLabelText(/Recuperação percebida/) as HTMLInputElement;
const notes = () => screen.getByLabelText('Observação') as HTMLTextAreaElement;
const fill = () => {
  fireEvent.change(psr(), { target: { value: '8' } });
  fireEvent.change(notes(), { target: { value: 'Rascunho' } });
};
const submit = () => fireEvent.click(screen.getByRole('button', { name: /Salvar check-in|Atualizar check-in/ }));

describe('PreWorkoutCheckInCard error recovery (#388)', () => {
  it('locks a stale not_started page after canonical LOCKED, preserving the unsaved draft', async () => {
    const save = vi.fn().mockRejectedValue(conflict('PRE_WORKOUT_CHECK_IN_LOCKED'));
    const props = { audience: 'student' as const, sessionStatus: 'not_started' as const, initialCheckIn: null, save };
    const { rerender } = render(<PreWorkoutCheckInCard {...props} />);
    fill(); submit();
    await waitFor(() => expect(psr().disabled).toBe(true));
    expect(notes().disabled).toBe(true);
    expect(psr().value).toBe('8');
    expect(notes().value).toBe('Rascunho');
    expect(screen.queryByRole('button', { name: /Salvar check-in|Atualizar check-in/ })).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('somente leitura');
    expect(screen.getByText(/As alterações desta tela não foram salvas/)).toBeTruthy();
    rerender(<PreWorkoutCheckInCard {...props} />);
    expect(psr().disabled).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps idempotency conflicts editable and allocates a new key only after payload change', async () => {
    const save = vi.fn().mockRejectedValueOnce(conflict('PRE_WORKOUT_CHECK_IN_IDEMPOTENCY_CONFLICT')).mockResolvedValue(saved);
    render(<PreWorkoutCheckInCard audience="student" sessionStatus="not_started" initialCheckIn={null} save={save} />);
    fill(); submit();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Revise os dados'));
    expect(psr().disabled).toBe(false);
    expect(screen.getByRole('alert').textContent).not.toMatch(/iniciado|somente leitura/);
    const firstKey = save.mock.calls[0][0].operationKey;
    fireEvent.change(psr(), { target: { value: '9' } }); submit();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0].operationKey).not.toBe(firstKey);
  });

  it('preserves values and operationKey after a temporary failure and retries successfully', async () => {
    const save = vi.fn().mockRejectedValueOnce({ response: { status: 500 } }).mockResolvedValue(saved);
    render(<PreWorkoutCheckInCard audience="student" sessionStatus="not_started" initialCheckIn={null} save={save} />);
    fill(); submit();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Seus dados continuam nesta tela'));
    expect(psr().value).toBe('8'); expect(notes().value).toBe('Rascunho'); expect(psr().disabled).toBe(false);
    submit();
    await waitFor(() => expect(screen.getByText(/Check-in salvo/)).toBeTruthy());
    expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
  });

  it.each(['in_progress', 'completed'] as const)('does not offer editing for an initially %s session', (sessionStatus) => {
    const save = vi.fn();
    render(<PreWorkoutCheckInCard audience="student" sessionStatus={sessionStatus} initialCheckIn={saved} save={save} />);
    expect(psr().disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /check-in/ })).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('never starts two submissions while one promise is pending', async () => {
    let resolveSave!: (value: PreWorkoutCheckInView) => void;
    const save = vi.fn(() => new Promise<PreWorkoutCheckInView>((resolve) => { resolveSave = resolve; }));
    render(<PreWorkoutCheckInCard audience="student" sessionStatus="not_started" initialCheckIn={null} save={save} />);
    fill();
    const button = screen.getByRole('button', { name: 'Salvar check-in' });
    fireEvent.click(button); fireEvent.click(button);
    expect(save).toHaveBeenCalledTimes(1);
    resolveSave(saved);
    await waitFor(() => expect(screen.getByText(/Check-in salvo/)).toBeTruthy());
  });
});
