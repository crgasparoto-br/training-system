import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
    expect(screen.queryByText(/Melhor|Pior|Evoluiu/i)).not.toBeInTheDocument();
    expect(formatComparisonMetric(comparison.units[1].metrics[0])).toEqual({
      planned: '20 kg', executed: '0 kg', difference: '-20 kg',
    });
    expect(formatComparisonMetric({
      key: 'reps', label: 'Repetições', planned: 8, plannedMax: 12,
      executed: 10, plannedUnit: 'rep', executedUnit: 'rep', difference: null,
    })).toEqual({ planned: '8 rep a 12 rep', executed: '10 rep', difference: null });
  });

  it('expõe legado sem snapshot como alternativa explícita, sem fingir captura', () => {
    render(<WorkoutExecutionComparisonCard comparison={{ ...comparison, snapshotSource: 'released_plan' }} audience="student" />);
    expect(screen.getByText(/execução antiga não possui uma captura congelada/)).toBeInTheDocument();
  });
});
