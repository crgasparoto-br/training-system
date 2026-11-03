import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  GuidedCyclicActionPayload, GuidedCyclicUnit, GuidedCyclicView,
} from '@corrida/types';
import { cyclicTargetText, GuidedCyclicCard } from './GuidedCyclicCard';

const first: GuidedCyclicUnit = {
  plannedStageId: 'warmup', iteration: 1, order: 1,
  kind: 'warmup', roundNumber: null, roundTotal: null,
  durationUnit: 'seconds', durationValue: 60,
  targetKind: 'heart_rate_bpm', targetValue: null, targetMin: 120, targetMax: 140,
  inclinePercent: null, cadenceSpm: null, notes: 'Comece com calma.',
};
const second: GuidedCyclicUnit = {
  ...first, plannedStageId: 'recovery', iteration: 2, order: 2,
  kind: 'recovery', durationUnit: 'meters', durationValue: 800,
  roundNumber: 2, roundTotal: 4, targetKind: null, targetMin: null, targetMax: null,
  notes: null,
};
function projection(overrides: Partial<GuidedCyclicView> = {}): GuidedCyclicView {
  return {
    sessionId: 'day-489', status: 'in_progress', version: 1,
    serverNow: '2026-11-03T12:00:00.000Z', availability: 'available',
    completed: 0, total: 2, current: first, next: second,
    currentStartedAt: null, elapsedMs: null, remainingMs: null, ...overrides,
  };
}
function setup(options: {
  load?: ReturnType<typeof vi.fn>;
  act?: ReturnType<typeof vi.fn>;
  status?: GuidedCyclicView['status'];
  version?: number;
} = {}) {
  const load = options.load ?? vi.fn().mockResolvedValue(projection());
  const act = options.act ?? vi.fn().mockResolvedValue(projection({
    version: 2, currentStartedAt: '2026-11-03T12:00:00.000Z', elapsedMs: 0, remainingMs: 60_000,
  }));
  const changed = vi.fn().mockResolvedValue(undefined);
  const component = (version: number) => <GuidedCyclicCard
    sessionId="day-489" status={options.status ?? 'in_progress'} version={version}
    load={load as (id: string) => Promise<GuidedCyclicView>}
    act={act as (id: string, data: GuidedCyclicActionPayload) => Promise<GuidedCyclicView>}
    onExecutionChanged={changed}
  />;
  const { rerender } = render(component(options.version ?? 1));
  return { load, act, changed, rerender: (version: number) => rerender(component(version)) };
}

