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



  it('A-401-10: preserves high-precision inputs and shows small differences instead of false zero', () => {
    const metric = (executed: number | null) => ({
      key: 'load', label: 'Carga', planned: 20, plannedMax: null,
      executed, plannedUnit: 'kg', executedUnit: 'kg',
      difference: executed === null ? null : executed - 20,
    });
    const positive = metric(20.0004);
    expect(formatComparisonMetric(positive)).toEqual({
      planned: '20 kg', executed: '20,0004 kg', difference: '≈ 0,0004 kg',
    });
    expect(formatComparisonMetric(metric(19.9996))).toEqual({
      planned: '20 kg', executed: '19,9996 kg', difference: '≈ -0,0004 kg',
    });
    expect(formatComparisonMetric(metric(20)).difference).toBe('0 kg');
    expect(formatComparisonMetric(metric(null))).toEqual({
      planned: '20 kg', executed: 'Indisponível', difference: null,
    });
    expect(formatComparisonMetric(metric(20.000000000000004)).executed)
      .toBe('20,000000000000004 kg');
    const tiny = { ...metric(10.00000001), planned: 10, difference: 10.00000001 - 10 };
    expect(formatComparisonMetric(tiny).difference).not.toBe('0 kg');

    render(<WorkoutExecutionComparisonCard comparison={{
      ...comparison,
      units: [{ ...comparison.units[1], metrics: [positive] }],
    }} audience="professor" />);
    expect(screen.getByText((_text, element) => element?.tagName === 'DD'
      && element.textContent?.includes('Executado: 20,0004 kg') === true)).toBeInTheDocument();
    expect(screen.getByText(/diferença: ≈ 0,0004 kg/)).toBeInTheDocument();
  });

  it('A-401-06: renders string HR/speed ranges, numeric pace ranges and upper-only targets', () => {
    const rangeComparison: TrainingSessionComparison = {
      ...comparison,
      units: [{ ...comparison.units[0], metrics: [
        { key: 'heart_rate', label: 'Frequência cardíaca', planned: '120', plannedMax: '160',
          executed: 140, plannedUnit: 'bpm', executedUnit: 'bpm', difference: null },
        { key: 'speed', label: 'Velocidade', planned: '8', plannedMax: '10',
          executed: 9, plannedUnit: 'km/h', executedUnit: 'km/h', difference: null },
        { key: 'pace', label: 'Ritmo', planned: 5, plannedMax: 6,
          executed: '5:30', plannedUnit: 'min/km', executedUnit: 'min/km', difference: null },
        { key: 'hr_upper', label: 'Limite isolado', planned: null, plannedMax: '160',
          executed: null, plannedUnit: 'bpm', executedUnit: 'bpm', difference: null },
      ] }],
    };
    render(<WorkoutExecutionComparisonCard comparison={rangeComparison} audience="student" />);
    expect(screen.getByText('120 bpm a 160 bpm')).toBeInTheDocument();
    expect(screen.getByText('8 km/h a 10 km/h')).toBeInTheDocument();
    expect(screen.getByText((_text, element) => element?.tagName === 'DD'
      && element.textContent?.includes('Executado: 9 km/h') === true)).toBeInTheDocument();
    expect(screen.getByText('5 min/km a 6 min/km')).toBeInTheDocument();
    expect(screen.getByText('Até 160 bpm')).toBeInTheDocument();
    expect(screen.queryByText(/diferença:/i)).not.toBeInTheDocument();
  });

  it('A-401-11: describes unilateral limits without showing false numeric differences', () => {
    const bounded: TrainingSessionComparison = {
      ...comparison,
      units: [{ ...comparison.units[0], metrics: [
        { key: 'lower', label: 'Velocidade mínima', planned: 8, plannedMax: null,
          plannedConstraint: 'minimum', executed: 9, plannedUnit: 'km/h',
          executedUnit: 'km/h', difference: null },
        { key: 'upper', label: 'FC máxima', planned: null, plannedMax: 160,
          plannedConstraint: 'maximum', executed: 140, plannedUnit: 'bpm',
          executedUnit: 'bpm', difference: null },
        { key: 'range', label: 'Ritmo', planned: 5, plannedMax: 6,
          plannedConstraint: 'range', executed: 5.5, plannedUnit: 'min/km',
          executedUnit: 'min/km', difference: null },
        { key: 'exact', label: 'Carga prescrita', planned: 8, plannedMax: null,
          plannedConstraint: 'exact', executed: 9, plannedUnit: 'kg',
          executedUnit: 'kg', difference: 1 },
      ] }],
    };
    render(<WorkoutExecutionComparisonCard comparison={bounded} audience="professor" />);
    expect(screen.getByText('A partir de 8 km/h')).toBeInTheDocument();
    expect(screen.getByText('Até 160 bpm')).toBeInTheDocument();
    expect(screen.getByText('5 min/km a 6 min/km')).toBeInTheDocument();
    expect(screen.getByText('8 kg')).toBeInTheDocument();
    expect(screen.getAllByText(/diferença: 1 kg/)).toHaveLength(1);
    // Defensive UI: even an inconsistent old consumer-provided delta may not
    // be rendered when the contract explicitly declares a bound instead.
    expect(formatComparisonMetric({
      ...bounded.units[0].metrics[0], difference: 1,
    }).difference).toBeNull();
  });

  it('A-401-12: student summary of structured sets never presents legacy load', () => {
    const setCoverage: TrainingSessionComparison = {
      ...comparison,
      units: [{ ...comparison.units[1], outcome: 'incomplete_record', metrics: [{
        key: 'sets', label: 'Séries com registro', planned: 2, plannedMax: null,
        plannedConstraint: 'exact', executed: 1, plannedUnit: 'séries', executedUnit: 'séries',
        difference: -1,
      }] }, comparison.units[2]],
    };
    render(<WorkoutExecutionComparisonCard comparison={setCoverage} audience="student" />);
    expect(screen.getByText('Séries com registro')).toBeInTheDocument();
    expect(screen.getByText('Planejado:')).toBeInTheDocument();
    expect(screen.queryByText('Série 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Carga')).not.toBeInTheDocument();
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

  it('A-401-13/14: renders distinct legacy recordings and their own cyclic measurements', () => {
    const record = (setNumber: number, load: number, duration: number) => ({
      ...comparison.units[2],
      plannedUnitId: 'ex-1',
      parentUnitId: 'ex-1',
      label: 'Série registrada',
      executedSetNumber: setNumber,
      metrics: [
        { key: 'load', label: 'Carga', planned: 20, plannedMax: null,
          executed: load, plannedUnit: 'kg', executedUnit: 'kg',
          difference: load - 20 },
        { key: 'duration', label: 'Duração', planned: null, plannedMax: null,
          executed: duration, plannedUnit: 's', executedUnit: 's', difference: null },
      ],
    });
    const legacy: TrainingSessionComparison = {
      ...comparison,
      units: [comparison.units[0], record(1, 20, 0), record(3, 25, 600)],
    };
    const view = render(<WorkoutExecutionComparisonCard comparison={legacy} audience="professor" />);
    expect(screen.getByText('Série registrada · registro 1')).toBeInTheDocument();
    expect(screen.getByText('Série registrada · registro 3')).toBeInTheDocument();
    expect(screen.getByText('0 s')).toBeInTheDocument();
    expect(screen.getByText('600 s')).toBeInTheDocument();
    expect(screen.getByText(/diferença: 5 kg/)).toBeInTheDocument();
    view.rerender(<WorkoutExecutionComparisonCard comparison={legacy} audience="student" />);
    expect(screen.queryByText('Série registrada · registro 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Série registrada · registro 3')).not.toBeInTheDocument();
    expect(screen.queryByText(/diferença: 5 kg/)).not.toBeInTheDocument();
  });

  it('A-401-15: renders simultaneous cyclic time, distance and intensity without invented deltas', () => {
    const cyclic: TrainingSessionComparison = {
      ...comparison,
      units: [{
        plannedUnitId: 'stage-1', kind: 'cyclic_stage', label: 'Etapa 1',
        parentUnitId: null, iteration: null, outcome: 'partial',
        metrics: [
          { key: 'duration', label: 'Duração', planned: 300, plannedMax: null,
            executed: 310, plannedUnit: 's', executedUnit: 's', difference: 10 },
          { key: 'distance', label: 'Distância', planned: null, plannedMax: null,
            executed: 900, plannedUnit: 'm', executedUnit: 'm', difference: null },
          { key: 'heart_rate', label: 'Frequência cardíaca', planned: null, plannedMax: null,
            executed: 154, plannedUnit: 'bpm', executedUnit: 'bpm', difference: null },
          { key: 'pse', label: 'Esforço percebido', planned: null, plannedMax: null,
            executed: 0, plannedUnit: 'PSE', executedUnit: 'PSE', difference: null },
        ],
      }],
    };
    render(<WorkoutExecutionComparisonCard comparison={cyclic} audience="professor" />);
    expect(screen.getByText('310 s')).toBeInTheDocument();
    expect(screen.getByText('900 m')).toBeInTheDocument();
    expect(screen.getByText('154 bpm')).toBeInTheDocument();
    expect(screen.getByText('0 PSE')).toBeInTheDocument();
    expect(screen.getAllByText(/diferença:/)).toHaveLength(1);
    expect(screen.queryByText(/Resultado:\s*(melhor|pior)|Desempenho:\s*(melhor|pior)/i)).not.toBeInTheDocument();
  });

});
