import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GuidedResistanceRestView } from '@corrida/types';
import { ResistanceRestPanel } from './ResistanceRestPanel';

const rest: GuidedResistanceRestView = {
  id: 'rest-1', afterPlannedSetId: 'set-1', plannedSeconds: 60,
  extensionSeconds: 0, startedAt: '2026-10-30T10:00:00.000Z',
  targetEndsAt: '2026-10-30T10:01:00.000Z', serverNow: '2026-10-30T10:00:00.000Z',
  elapsedMs: 0, remainingMs: 60_000,
};

afterEach(() => { vi.useRealTimers(); });

describe('issue #488: relógio de descanso', () => {
  it('reconstrói a contagem por timestamps após o navegador ficar em background', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(rest.serverNow));
    const onAction = vi.fn();
    render(<ResistanceRestPanel rest={rest} status="in_progress" busy={false} onAction={onAction} />);
    expect(screen.getByRole('timer')).toHaveTextContent('01:00');
    expect(screen.getByText('Intervalo prescrito').nextSibling).toHaveTextContent('60 s');
    act(() => vi.advanceTimersByTime(40_000));
    expect(screen.getByRole('timer')).toHaveTextContent('00:20');
    expect(onAction).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('finish');
    act(() => vi.advanceTimersByTime(30_000));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('compensa 40 s de resposta atrasada, inclusive após nova leitura do servidor', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T10:00:40.000Z'));
    const onAction = vi.fn();
    const { rerender } = render(
      <ResistanceRestPanel rest={rest} status="in_progress" busy={false} onAction={onAction} />,
    );
    // A server snapshot created at 10:00:00 arrives at 10:00:40.
    // Wrong implementation anchored to receipt would still show 01:00.
    expect(screen.getByRole('timer')).toHaveTextContent('00:20');
    expect(screen.getByText('Descanso transcorrido').nextSibling).toHaveTextContent('00:40');
    expect(onAction).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByRole('timer')).toHaveTextContent('00:15');

    // A delayed reconciliation must not return elapsed time to the athlete.
    rerender(<ResistanceRestPanel
      rest={{ ...rest, serverNow: '2026-10-30T10:00:42.000Z',
        elapsedMs: 42_000, remainingMs: 18_000 }}
      status="in_progress" busy={false} onAction={onAction}
    />);
    expect(screen.getByRole('timer')).toHaveTextContent('00:15');
    expect(screen.getByText('Descanso transcorrido').nextSibling).toHaveTextContent('00:45');

    act(() => vi.advanceTimersByTime(15_000));
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('finish');

    // A new GET for the same expired rest cannot submit a second finish.
    rerender(<ResistanceRestPanel
      rest={{ ...rest, serverNow: '2026-10-30T10:00:58.000Z',
        elapsedMs: 58_000, remainingMs: 2_000 }}
      status="in_progress" busy={false} onAction={onAction}
    />);
    act(() => vi.advanceTimersByTime(10_000));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('não reinicia descanso já vencido quando a resposta chega depois do prazo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T10:01:25.000Z'));
    const onAction = vi.fn();
    render(<ResistanceRestPanel rest={rest} status="in_progress" busy={false} onAction={onAction} />);
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
    expect(screen.getByText('Descanso transcorrido').nextSibling).toHaveTextContent('01:25');
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('finish');
  });

  it('não progride nem oferece ações enquanto pausa canônica está ativa', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T10:00:40.000Z'));
    const onAction = vi.fn();
    render(<ResistanceRestPanel rest={{ ...rest, elapsedMs: 25000, remainingMs: 35000 }}
      status="paused" busy={false} onAction={onAction} />);
    expect(screen.getByRole('timer')).toHaveTextContent('00:35');
    act(() => vi.advanceTimersByTime(130_000));
    expect(screen.getByRole('timer')).toHaveTextContent('00:35');
    expect(screen.getByText(/relógio congelado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+15 s' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pular descanso' })).toBeDisabled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('oferece extensão e interrupção como comandos, não escreve tempo planejado', () => {
    const onAction = vi.fn();
    render(<ResistanceRestPanel rest={{ ...rest, extensionSeconds: 15 }}
      status="in_progress" busy={false} onAction={onAction} />);
    expect(screen.getByText('Intervalo prescrito').nextSibling).toHaveTextContent('60 s');
    expect(screen.getByText('+15 s', { selector: 'dd' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+15 s' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pular descanso' }));
    expect(onAction).toHaveBeenNthCalledWith(1, 'extend_15');
    expect(onAction).toHaveBeenNthCalledWith(2, 'skip');
  });

  it('ações também são bloqueadas quando execução termina ou dados precisam reconciliar', () => {
    const onAction = vi.fn();
    const { rerender } = render(<ResistanceRestPanel rest={rest} status="partial" busy={false}
      onAction={onAction} />);
    expect(screen.getByRole('button', { name: '+15 s' })).toBeDisabled();
    rerender(<ResistanceRestPanel rest={rest} status="in_progress" busy={false}
      disabled onAction={onAction} />);
    expect(screen.getByRole('button', { name: 'Pular descanso' })).toBeDisabled();
    expect(onAction).not.toHaveBeenCalled();
  });
});