describe('issue #489: guided cyclic web execution', () => {
  it('shows one stage, next step, round context and the released target without a synthetic result', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'Etapa por etapa' })).toBeInTheDocument();
    expect(screen.getByText('Etapa 1 de 2')).toBeInTheDocument();
    expect(screen.getByText('Aquecimento')).toBeInTheDocument();
    expect(screen.getByText('Comece com calma.')).toBeInTheDocument();
    expect(screen.getByText('Frequência cardíaca: 120 a 140 bpm')).toBeInTheDocument();
    expect(screen.getByText(/Próxima: Recuperação, rodada 2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar etapa' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Confirmar etapa' })).not.toBeInTheDocument();
  });

  it('starts using the canonical version and an idempotent operation key', async () => {
    const { act, changed } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar etapa' }));
    await waitFor(() => expect(act).toHaveBeenCalledTimes(1));
    expect(act).toHaveBeenCalledWith('day-489', expect.objectContaining({
      action: 'start', plannedStageId: 'warmup', iteration: 1, expectedVersion: 1,
      operationKey: expect.stringContaining('cyclic-'),
    }));
    expect(await screen.findByRole('timer')).toHaveTextContent('01:00');
    expect(screen.getByRole('button', { name: 'Confirmar etapa' })).toBeDisabled();
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
  });

  it('records partial duration and measured HR without changing the planned target', async () => {
    const load = vi.fn().mockResolvedValue(projection({
      version: 2, currentStartedAt: '2026-11-03T12:00:00.000Z', elapsedMs: 10_000, remainingMs: 50_000,
    }));
    const act = vi.fn().mockResolvedValue(projection({
      version: 3, completed: 1, current: second, next: null, currentStartedAt: null, remainingMs: null,
    }));
    setup({ load, act, version: 2 });
    await screen.findByRole('button', { name: 'Confirmar etapa' });
    await userEvent.selectOptions(screen.getByLabelText('Como foi a etapa?'), 'partial');
    await userEvent.type(screen.getByLabelText(/Frequência cardíaca realizado/), '137');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar etapa' }));
    await waitFor(() => expect(act).toHaveBeenCalledTimes(1));
    expect(act).toHaveBeenCalledWith('day-489', expect.objectContaining({
      action: 'complete', plannedStageId: 'warmup', iteration: 1, expectedVersion: 2,
      outcome: 'partial', values: { heartRateBpm: 137 },
    }));
    expect(await screen.findByText(/1 de 2 etapas registradas/)).toBeInTheDocument();
    expect(screen.getByText(/rodada 2 de 4/i)).toBeInTheDocument();
    expect(cyclicTargetText(first)).toContain('120 a 140');
  });

  it('requires the performed meters for a distance stage and permits a real zero target metric', async () => {
    const load = vi.fn().mockResolvedValue(projection({
      version: 5, completed: 1, current: second, next: null,
      currentStartedAt: '2026-11-03T12:00:00.000Z', elapsedMs: 350_000,
    }));
    const act = vi.fn().mockResolvedValue(projection({
      version: 6, completed: 2, current: null, next: null,
    }));
    setup({ load, act, version: 5 });
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar etapa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Confirme a distância realizada/);
    expect(act).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Distância realizada (m)'), '800');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar etapa' }));
    await waitFor(() => expect(act).toHaveBeenCalledWith('day-489', expect.objectContaining({
      outcome: 'full', values: { distanceMeters: 800 },
    })));
    expect(await screen.findByText(/Todas as etapas cíclicas foram registradas/)).toBeInTheDocument();
  });

  it('does not advance while paused and retains a server-derived frozen clock', async () => {
    setup({ status: 'paused', load: vi.fn().mockResolvedValue(projection({
      status: 'paused', version: 3,
      currentStartedAt: '2026-11-03T12:00:00.000Z', elapsedMs: 10_000, remainingMs: 50_000,
    })), version: 3 });
    expect(await screen.findByRole('timer')).toHaveTextContent('00:50');
    expect(screen.getByText(/O relógio está congelado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar etapa' })).toBeDisabled();
  });

  it('never invents guided stages for legacy training and blocks malformed progress', async () => {
    const { act } = setup({ load: vi.fn().mockResolvedValue(projection({
      availability: 'legacy_read_only', current: null, total: 0, next: null,
    })) });
    expect(await screen.findByText(/sem etapas estruturadas/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar etapa' })).not.toBeInTheDocument();
    expect(act).not.toHaveBeenCalled();
  });

  it('keeps the exact operation key on a network retry, without assuming success', async () => {
    const act = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(projection({
      version: 2, currentStartedAt: '2026-11-03T12:00:00.000Z', elapsedMs: 0, remainingMs: 60_000,
    }));
    setup({ act });
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar etapa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível confirmar/);
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar etapa' }));
    await waitFor(() => expect(act).toHaveBeenCalledTimes(2));
    expect(act.mock.calls[1][1].operationKey).toBe(act.mock.calls[0][1].operationKey);
  });

  it('reconciles a 409 with a fresh stage and does not repeat an obsolete command', async () => {
    const load = vi.fn().mockResolvedValueOnce(projection()).mockResolvedValue(projection({
      version: 2, completed: 1, current: second, next: null,
    }));
    const act = vi.fn().mockRejectedValue({ response: { status: 409 } });
    setup({ load, act });
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar etapa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/outro dispositivo/);
    expect(await screen.findByText(/1 de 2 etapas registradas/)).toBeInTheDocument();
    expect(act).toHaveBeenCalledTimes(1);
  });
});
