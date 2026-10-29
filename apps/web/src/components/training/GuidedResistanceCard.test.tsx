import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GuidedResistanceCompletePayload, GuidedResistanceView } from '@corrida/types';
import { GuidedResistanceCard } from './GuidedResistanceCard';

const first = {
  plannedUnitId: 'exercise-a', plannedSetId: 'set-1', setNumber: 1,
  exerciseName: 'Agachamento', videoUrl: null, section: 'sessao', blockKind: 'principal',
  blockPosition: 1, setPosition: 1, exerciseSetTotal: 2,
  groupId: null, groupType: null, groupPosition: null, groupSize: null, roundNumber: null, roundTotal: null,
  repsMin: 8, repsMax: 12, loadKg: 47, loadPercent: null,
  rir: 2, rpe: 8, tempo: '3-1-1', restSec: 60, notes: 'Controle a descida',
};
const second = { ...first, plannedSetId: 'set-2', setNumber: 2, setPosition: 2 };
function projection(overrides: Partial<GuidedResistanceView> = {}): GuidedResistanceView {
  return {
    sessionId: 'day-1', status: 'in_progress', version: 1, availability: 'available',
    completed: 0, total: 2, current: first, next: second,
    ...overrides,
  };
}
const panel = (options: {
  load?: ReturnType<typeof vi.fn>;
  complete?: ReturnType<typeof vi.fn>;
  status?: GuidedResistanceView['status'];
} = {}) => {
  const load = options.load ?? vi.fn().mockResolvedValue(projection());
  const complete = options.complete ?? vi.fn().mockResolvedValue(projection({
    version: 2, completed: 1, current: second, next: null,
  }));
  const onChanged = vi.fn().mockResolvedValue(undefined);
  const onOverview = vi.fn();
  render(<GuidedResistanceCard
    sessionId="day-1" status={options.status ?? 'in_progress'} version={1}
    load={load as (sessionId: string) => Promise<GuidedResistanceView>}
    complete={complete as (sessionId: string, payload: GuidedResistanceCompletePayload) => Promise<GuidedResistanceView>}
    onExecutionChanged={onChanged}
    onOverview={onOverview}
  />);
  return { load, complete, onChanged, onOverview };
};

describe('issue #487 - guia resistido', () => {
  it('mostra apenas uma série e mantém prescrito separado do realizado', async () => {
    const { complete, onChanged } = panel();
    expect(await screen.findByRole('heading', { name: 'Passo a passo' })).toBeInTheDocument();
    expect(screen.getByText('Agachamento')).toBeInTheDocument();
    expect(screen.getByText('Sessão · Principal · Série 1 de 2')).toBeInTheDocument();
    expect(screen.getByText('8 a 12')).toBeInTheDocument();
    expect(screen.getByText('47 kg')).toBeInTheDocument();
    expect(screen.getByText('Controle a descida')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Repetições realizadas'));
    await userEvent.type(screen.getByLabelText('Repetições realizadas'), '6');
    await userEvent.clear(screen.getByLabelText('Carga realizada (kg)'));
    await userEvent.type(screen.getByLabelText('Carga realizada (kg)'), '45,5');
    await userEvent.click(screen.getByRole('button', { name: 'Concluir série' }));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(complete).toHaveBeenCalledWith('day-1', expect.objectContaining({
      plannedUnitId: 'exercise-a', plannedSetId: 'set-1',
      setNumber: 1, expectedVersion: 1, repetitions: 6, loadKg: 45.5,
      operationKey: expect.stringContaining('guided-'),
    }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/1 de 2 séries confirmadas/)).toBeInTheDocument();
  });

  it('offers an authorized catalog video without making it required to execute', async () => {
    const load = vi.fn().mockResolvedValue(projection({
      current: { ...first, videoUrl: 'https://example.org/demo' },
    }));
    const { complete } = panel({ load });
    const video = await screen.findByRole('link', { name: 'Ver vídeo de orientação do exercício' });
    expect(video).toHaveAttribute('href', 'https://example.org/demo');
    expect(video).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('button', { name: 'Concluir série' })).toBeEnabled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('preserva os valores e a mesma chave idempotente após erro de rede', async () => {
    const complete = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(projection({ version: 2, completed: 1, current: second, next: null }));
    panel({ complete });
    await screen.findByRole('button', { name: 'Concluir série' });
    await userEvent.type(screen.getByLabelText('Repetições realizadas'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Concluir série' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível confirmar/i);
    expect(screen.getByLabelText('Repetições realizadas')).toHaveValue('80');
    await userEvent.click(screen.getByRole('button', { name: 'Concluir série' }));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(2));
    expect(complete.mock.calls[1][1].operationKey).toBe(complete.mock.calls[0][1].operationKey);
  });

  it('não anuncia o descanso final antes do último participante da rodada', async () => {
    const groupedFirst = {
      ...first, groupId: 'group-1', groupType: 'biset' as const,
      groupPosition: 1, groupSize: 2, roundNumber: 1, roundTotal: 2,
    };
    const groupedSecond = {
      ...second, plannedUnitId: 'exercise-b',
      groupId: 'group-1', groupType: 'biset' as const,
      groupPosition: 2, groupSize: 2, roundNumber: 1, roundTotal: 2,
    };
    const load = vi.fn().mockResolvedValue(projection({ current: groupedFirst, next: groupedSecond }));
    const complete = vi.fn().mockResolvedValue(projection({
      version: 2, completed: 1, current: groupedSecond,
      next: { ...groupedFirst, plannedSetId: 'set-a-2', setNumber: 2, roundNumber: 2 },
    }));
    panel({ load, complete });
    expect(await screen.findByText(/Bi-set · rodada 1 de 2 · item 1 de 2/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Concluir série' }));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Descanso prescrito após a série anterior/)).not.toBeInTheDocument();
    expect(screen.getByText(/Próximo:/)).toHaveTextContent(/rodada 2/);
  });

  it('revalida após 409 sem repetir uma operação obsoleta', async () => {
    const load = vi.fn().mockResolvedValueOnce(projection()).mockResolvedValue(projection({
      version: 2, completed: 1, current: second, next: null,
    }));
    const complete = vi.fn().mockRejectedValue({ response: { status: 409 } });
    panel({ load, complete });
    await userEvent.click(await screen.findByRole('button', { name: 'Concluir série' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/outro dispositivo/);
    expect(screen.getByText(/1 de 2 séries confirmadas/)).toBeInTheDocument();
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('impede escrita enquanto pausado', async () => {
    const load = vi.fn().mockResolvedValue(projection({ status: 'paused' }));
    const complete = vi.fn();
    const { onOverview } = panel({ load, complete, status: 'paused' });
    expect(await screen.findByRole('button', { name: 'Concluir série' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Ver ficha completa' }));
    expect(onOverview).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();
  });

  it('mantém fallback sem habilitar mutação para treino agrupado', async () => {
    const complete = vi.fn();
    panel({ load: vi.fn().mockResolvedValue(projection({
      availability: 'grouping_pending', current: null, next: null,
    })), complete });
    expect(await screen.findByText(/exercícios agrupados/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Concluir série' })).not.toBeInTheDocument();
    expect(complete).not.toHaveBeenCalled();
  });
});
