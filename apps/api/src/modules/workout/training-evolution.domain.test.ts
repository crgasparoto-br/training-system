import { calculateWeeklyTrainingEvolution } from './training-evolution.domain.js';
import type { WeeklyEvolutionSessionSource } from './training-evolution.domain.js';

const period = { startDate: '2026-11-02', endDate: '2026-11-08' };
const source = (sessionId: string, status: WeeklyEvolutionSessionSource['status']): WeeklyEvolutionSessionSource => ({
  sessionId, status, sourceUpdatedAt: '2026-11-05T12:00:00.000Z',
});

describe('evolução semanal canônica (#405)', () => {
  it('não trata semana sem sessões liberadas como aderência zero', () => {
    expect(calculateWeeklyTrainingEvolution({ period, sessions: [], audience: 'student' })).toMatchObject({
      counts: { prescribedSessions: 0, completedSessions: 0, partialSessions: 0 },
      adherence: { status: 'insufficient_data', value: null, unit: '%' },
      lastSourceUpdateAt: null,
    });
  });

  it('conta apenas completed no numerador, e mostra parciais/não realizadas separadamente', () => {
    const output = calculateWeeklyTrainingEvolution({
      period, audience: 'professor',
      sessions: [source('c', 'not_performed'), source('b', 'partial'), source('a', 'completed'), source('d', 'paused')],
    });
    expect(output.counts).toEqual({
      prescribedSessions: 4, completedSessions: 1, partialSessions: 1,
      notPerformedSessions: 1, pendingSessions: 1,
    });
    expect(output.adherence).toEqual({ status: 'available', value: 25, unit: '%' });
    expect(output.technical).toMatchObject({
      ruleVersion: 'weekly-adherence-v1',
      source: 'consolidated_release_and_session_execution',
      formula: 'completedSessions / prescribedSessions * 100',
    });
    expect(output.technical?.sessions.map((row) => row.sessionId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('omite evidência técnica da visão do aluno sem afetar a métrica', () => {
    const sessions = [source('a', 'completed'), source('b', 'partial')];
    const student = calculateWeeklyTrainingEvolution({ period, sessions, audience: 'student' });
    const professor = calculateWeeklyTrainingEvolution({ period, sessions, audience: 'professor' });
    expect(student.adherence).toEqual(professor.adherence);
    expect(student.sourceLabel).toBe(professor.sourceLabel);
    expect(student.sourceLabel).toBe('Montagem Consolidada e execução das sessões');
    expect(student.technical).toBeUndefined();
    expect(student).not.toHaveProperty('ruleVersion');
    expect(student).not.toHaveProperty('source');
    expect(student.adherence).not.toHaveProperty('formula');
    expect(JSON.stringify(student)).not.toMatch(/weekly-adherence-v1|completedSessions \/ prescribedSessions|consolidated_release_and_session_execution|"sessionId"/);
    expect(professor.technical?.sessions).toHaveLength(2);
    expect(student.period).toEqual(period);
  });

  it('preserva ausência de timestamp, cálculo zero e fonte legível sem metadados técnicos', () => {
    const result = calculateWeeklyTrainingEvolution({
      period, audience: 'student',
      sessions: [{ sessionId: 'x', status: 'not_started', sourceUpdatedAt: null }],
    });
    expect(result.lastSourceUpdateAt).toBeNull();
    expect(result.sourceLabel).toBe('Montagem Consolidada e execução das sessões');
    expect(result.technical).toBeUndefined();
    expect(result.adherence).toEqual({ status: 'available', value: 0, unit: '%' });
  });

  it('não devolve metadados técnicos nem para período sem sessões', () => {
    const student = calculateWeeklyTrainingEvolution({ period, sessions: [], audience: 'student' });
    const professor = calculateWeeklyTrainingEvolution({ period, sessions: [], audience: 'professor' });
    expect(Object.keys(student).sort()).toEqual([
      'adherence', 'counts', 'lastSourceUpdateAt', 'metrics', 'period', 'series', 'sourceLabel',
    ]);
    expect(student.adherence.status).toBe('insufficient_data');
    expect(professor.technical?.ruleVersion).toBe('weekly-adherence-v1');
    expect(professor.technical?.sessions).toEqual([]);
  });

  it('rejeita fonte duplicada, evitando distorcer o denominador', () => {
    expect(() => calculateWeeklyTrainingEvolution({
      period, audience: 'student', sessions: [source('x', 'completed'), source('x', 'partial')],
    })).toThrow(/ID único/);
  });

  const executed = (
    id: string, date: string, modality: string, status: WeeklyEvolutionSessionSource['status'] = 'completed',
  ): WeeklyEvolutionSessionSource => ({
    sessionId: id, date, modality, status, releaseId: 'release-1',
    sourceUpdatedAt: date + 'T12:00:00.000Z',
    execution: { sessionValues: {}, items: [], plannedExercises: [] },
  });

  it('agrega medições cíclicas compatíveis, inclusive parciais, sem pontuá-las como concluídas', () => {
    const first = executed('cyclic-1', '2026-11-02', 'cyclic');
    first.execution!.sessionValues = { durationSec: 1800, distanceKm: 5, pace: '05:30' };
    const partial = executed('cyclic-2', '2026-11-04', 'cyclic', 'partial');
    partial.execution!.sessionValues = { durationSec: 1200, distanceKm: 3, pace: '06:00' };
    const nonperformed = executed('cyclic-3', '2026-11-05', 'cyclic', 'not_performed');
    nonperformed.execution!.sessionValues = { durationSec: 9999, distanceKm: 99 };
    const result = calculateWeeklyTrainingEvolution({
      period, audience: 'student', sessions: [partial, nonperformed, first],
    });
    expect(result.counts).toMatchObject({ completedSessions: 1, partialSessions: 1, notPerformedSessions: 1 });
    expect(result.adherence.value).toBe(33.33);
    expect(result.metrics.find((metric) => metric.key === 'duration')).toMatchObject({
      status: 'available', value: 50, unit: 'min', sampleCount: 2,
    });
    expect(result.metrics.find((metric) => metric.key === 'distance')).toMatchObject({
      status: 'available', value: 8, unit: 'km', sampleCount: 2,
    });
    expect(result.metrics.find((metric) => metric.key === 'pace')).toMatchObject({
      status: 'available', value: 5.75, unit: 'min/km', sampleCount: 2,
    });
    expect(result.series.find((item) => item.key === 'distance')?.points).toEqual([
      { date: '2026-11-02', value: 5 }, { date: '2026-11-04', value: 3 },
    ]);
    expect(result.metrics.find((metric) => metric.key === 'tonnage')?.value).toBeNull();
  });

  it('compara carga/repetições apenas pelo catálogo estável e série no snapshot histórico', () => {
    const first = executed('res-1', '2026-11-02', 'resistance');
    first.execution!.plannedExercises = [{ plannedUnitId: 'p-1', catalogExerciseId: 'squat', name: 'Agachamento' }];
    first.execution!.items = [{
      plannedUnitId: 'p-1', plannedSetId: 'set-a', setNumber: 1, outcome: 'full', loadKg: 40, repetitions: 8,
    }];
    const second = executed('res-2', '2026-11-04', 'resistance');
    second.execution!.plannedExercises = [{ plannedUnitId: 'p-2', catalogExerciseId: 'squat', name: 'Agachamento' }];
    second.execution!.items = [{
      plannedUnitId: 'p-2', plannedSetId: 'set-b', setNumber: 1, outcome: 'full', loadKg: 42, repetitions: 8,
    }];
    const student = calculateWeeklyTrainingEvolution({ period, sessions: [first, second], audience: 'student' });
    const professor = calculateWeeklyTrainingEvolution({ period, sessions: [first, second], audience: 'professor' });
    expect(student.metrics.find((item) => item.key === 'tonnage')).toMatchObject({
      value: 656, status: 'available', sampleCount: 2,
    });
    expect(student.metrics.find((item) => item.key === 'load')).toMatchObject({
      value: 42, status: 'available', sampleCount: 2,
    });
    expect(student.metrics.find((item) => item.key === 'repetitions')?.value).toBe(8);
    expect(student.series.find((item) => item.key === 'load')?.points).toEqual([
      { date: '2026-11-02', value: 40 }, { date: '2026-11-04', value: 42 },
    ]);
    expect(student.series.every((item) => item.technical === undefined)).toBe(true);
    expect(JSON.stringify(student)).not.toMatch(/squat|set-a|set-b|release-1|training-evolution-v1/);
    expect(professor.technical?.indicators.find((item) => item.key === 'load')).toMatchObject({
      ruleVersion: 'training-evolution-v1',
      observations: [{ sessionId: 'res-1', sourceId: 'set-a', releaseId: 'release-1' },
        { sessionId: 'res-2', sourceId: 'set-b', releaseId: 'release-1' }],
    });
  });

  it('não mistura modalidades ou exercícios diferentes em um único indicador', () => {
    const cyclic = executed('run', '2026-11-02', 'cyclic');
    cyclic.execution!.sessionValues = { durationSec: 1800, distanceKm: 5 };
    const resistance = executed('weights', '2026-11-03', 'resistance');
    resistance.execution!.sessionValues = { durationSec: 3600 };
    resistance.execution!.plannedExercises = [
      { plannedUnitId: 'p1', catalogExerciseId: 'squat', name: 'Agachamento' },
      { plannedUnitId: 'p2', catalogExerciseId: 'press', name: 'Supino' },
    ];
    resistance.execution!.items = [
      { plannedUnitId: 'p1', setNumber: 1, loadKg: 40, repetitions: 8 },
      { plannedUnitId: 'p2', setNumber: 1, loadKg: 30, repetitions: 10 },
    ];
    const result = calculateWeeklyTrainingEvolution({ period, sessions: [cyclic, resistance], audience: 'student' });
    expect(result.metrics.find((item) => item.key === 'duration')).toMatchObject({
      status: 'incomparable', value: null, sampleCount: 2,
    });
    expect(result.series.filter((item) => item.key === 'duration')).toHaveLength(2);
    expect(result.metrics.find((item) => item.key === 'distance')?.value).toBe(5);
    expect(result.metrics.find((item) => item.key === 'load')).toMatchObject({
      status: 'incomparable', value: null, sampleCount: 2,
    });
    expect(result.series.filter((item) => item.key === 'load')).toHaveLength(2);
    expect(result.metrics.find((item) => item.key === 'tonnage')?.value).toBe(620);
  });

  it('PSE/PSR usam revisão vigente recebida, não incluem dados clínicos e separam escopos', () => {
    const run = executed('run', '2026-11-03', 'cyclic');
    run.feedback = [
      { id: 'revision-2', scopeKey: 'session', createdAt: '2026-11-04T10:00:00.000Z', pse: 6, psr: 8 },
      { id: 'revision-3', scopeKey: 'flexibility', createdAt: '2026-11-04T11:00:00.000Z', pse: 4, psr: null },
    ];
    const student = calculateWeeklyTrainingEvolution({ period, audience: 'student', sessions: [run] });
    expect(student.metrics.find((item) => item.key === 'pse')).toMatchObject({
      status: 'incomparable', value: null, sampleCount: 2,
      lastSourceUpdateAt: '2026-11-04T11:00:00.000Z',
    });
    expect(student.metrics.find((item) => item.key === 'psr')).toMatchObject({
      status: 'available', value: 8, sampleCount: 1,
    });
    expect(JSON.stringify(student)).not.toContain('revision-2');
    expect(JSON.stringify(student)).not.toContain('revision-3');
    const teacher = calculateWeeklyTrainingEvolution({ period, audience: 'professor', sessions: [run] });
    expect(teacher.technical?.indicators.find((item) => item.key === 'pse')?.observations.map((item) => item.sourceId))
      .toEqual(['revision-2', 'revision-3']);
  });

  it('distingue ausência, zero explícito, substituições executadas e ritmo inválido', () => {
    const run = executed('run', '2026-11-04', 'cyclic', 'partial');
    run.execution!.sessionValues = { durationSec: 0, pace: '5.30' };
    run.execution!.sessionValues.cyclicStages = [
      { plannedStageId: 'a', outcome: 'substituted' },
      { plannedStageId: 'b', outcome: 'not_performed' },
    ];
    const noData = executed('pending', '2026-11-05', 'cyclic', 'not_started');
    noData.execution!.sessionValues = { durationSec: 600 };
    const student = calculateWeeklyTrainingEvolution({ period, sessions: [run, noData], audience: 'student' });
    expect(student.metrics.find((item) => item.key === 'duration')).toMatchObject({
      status: 'available', value: 0, sampleCount: 1,
    });
    expect(student.metrics.find((item) => item.key === 'distance')).toMatchObject({
      status: 'insufficient_data', value: null, sampleCount: 0,
    });
    expect(student.metrics.find((item) => item.key === 'pace')).toMatchObject({
      status: 'incomparable', value: null, sampleCount: 0,
    });
    expect(student.metrics.find((item) => item.key === 'substitutions')).toMatchObject({
      status: 'available', value: 1, sampleCount: 1,
    });
    expect(student.adherence.value).toBe(0);
    expect(student.metrics.some((item) => item.key === 'consistency')).toBe(false);
  });


});
