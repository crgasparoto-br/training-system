import { act, render, screen, waitFor } from '@testing-library/react';
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
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
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
  const card = (version: number) => <GuidedResistanceCard
    sessionId="day-1" status={options.status ?? 'in_progress'} version={version}
    load={load as (sessionId: string) => Promise<GuidedResistanceView>}
    complete={complete as (sessionId: string, payload: GuidedResistanceCompletePayload) => Promise<GuidedResistanceView>}
    onExecutionChanged={onChanged}
    onOverview={onOverview}
  />;
  const { rerender } = render(card(1));
  return { load, complete, onChanged, onOverview, changeVersion: (value: number) => rerender(card(value)) };
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
      ...first, restSec: null, groupId: 'group-1', groupType: 'bi_set' as const,
      groupPosition: 1, groupSize: 2, roundNumber: 1, roundTotal: 2,
    };
    const groupedSecond = {
      ...second, plannedUnitId: 'exercise-b',
      groupId: 'group-1', groupType: 'bi_set' as const,
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

  it('bloqueia confirmação após 409 seguido de falha GET sem perder os dados locais', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce(projection())
      .mockRejectedValueOnce(new Error('network after conflict'))
      .mockResolvedValueOnce(projection({ version: 2, completed: 1, current: second, next: null }));
    const complete = vi.fn().mockRejectedValue({ response: { status: 409 } });
    panel({ load, complete });
    const submit = await screen.findByRole('button', { name: 'Concluir série' });
    await userEvent.clear(screen.getByLabelText('Repetições realizadas'));
    await userEvent.type(screen.getByLabelText('Repetições realizadas'), '6');
    await userEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent(/recarga falhou/);
    expect(submit).toBeDisabled();
    expect(screen.getByLabelText('Repetições realizadas')).toHaveValue('6');
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar estado salvo' }));
    await waitFor(() => expect(screen.getByText(/1 de 2 séries confirmadas/)).toBeInTheDocument());
    expect(submit).toBeEnabled();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(3);
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

  it('não libera confirmação por GET antigo após 409 e falha da revalidação atual', async () => {
    const staleGet = deferred<GuidedResistanceView>();
    const pendingPost = deferred<GuidedResistanceView>();
    const load = vi.fn()
      .mockResolvedValueOnce(projection())
      .mockReturnValueOnce(staleGet.promise)
      .mockRejectedValueOnce(new Error('GET after 409 failed'))
      .mockResolvedValueOnce(projection({ version: 2, completed: 1, current: second, next: null }));
    const complete = vi.fn().mockReturnValue(pendingPost.promise);
    const { changeVersion } = panel({ load, complete });
    const submit = await screen.findByRole('button', { name: 'Concluir série' });
    await userEvent.clear(screen.getByLabelText('Repetições realizadas'));
    await userEvent.type(screen.getByLabelText('Repetições realizadas'), '6');
    await userEvent.click(submit);
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));

    // A leitura #2 foi iniciada antes de recebermos o conflito 409.
    changeVersion(2);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await act(async () => pendingPost.reject({ response: { status: 409 } }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
    expect(await screen.findByRole('alert')).toHaveTextContent(/recarga falhou/);
    expect(submit).toBeDisabled();

    // A resposta atrasada não pode limpar o bloqueio nem substituir o rascunho.
    await act(async () => staleGet.resolve(projection({ version: 2, completed: 1, current: second, next: null })));
    expect(submit).toBeDisabled();
    expect(screen.getByLabelText('Repetições realizadas')).toHaveValue('6');
    expect(screen.getByText(/0 de 2 séries confirmadas/)).toBeInTheDocument();
    expect(complete).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Atualizar estado salvo' }));
    await waitFor(() => expect(screen.getByText(/1 de 2 séries confirmadas/)).toBeInTheDocument());
    expect(submit).toBeEnabled();
    expect(load).toHaveBeenCalledTimes(4);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('mantém a projeção mais recente quando GETs concorrentes resolvem em ordem invertida', async () => {
    const older = deferred<GuidedResistanceView>();
    const newer = deferred<GuidedResistanceView>();
    const load = vi.fn().mockResolvedValueOnce(projection())
      .mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const { changeVersion } = panel({ load });
    await screen.findByRole('button', { name: 'Concluir série' });
    changeVersion(2);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    changeVersion(3);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
    await act(async () => newer.resolve(projection({ version: 3, completed: 1, current: second, next: null })));
    expect(screen.getByText(/1 de 2 séries confirmadas/)).toBeInTheDocument();
    await act(async () => older.resolve(projection({ version: 2, completed: 0 })));
    expect(screen.getByText(/1 de 2 séries confirmadas/)).toBeInTheDocument();
    expect(screen.queryByText(/0 de 2 séries confirmadas/)).not.toBeInTheDocument();
    expect(screen.getByText('Sessão · Principal · Série 2 de 2')).toBeInTheDocument();
  });

  it('não retrocede após POST confirmado enquanto GET anterior continua pendente', async () => {
    const pendingPost = deferred<GuidedResistanceView>();
    const staleGet = deferred<GuidedResistanceView>();
    const load = vi.fn().mockResolvedValueOnce(projection()).mockReturnValueOnce(staleGet.promise);
    const complete = vi.fn().mockReturnValue(pendingPost.promise);
    const { changeVersion } = panel({ load, complete });
    await userEvent.click(await screen.findByRole('button', { name: 'Concluir série' }));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    changeVersion(2);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await act(async () => pendingPost.resolve(projection({ version: 3, completed: 1, current: second, next: null })));
    await waitFor(() => expect(screen.getByText(/1 de 2 séries confirmadas/)).toBeInTheDocument());
    await act(async () => staleGet.resolve(projection({ version: 2, completed: 0 })));
    expect(screen.getByText(/1 de 2 séries confirmadas/)).toBeInTheDocument();
    expect(screen.getByText(/Série 2 de 2/)).toBeInTheDocument();
  });

  it('não exibe snapshot de outra sessão nem permite confirmar dados cruzados', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce(projection({ sessionId: 'day-from-other-contract' }))
      .mockResolvedValueOnce(projection());
    const complete = vi.fn();
    panel({ load, complete });
    expect(await screen.findByRole('alert')).toHaveTextContent(/posição desatualizada/);
    expect(screen.queryByRole('button', { name: 'Concluir série' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar estado salvo' }));
    expect(await screen.findByRole('button', { name: 'Concluir série' })).toBeEnabled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('rejeita GET sem incremento de versão após conflito 409', async () => {
    const load = vi.fn().mockResolvedValueOnce(projection())
      .mockResolvedValueOnce(projection())
      .mockResolvedValueOnce(projection({ version: 2, completed: 1, current: second, next: null }));
    const complete = vi.fn().mockRejectedValue({ response: { status: 409 } });
    panel({ load, complete });
    const submit = await screen.findByRole('button', { name: 'Concluir série' });
    await userEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent(/posição desatualizada/);
    expect(submit).toBeDisabled();
    expect(screen.getByText(/0 de 2 séries confirmadas/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar estado salvo' }));
    await waitFor(() => expect(screen.getByText(/1 de 2 séries confirmadas/)).toBeInTheDocument());
    expect(submit).toBeEnabled();
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
