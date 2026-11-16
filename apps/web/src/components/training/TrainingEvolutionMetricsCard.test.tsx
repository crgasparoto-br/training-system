import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TrainingRoutineView, TrainingRoutineWeeklyEvolution } from '@corrida/types';
import { TrainingEvolutionMetricsCard, formatEvolutionValue } from './TrainingEvolutionMetricsCard';

const evolution: TrainingRoutineWeeklyEvolution = {
  period: { startDate: '2026-11-02', endDate: '2026-11-08' },
  sourceLabel: 'Montagem Consolidada e execução das sessões',
  counts: { prescribedSessions: 2, completedSessions: 1, partialSessions: 1, notPerformedSessions: 0, pendingSessions: 0 },
  adherence: { status: 'available', value: 50, unit: '%' },
  lastSourceUpdateAt: '2026-11-05T12:00:00.000Z',
  metrics: [
    { key: 'distance', label: 'Distância executada', unit: 'km', status: 'available',
      value: 8, sampleCount: 2, sourceLabel: 'Execução cíclica registrada',
      lastSourceUpdateAt: '2026-11-05T12:00:00.000Z' },
    { key: 'load', label: 'Carga por exercício e série', unit: 'kg', status: 'incomparable',
      value: null, sampleCount: 2, sourceLabel: 'Séries resistidas e planejamento histórico',
      lastSourceUpdateAt: '2026-11-05T12:00:00.000Z' },
    { key: 'pse', label: 'PSE registrada', unit: '0–10', status: 'insufficient_data',
      value: null, sampleCount: 0, sourceLabel: 'Revisão vigente do feedback pós-treino',
      lastSourceUpdateAt: null },
  ],
  series: [{
    key: 'distance', label: 'Distância executada', unit: 'km', modality: 'cyclic',
    scopeLabel: 'Sessão', points: [
      { date: '2026-11-03', value: 3 }, { date: '2026-11-05', value: 5 },
    ], technical: { ruleVersion: 'training-evolution-v1', sources: [{
      sessionId: 'private-session-1', releaseId: 'private-release-1',
      sourceId: 'private-record-1', updatedAt: '2026-11-05T12:00:00.000Z',
    }] },
  }],
  technical: {
    ruleVersion: 'weekly-adherence-v1',
    source: 'consolidated_release_and_session_execution',
    formula: 'completedSessions / prescribedSessions * 100',
    sessions: [{ sessionId: 'private-session-1', status: 'completed' }],
    indicators: [{ key: 'distance', ruleVersion: 'training-evolution-v1',
      formula: 'sum(executed_distance_km)', source: 'canonical_session_execution',
      observations: [{ sessionId: 'private-session-1', releaseId: 'private-release-1',
        sourceId: 'private-record-1', updatedAt: '2026-11-05T12:00:00.000Z' }],
    }],
  },
};

const routine = (audience: 'student' | 'professor'): TrainingRoutineView => ({
  alunoId: 'aluno-1', audience, referenceDate: '2026-11-05', timeZone: 'America/Sao_Paulo',
  week: evolution.period, days: [], weeklyEvolution: evolution,
  today: { date: '2026-11-05', state: 'none', sessions: [] },
  execution: { available: true, reason: null },
});

describe('TrainingEvolutionMetricsCard (#405)', () => {
  it('mostra período, fonte, disponibilidade e medições sem misturar escalas', () => {
    render(<TrainingEvolutionMetricsCard routine={routine('student')} audience="student" />);
    const region = screen.getByRole('region', { name: 'Indicadores de evolução' });
    expect(within(region).getByText('8 km')).toBeInTheDocument();
    expect(within(region).getByText('Não comparável')).toBeInTheDocument();
    expect(within(region).getByText('Dados insuficientes')).toBeInTheDocument();
    expect(within(region).getByText('02/11/2026 a 08/11/2026', { exact: false })).toBeInTheDocument();
    expect(within(region).getByText('Fonte: Execução cíclica registrada')).toBeInTheDocument();
    expect(within(region).getByText(/Consistência: indisponível/)).toBeInTheDocument();
    expect(within(region).getByText('03/11/2026: 3 km')).toBeInTheDocument();
    expect(within(region).getByText('05/11/2026: 5 km')).toBeInTheDocument();
    expect(within(region).getByText(/registros sem modalidade, método ou unidade histórica/)).toBeInTheDocument();
    expect(within(region).queryByText('Regras técnicas e rastreabilidade')).not.toBeInTheDocument();
    expect(within(region).queryByText(/private-record-1/)).not.toBeInTheDocument();
  });

  it('restringe rastreabilidade ao professor autorizado pela audiência da API', () => {
    render(<TrainingEvolutionMetricsCard routine={routine('professor')} audience="professor" />);
    const region = screen.getByRole('region', { name: 'Indicadores de evolução' });
    expect(within(region).getByText('Regras técnicas e rastreabilidade')).toBeInTheDocument();
    expect(within(region).getByText(/private-record-1/)).toBeInTheDocument();
  });

  it('não projeta indicador com contrato ausente e formata ritmo sem unidade errada', () => {
    render(<TrainingEvolutionMetricsCard routine={{ ...routine('student'), weeklyEvolution: undefined }} audience="student" />);
    expect(screen.queryByRole('region', { name: 'Indicadores de evolução' })).not.toBeInTheDocument();
    expect(formatEvolutionValue(5.5, 'min/km', 'pace')).toBe('5:30 min/km');
  });
});
