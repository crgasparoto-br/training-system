import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GuidedResistanceRestView } from '@corrida/types';
import { ResistanceRestPanel, projectRestDisplay, type ResistanceRestObservation } from './ResistanceRestPanel';

const rest: GuidedResistanceRestView = {
  id: 'rest-1', afterPlannedSetId: 'set-1', plannedSeconds: 60,
  extensionSeconds: 0, startedAt: '2026-10-30T10:00:00.000Z',
  targetEndsAt: '2026-10-30T10:01:00.000Z', serverNow: '2026-10-30T10:00:00.000Z',
  elapsedMs: 0, remainingMs: 60_000,
};

// HTTP request start and response receipt are measured on the same monotonic clock.
// The server's ISO timestamp never needs to be compared with Date.now().
const observed = (roundTripMs = 0): ResistanceRestObservation => ({
  requestedAtMs: performance.now() - roundTripMs,
  receivedAtMs: performance.now(),
});

let monotonicNowMs = 100_000;
function installMonotonicFakeTimers() {
  vi.useFakeTimers();
  monotonicNowMs = 100_000;
  vi.spyOn(performance, 'now').mockImplementation(() => monotonicNowMs);
}
function advanceMonotonicTime(milliseconds: number) {
  monotonicNowMs += milliseconds;
  act(() => vi.advanceTimersByTime(milliseconds));
}
async function advanceMonotonicTimeAsync(milliseconds: number) {
  monotonicNowMs += milliseconds;
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('issue #488: relógio de descanso', () => {
  it('reconstrói a contagem por timestamps após o navegador ficar em background', () => {
    installMonotonicFakeTimers();
    vi.setSystemTime(new Date(rest.serverNow));
    const onAction = vi.fn();
    render(<ResistanceRestPanel rest={rest} observation={observed()} status="in_progress" busy={false} onAction={onAction} />);
    expect(screen.getByRole('timer')).toHaveTextContent('01:00');
    expect(screen.getByText('Intervalo prescrito').nextSibling).toHaveTextContent('60 s');
    advanceMonotonicTime(40_000);
    expect(screen.getByRole('timer')).toHaveTextContent('00:20');
    expect(onAction).not.toHaveBeenCalled();
    advanceMonotonicTime(20_000);
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('finish');
    advanceMonotonicTime(30_000);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('compensa 40 s de resposta atrasada, inclusive após nova leitura do servidor', () => {
    installMonotonicFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T10:00:40.000Z'));
    const onAction = vi.fn();
    const { rerender } = render(
      <ResistanceRestPanel rest={rest} observation={observed(40_000)} status="in_progress" busy={false} onAction={onAction} />,
    );
    // A server snapshot created at 10:00:00 arrives at 10:00:40.
    // Wrong implementation anchored to receipt would still show 01:00.
    expect(screen.getByRole('timer')).toHaveTextContent('00:20');
    expect(screen.getByText('Descanso transcorrido').nextSibling).toHaveTextContent('00:40');
    expect(onAction).not.toHaveBeenCalled();

    advanceMonotonicTime(5_000);
    expect(screen.getByRole('timer')).toHaveTextContent('00:15');

    // A delayed reconciliation must not return elapsed time to the athlete.
    rerender(<ResistanceRestPanel
      rest={{ ...rest, serverNow: '2026-10-30T10:00:42.000Z',
        elapsedMs: 42_000, remainingMs: 18_000 }}
      observation={observed(3_000)} status="in_progress" busy={false} onAction={onAction}
    />);
    expect(screen.getByRole('timer')).toHaveTextContent('00:15');
    expect(screen.getByText('Descanso transcorrido').nextSibling).toHaveTextContent('00:45');

    advanceMonotonicTime(15_000);
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('finish');

    // A new GET for the same expired rest cannot submit a second finish.
    rerender(<ResistanceRestPanel
      rest={{ ...rest, serverNow: '2026-10-30T10:00:58.000Z',
        elapsedMs: 58_000, remainingMs: 2_000 }}
      observation={observed(3_000)} status="in_progress" busy={false} onAction={onAction}
    />);
    advanceMonotonicTime(10_000);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('não reinicia descanso já vencido quando a resposta chega depois do prazo', () => {
    installMonotonicFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T10:01:25.000Z'));
    const onAction = vi.fn();
    render(<ResistanceRestPanel rest={rest} observation={observed(85_000)} status="in_progress" busy={false} onAction={onAction} />);
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
    expect(screen.getByText('Descanso transcorrido').nextSibling).toHaveTextContent('01:25');
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('finish');
  });

  it('mantém cronômetro correto com relógio civil ±5min e após mudança manual da hora', () => {
    installMonotonicFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T10:05:00.000Z'));
    const onAction = vi.fn();
    render(<ResistanceRestPanel rest={rest} observation={observed()} status="in_progress" busy={false} onAction={onAction} />);
    expect(screen.getByRole('timer')).toHaveTextContent('01:00');
    advanceMonotonicTime(40_000);
    expect(screen.getByRole('timer')).toHaveTextContent('00:20');
    // Changing the wall clock while the panel is mounted must not change its age.
    act(() => vi.setSystemTime(new Date('2026-10-30T09:55:40.000Z')));
    expect(screen.getByRole('timer')).toHaveTextContent('00:20');
    expect(onAction).not.toHaveBeenCalled();
    advanceMonotonicTime(20_000);
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('desconta latência da requisição mesmo com relógio civil desajustado', () => {
    installMonotonicFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T09:55:40.000Z'));
    const onAction = vi.fn();
    render(<ResistanceRestPanel rest={rest} observation={observed(40_000)} status="in_progress" busy={false} onAction={onAction} />);
    expect(screen.getByRole('timer')).toHaveTextContent('00:20');
    expect(screen.getByText('Descanso transcorrido').nextSibling).toHaveTextContent('00:40');
    expect(onAction).not.toHaveBeenCalled();
  });

  it('usa somente relógio monotônico e mantém a pausa congelada mesmo com resposta tardia', () => {
    const observation = { requestedAtMs: 100, receivedAtMs: 40_100 };
    expect(projectRestDisplay(rest, 'paused', observation, 240_100))
      .toMatchObject({ remainingMs: 60_000, elapsedMs: 0 });
    expect(projectRestDisplay(rest, 'in_progress', observation, 40_100))
      .toMatchObject({ remainingMs: 20_000, elapsedMs: 40_000 });
  });

  it('rearma auto-finish depois de rejeição/timeout sem duplicar requisições pendentes', async () => {
    installMonotonicFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T10:01:10.000Z'));
    let resolveFirst!: (outcome: 'retry') => void;
    const pending = new Promise<'retry'>((resolve) => { resolveFirst = resolve; });
    const onAction = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce('accepted');
    render(<ResistanceRestPanel rest={rest} observation={observed(70_000)} status="in_progress" busy={false} onAction={onAction} />);
    expect(onAction).toHaveBeenCalledTimes(1);
    await advanceMonotonicTimeAsync(3_000);
    expect(onAction).toHaveBeenCalledTimes(1); // pending request cannot duplicate
    await act(async () => { resolveFirst('retry'); await Promise.resolve(); });
    await advanceMonotonicTimeAsync(800);
    expect(onAction).toHaveBeenCalledTimes(1); // backoff before retry
    await advanceMonotonicTimeAsync(450);
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction).toHaveBeenNthCalledWith(2, 'finish');
    await advanceMonotonicTimeAsync(20_000);
    expect(onAction).toHaveBeenCalledTimes(2); // success disarms same rest
  });

  it('não progride nem oferece ações enquanto pausa canônica está ativa', () => {
    installMonotonicFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T10:00:40.000Z'));
    const onAction = vi.fn();
    render(<ResistanceRestPanel rest={{ ...rest, elapsedMs: 25000, remainingMs: 35000 }}
      observation={observed()} status="paused" busy={false} onAction={onAction} />);
    expect(screen.getByRole('timer')).toHaveTextContent('00:35');
    advanceMonotonicTime(130_000);
    expect(screen.getByRole('timer')).toHaveTextContent('00:35');
    expect(screen.getByText(/relógio congelado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+15 s' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pular descanso' })).toBeDisabled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('oferece extensão e interrupção como comandos, não escreve tempo planejado', () => {
    installMonotonicFakeTimers();
    vi.setSystemTime(new Date(rest.serverNow));
    const onAction = vi.fn();
    render(<ResistanceRestPanel rest={{ ...rest, extensionSeconds: 15 }}
      observation={observed()} status="in_progress" busy={false} onAction={onAction} />);
    expect(screen.getByText('Intervalo prescrito').nextSibling).toHaveTextContent('60 s');
    expect(screen.getByText('+15 s', { selector: 'dd' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+15 s' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pular descanso' }));
    expect(onAction).toHaveBeenNthCalledWith(1, 'extend_15');
    expect(onAction).toHaveBeenNthCalledWith(2, 'skip');
  });

  it('ações também são bloqueadas quando execução termina ou dados precisam reconciliar', () => {
    const onAction = vi.fn();
    const { rerender } = render(<ResistanceRestPanel rest={rest} observation={observed()} status="partial" busy={false}
      onAction={onAction} />);
    expect(screen.getByRole('button', { name: '+15 s' })).toBeDisabled();
    rerender(<ResistanceRestPanel rest={rest} observation={observed()} status="in_progress" busy={false}
      disabled onAction={onAction} />);
    expect(screen.getByRole('button', { name: 'Pular descanso' })).toBeDisabled();
    expect(onAction).not.toHaveBeenCalled();
  });
});
