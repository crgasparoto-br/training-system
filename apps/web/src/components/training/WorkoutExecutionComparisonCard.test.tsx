import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TrainingSessionComparison } from '@corrida/types';
import { formatComparisonMetric, WorkoutExecutionComparisonCard } from './WorkoutExecutionComparisonCard';

const comparison: TrainingSessionComparison = {
  sessionId: 'day-1',
  originReleaseId: 'release-1',
  snapshotSource: 'captured',
  executionVersion: 3,
  units: [
    { plannedUnitId: 'day-1', kind: 'session', label: 'Sessão', parentUnitId: null, iteration: null,
      outcome: 'partial', metrics: [
        { key: 'duration', label: 'Duração', planned: 30, plannedMax: null,
          executed: null, plannedUnit: 'min', executedUnit: 's', difference: null },
      ],
    },
    { plannedUnitId: 'ex-1', kind: 'exercise', label: 'Agachamento', parentUnitId: null, iteration: null,
      outcome: 'substituted', metrics: [
        { key: 'load', label: 'Carga', planned: 20, plannedMax: null,
          executed: 0, plannedUnit: 'kg', executedUnit: 'kg', difference: -20 },
      ],
    },
    { plannedUnitId: 'set-1', kind: 'set', label: 'Série 1', parentUnitId: 'block-1', iteration: null,
      outcome: 'full', metrics: [
        { key: 'rir', label: 'RIR', planned: 2, plannedMax: null,
          executed: 1, plannedUnit: null, executedUnit: null, difference: -1 },
      ],
    },
  ],
};

describe('WorkoutExecutionComparisonCard (#401)', () => {
  it('exibe valores faltantes como indisponíveis e zero real como zero', () => {
    render(<WorkoutExecutionComparisonCard comparison={comparison} audience="student" />);
    expect(screen.getByRole('region', { name: 'Planejado e executado' })).toBeInTheDocument();
    expect(screen.getByText(/Ausência de registro não equivale a zero/)).toBeInTheDocument();
    const summary = screen.getByText(/Sessão/);
    expect(summary).toBeInTheDocument();
    expect(screen.getByText(/Indisponível/)).toBeInTheDocument();
    expect(screen.getByText(/Substituído/)).toBeInTheDocument();
    expect(screen.queryByText('Série 1')).not.toBeInTheDocument();
  });

  it('permite que o professor confira série, faixa e diferença sem veredicto', () => {
    render(<WorkoutExecutionComparisonCard comparison={comparison} audience="professor" />);
    expect(screen.getByText('Série 1')).toBeInTheDocument();
    expect(screen.getByText(/Diferenças numéricas não significam/)).toBeInTheDocument();
    expect(screen.getByText(/Agachamento/)).toBeInTheDocument();
    expect(screen.queryByText(/Resultado:\s*(melhor|pior)|Desempenho:\s*(melhor|pior)/i)).not.toBeInTheDocument();
    expect(formatComparisonMetric(comparison.units[1].metrics[0])).toEqual({
      planned: '20 kg', executed: '0 kg', difference: '-20 kg',
    });
    expect(formatComparisonMetric({
      key: 'reps', label: 'Repetições', planned: 8, plannedMax: 12,
      executed: 10, plannedUnit: 'rep', executedUnit: 'rep', difference: null,
    })).toEqual({ planned: '8 rep a 12 rep', executed: '10 rep', difference: null });
  });


  it('A-401-06: renders string HR/speed ranges, numeric pace ranges and upper-only targets', () => {
    const rangeComparison: TrainingSessionComparison = {
      ...comparison,
      units: [{ ...comparison.units[0], metrics: [
        { key: 'heart_rate', label: 'Frequência cardíaca', planned: '120', plannedMax: '160',
          executed: 140, plannedUnit: 'bpm', executedUnit: 'bpm', difference: null },
        { key: 'speed', label: 'Velocidade', planned: '8', plannedMax: '10',
          executed: null, plannedUnit: 'km/h', executedUnit: 'km/h', difference: null },
        { key: 'pace', label: 'Ritmo', planned: 5, plannedMax: 6,
          executed: '5:30', plannedUnit: 'min/km', executedUnit: 'min/km', difference: null },
        { key: 'hr_upper', label: 'Limite isolado', planned: null, plannedMax: '160',
          executed: null, plannedUnit: 'bpm', executedUnit: 'bpm', difference: null },
      ] }],
    };
    render(<WorkoutExecutionComparisonCard comparison={rangeComparison} audience="student" />);
    expect(screen.getByText('120 bpm a 160 bpm')).toBeInTheDocument();
    expect(screen.getByText('8 km/h a 10 km/h')).toBeInTheDocument();
    expect(screen.getByText('5 min/km a 6 min/km')).toBeInTheDocument();
    expect(screen.getByText('Até 160 bpm')).toBeInTheDocument();
    expect(screen.queryByText(/diferença:/i)).not.toBeInTheDocument();
  });

  it('expõe legado sem snapshot como alternativa explícita, sem fingir captura', () => {
    render(<WorkoutExecutionComparisonCard comparison={{ ...comparison, snapshotSource: 'released_plan' }} audience="student" />);
    expect(screen.getByText(/execução antiga não possui uma captura congelada/)).toBeInTheDocument();
    expect(screen.getByText(/metas históricas e diferenças ficam indisponíveis/)).toBeInTheDocument();
  });
  it('renders repeated recordings for one planned set with distinct React keys', () => {
    const duplicatedPlanId: TrainingSessionComparison = {
      ...comparison,
      units: [{
        ...comparison.units[2], executedSetNumber: 1,
      }, {
        ...comparison.units[2], executedSetNumber: 3,
      }],
    };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const view = render(<WorkoutExecutionComparisonCard comparison={duplicatedPlanId} audience="professor" />);
      expect(screen.getByText(/Série 1 · registro 1/)).toBeInTheDocument();
      expect(screen.getByText(/Série 1 · registro 3/)).toBeInTheDocument();
      view.rerender(<WorkoutExecutionComparisonCard comparison={{
        ...duplicatedPlanId,
        units: [duplicatedPlanId.units[0], {
          ...duplicatedPlanId.units[1], executedSetNumber: 4,
        }],
      }} audience="professor" />);
      expect(screen.getByText(/Série 1 · registro 1/)).toBeInTheDocument();
      expect(screen.getByText(/Série 1 · registro 4/)).toBeInTheDocument();
      expect(screen.queryByText(/Série 1 · registro 3/)).not.toBeInTheDocument();
      expect(errorSpy.mock.calls.flat().join(' ')).not.toMatch(/same key|unique key/i);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('shows incomplete recording and substitution simultaneously', () => {
    const mixed: TrainingSessionComparison = {
      ...comparison,
      units: [{
        ...comparison.units[1], outcome: 'incomplete_record',
        containsSubstitution: true,
      }],
    };
    render(<WorkoutExecutionComparisonCard comparison={mixed} audience="student" />);
    expect(screen.getByText(/Registro incompleto · com substituição/)).toBeInTheDocument();
  });

  it('does not claim completion for a recording without an explicit outcome', () => {
    const unknown: TrainingSessionComparison = {
      ...comparison,
      units: [{
        ...comparison.units[1], outcome: 'unclassified',
        containsSubstitution: false, substitutionNote: null,
      }],
    };
    render(<WorkoutExecutionComparisonCard comparison={unknown} audience="student" />);
    expect(screen.getByText('Situação não informada')).toBeInTheDocument();
    expect(screen.queryByText('Realizado')).not.toBeInTheDocument();
  });

});
