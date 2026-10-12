import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TrainingRoutineView } from '@corrida/types';
import { AlunoTrainingTab } from './AlunoTrainingTab';

const { getForAluno } = vi.hoisted(() => ({ getForAluno: vi.fn() }));
vi.mock('../../services/training-routine.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/training-routine.service')>();
  return { ...original, trainingRoutineService: { ...original.trainingRoutineService, getForAluno } };
});

describe('Central: aba Treinos / Planos', () => {
  it('apresenta os três cards do backend com colunas responsivas e aluno correto', async () => {
    const view: TrainingRoutineView = {
      alunoId: 'aluno-1', audience: 'professor',
      referenceDate: '2026-10-01', timeZone: 'America/Sao_Paulo',
      week: { startDate: '2026-09-28', endDate: '2026-10-04' },
      days: [{ date: '2026-10-01', isToday: true, sessions: [], pendingReleaseCount: 0 }],
      today: { date: '2026-10-01', state: 'none', sessions: [] },
      execution: { available: true, reason: null },
      nextSession: { sessionId: 'day-2', date: '2026-11-03', status: 'not_started' },
      lastExecution: { sessionId: 'day-1', date: '2026-09-30', status: 'completed' },
      feedbackContinuity: { state: 'unavailable', pendingCount: 0, registeredCount: 0 },
    };
    getForAluno.mockReset().mockResolvedValue(view);
    render(<AlunoTrainingTab alunoId="aluno-1" />);

    const cards = await screen.findByRole('region', { name: 'Continuidade do treinamento' });
    expect(cards).toHaveClass('grid', 'sm:grid-cols-3');
    expect(within(cards).getByText('Próximo treino')).toBeInTheDocument();
    expect(within(cards).getByText('Última execução')).toBeInTheDocument();
    expect(within(cards).getByText('Feedback indisponível')).toBeInTheDocument();
    expect(getForAluno).toHaveBeenCalledWith('aluno-1', { date: undefined });
  });

  it('troca o aluno sem conservar o snapshot do contexto anterior', async () => {
    getForAluno.mockReset()
      .mockResolvedValueOnce({
        alunoId: 'aluno-a', audience: 'professor',
        referenceDate: '2026-10-01', timeZone: 'America/Sao_Paulo',
        week: { startDate: '2026-09-28', endDate: '2026-10-04' },
        days: [{ date: '2026-10-01', isToday: true, sessions: [], pendingReleaseCount: 0 }],
        today: { date: '2026-10-01', state: 'none', sessions: [] },
        execution: { available: true, reason: null },
        nextSession: { sessionId: 'future-a', date: '2026-11-03', status: 'not_started' },
        lastExecution: null,
        feedbackContinuity: { state: 'unavailable', pendingCount: 0, registeredCount: 0 },
      })
      .mockRejectedValueOnce({ response: { status: 403 } });
    const page = render(<AlunoTrainingTab key="aluno-a" alunoId="aluno-a" />);
    expect(await screen.findByText('03/11 · Não iniciado')).toBeInTheDocument();
    page.rerender(<AlunoTrainingTab key="aluno-b" alunoId="aluno-b" />);
    expect(await screen.findByText('Sem permissão para ver os treinos')).toBeInTheDocument();
    expect(screen.queryByText('03/11 · Não iniciado')).not.toBeInTheDocument();
  });
});
