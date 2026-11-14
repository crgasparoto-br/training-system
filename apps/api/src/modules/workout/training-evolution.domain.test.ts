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
    method: modality.split('+').includes('cyclic') ? 'corrida continua' : null,
    sourceUpdatedAt: date + 'T12:00:00.000Z',
    executionFinishedAt: date + 'T18:00:00.000Z',
    cyclicStructure: modality.split('+').includes('cyclic') ? '[]' : undefined,
    execution: { sessionValues: {}, items: [], plannedExercises: [] },
  });

  const plannedUnit = (
    plannedUnitId: string, catalogExerciseId: string, name: string,
    section = 'principal', exerciseOrder = 1, blockSignature = '[]', groupSignature: string | null = null,
  ) => ({ plannedUnitId, catalogExerciseId, name, section, exerciseOrder,
    system: null, blockSignature, groupSignature });

  it('A-018: revisão de PSE/PSR atualiza apenas timestamps das próprias fontes, não da execução', () => {
    const executionAt = '2026-11-03T12:00:00.000Z';
    const revisionAt = '2026-11-05T13:00:00.000Z';
    const session = executed('res-feedback', '2026-11-03', 'resistance');
    session.sourceUpdatedAt = executionAt;
    session.execution!.sessionValues = { durationSec: 1800 };
    session.execution!.plannedExercises = [plannedUnit('unit-1', 'squat', 'Agachamento')];
    session.execution!.items = [{
      plannedUnitId: 'unit-1', plannedSetId: 'set-1', setNumber: 1,
      outcome: 'full', completedAt: executionAt, loadKg: 40, repetitions: 8,
    }];
    const earlier = calculateWeeklyTrainingEvolution({
      period, audience: 'professor', sessions: [session],
    });
    const revised = calculateWeeklyTrainingEvolution({
      period, audience: 'professor',
      sessions: [{ ...session, feedback: [{
        id: 'feedback-v2', scopeKey: 'session', createdAt: revisionAt, pse: 7, psr: 8,
      }] }],
    });
    expect(earlier.lastSourceUpdateAt).toBe(executionAt);
    expect(revised.lastSourceUpdateAt).toBe(revisionAt);
    for (const key of ['duration', 'load', 'repetitions', 'tonnage', 'substitutions'] as const) {
      const original = earlier.metrics.find((metric) => metric.key === key);
      const afterFeedback = revised.metrics.find((metric) => metric.key === key);
      expect(afterFeedback).toMatchObject({
        status: 'available', value: original?.value, lastSourceUpdateAt: executionAt,
      });
      expect(revised.technical?.indicators.find((item) => item.key === key)?.observations)
        .toEqual(earlier.technical?.indicators.find((item) => item.key === key)?.observations);
    }
    expect(revised.metrics.find((metric) => metric.key === 'pse')).toMatchObject({
      value: 7, lastSourceUpdateAt: revisionAt,
    });
    expect(revised.metrics.find((metric) => metric.key === 'psr')).toMatchObject({
      value: 8, lastSourceUpdateAt: revisionAt,
    });
    expect(revised.technical?.indicators.find((item) => item.key === 'pse')?.observations)
      .toEqual([{ sessionId: 'res-feedback', releaseId: 'release-1',
        sourceId: 'feedback-v2', updatedAt: revisionAt }]);
    const restricted = calculateWeeklyTrainingEvolution({
      period, audience: 'student', sessions: [{ ...session, feedback: [] }],
    });
    expect(restricted.lastSourceUpdateAt).toBe(executionAt);
    expect(restricted.technical).toBeUndefined();
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
    first.execution!.plannedExercises = [plannedUnit('p-1', 'squat', 'Agachamento')];
    first.execution!.items = [{
      plannedUnitId: 'p-1', plannedSetId: 'set-a', setNumber: 1, outcome: 'full', loadKg: 40, repetitions: 8,
    }];
    const second = executed('res-2', '2026-11-04', 'resistance');
    second.execution!.plannedExercises = [plannedUnit('p-2', 'squat', 'Agachamento')];
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
      plannedUnit('p1', 'squat', 'Agachamento', 'principal', 1),
      plannedUnit('p2', 'press', 'Supino', 'principal', 2),
    ];
    resistance.execution!.items = [
      { plannedUnitId: 'p1', setNumber: 1, outcome: 'full', loadKg: 40, repetitions: 8 },
      { plannedUnitId: 'p2', setNumber: 1, outcome: 'full', loadKg: 30, repetitions: 10 },
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

  it('A-001: mantém unidades separadas do mesmo exercício por seção, ordem, bloco e agrupamento', () => {
    const workout = executed('weights', '2026-11-02', 'resistance');
    workout.execution!.plannedExercises = [
      plannedUnit('warmup', 'squat', 'Agachamento', 'aquecimento', 1),
      plannedUnit('main', 'squat', 'Agachamento', 'principal', 1),
      plannedUnit('main-2', 'squat', 'Agachamento', 'principal', 2),
      plannedUnit('main-block', 'squat', 'Agachamento', 'principal', 3, '[[1,"principal"]]'),
      plannedUnit('main-group', 'squat', 'Agachamento', 'principal', 4, '[]', '["bi_set",1,1]'),
    ];
    workout.execution!.items = workout.execution!.plannedExercises.map((unit, index) => ({
      plannedUnitId: unit.plannedUnitId, plannedSetId: `s-${index}`, setNumber: 1,
      outcome: 'full', loadKg: 20 + index * 10, repetitions: 8,
    }));
    const result = calculateWeeklyTrainingEvolution({ period, audience: 'student', sessions: [workout] });
    expect(result.series.filter((item) => item.key === 'load')).toHaveLength(5);
    expect(result.series.filter((item) => item.key === 'repetitions')).toHaveLength(5);
    expect(result.metrics.find((item) => item.key === 'load')).toMatchObject({
      status: 'incomparable', value: null, sampleCount: 5,
    });
  });

  it('A-001: sessões distintas com mesmo contexto explícito seguem comparáveis', () => {
    const a = executed('a', '2026-11-02', 'resistance');
    const b = executed('b', '2026-11-04', 'resistance');
    a.execution!.plannedExercises = [plannedUnit('a-main', 'squat', 'Agachamento', 'principal', 1)];
    b.execution!.plannedExercises = [plannedUnit('b-main', 'squat', 'Agachamento', 'principal', 1)];
    a.execution!.items = [{ plannedUnitId: 'a-main', setNumber: 1, outcome: 'full', loadKg: 40, repetitions: 8 }];
    b.execution!.items = [{ plannedUnitId: 'b-main', setNumber: 1, outcome: 'full', loadKg: 42, repetitions: 8 }];
    const result = calculateWeeklyTrainingEvolution({ period, audience: 'professor', sessions: [a, b] });
    expect(result.metrics.find((item) => item.key === 'load')).toMatchObject({
      status: 'available', value: 42, sampleCount: 2,
    });
    expect(result.series.filter((item) => item.key === 'load')).toHaveLength(1);
    expect(result.series.find((item) => item.key === 'load')?.technical?.sources).toHaveLength(2);
  });

  it('A-001: snapshots legados e posições ambíguas preservam medições isoladas, não tendências', () => {
    const workout = executed('a', '2026-11-02', 'resistance');
    workout.execution!.plannedExercises = [
      { plannedUnitId: 'old', catalogExerciseId: 'squat', name: 'Agachamento' },
      plannedUnit('duplicate-1', 'press', 'Supino'),
      plannedUnit('duplicate-2', 'press', 'Supino'),
    ];
    workout.execution!.items = [
      { plannedUnitId: 'old', setNumber: 1, outcome: 'full', loadKg: 20, repetitions: 8 },
      { plannedUnitId: 'duplicate-1', setNumber: 1, outcome: 'full', loadKg: 30, repetitions: 8 },
      { plannedUnitId: 'duplicate-2', setNumber: 1, outcome: 'full', loadKg: 35, repetitions: 8 },
    ];
    const result = calculateWeeklyTrainingEvolution({ period, audience: 'student', sessions: [workout] });
    expect(result.series.filter((item) => item.key === 'load')).toHaveLength(3);
    expect(result.metrics.find((item) => item.key === 'load')).toMatchObject({
      status: 'incomparable', value: null, sampleCount: 3,
    });
  });

  it('A-002: separa pace entre métodos contínuo e intervalado sem produzir média fictícia', () => {
    const steady = executed('steady', '2026-11-02', 'cyclic');
    const interval = executed('interval', '2026-11-04', 'cyclic');
    steady.method = ' Corrida   CONTÍNUA ';
    interval.method = 'Corrida intervalada';
    steady.execution!.sessionValues.pace = '04:00';
    interval.execution!.sessionValues.pace = '07:00';
    const result = calculateWeeklyTrainingEvolution({ period, audience: 'student', sessions: [steady, interval] });
    expect(result.metrics.find((item) => item.key === 'pace')).toMatchObject({
      status: 'incomparable', value: null, sampleCount: 2,
    });
    expect(result.series.filter((item) => item.key === 'pace')).toHaveLength(2);
  });

  it('A-002: métodos iguais com estruturas diferentes não geram média cruzada', () => {
    const steady = executed('steady', '2026-11-02', 'cyclic');
    const intervals = executed('intervals', '2026-11-04', 'cyclic');
    steady.method = 'Corrida';
    intervals.method = 'corrida';
    steady.cyclicStructure = '[["work",null,null,[]]]';
    intervals.cyclicStructure = '[["repeat",null,4,[["work",null,null,[]]]]]';
    steady.execution!.sessionValues.pace = '05:00';
    intervals.execution!.sessionValues.pace = '06:00';
    const result = calculateWeeklyTrainingEvolution({ period, audience: 'student', sessions: [steady, intervals] });
    expect(result.metrics.find((item) => item.key === 'pace')).toMatchObject({
      status: 'incomparable', value: null, sampleCount: 2,
    });
    expect(result.series.filter((item) => item.key === 'pace')).toHaveLength(2);
  });

  it('A-002: sem contexto histórico de método/etapas, pace não é tendência comparável', () => {
    const a = executed('a', '2026-11-02', 'cyclic');
    const b = executed('b', '2026-11-04', 'cyclic');
    a.method = null;
    b.method = null;
    a.execution!.sessionValues.pace = '05:00';
    b.execution!.sessionValues.pace = '05:30';
    const result = calculateWeeklyTrainingEvolution({ period, audience: 'professor', sessions: [a, b] });
    expect(result.metrics.find((item) => item.key === 'pace')).toMatchObject({
      status: 'incomparable', value: null, sampleCount: 2,
    });
    expect(result.series.filter((item) => item.key === 'pace')).toHaveLength(2);
    expect(result.technical?.indicators.find((item) => item.key === 'pace')?.observations).toHaveLength(2);
  });

  it('A-003: modalidade desconhecida ou inválida não prova comparabilidade nem vaza dados', () => {
    const a = executed('a', '2026-11-02', 'unknown');
    const b = executed('b', '2026-11-04', 'unknown');
    const invalid = executed('c', '2026-11-05', 'cyclic+invented');
    a.execution!.sessionValues.durationSec = 1800;
    b.execution!.sessionValues.durationSec = 3600;
    invalid.execution!.sessionValues.durationSec = 600;
    const student = calculateWeeklyTrainingEvolution({ period, audience: 'student', sessions: [a, b, invalid] });
    expect(student.metrics.find((item) => item.key === 'duration')).toMatchObject({
      status: 'incomparable', value: null, sampleCount: 3,
    });
    expect(student.series.filter((item) => item.key === 'duration')).toHaveLength(3);
    expect(student.series.every((item) => item.technical === undefined)).toBe(true);
    expect(JSON.stringify(student)).not.toMatch(/release-1|"sessionId"/);
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
    // A-017: explicit zero remains a recorded reading, but a substituted
    // stage does not certify the sport of that session for comparison.
    expect(student.metrics.find((item) => item.key === 'duration')).toMatchObject({
      status: 'incomparable', value: null, sampleCount: 1,
    });
    expect(student.series.filter((item) => item.key === 'duration')).toMatchObject([
      { points: [{ date: '2026-11-04', value: 0 }] },
    ]);
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
    expect(student.metrics.map((item) => item.key)).not.toContain('consistency');
  });


  it('A-004: preserva leitura de carga com modalidade histórica desconhecida sem gerar agregação comparável', () => {
    const historical = executed('legacy-resistance', '2026-11-02', 'unknown');
    historical.execution!.plannedExercises = [plannedUnit('unit-1', 'squat', 'Agachamento')];
    historical.execution!.items = [{
      plannedUnitId: 'unit-1', setNumber: 1, outcome: 'full', loadKg: 40, repetitions: 10,
    }];
    const output = calculateWeeklyTrainingEvolution({ period, sessions: [historical], audience: 'student' });
    expect(output.metrics.find((m) => m.key === 'tonnage'))
      .toMatchObject({ status: 'incomparable', value: null, sampleCount: 1 });
    expect(output.series.filter((entry) => entry.key === 'tonnage')).toMatchObject([
      { modality: 'unknown', points: [{ date: '2026-11-02', value: 400 }] },
    ]);
    expect(output.metrics.find((m) => m.key === 'load'))
      .toMatchObject({ status: 'incomparable', value: null, sampleCount: 1 });
    expect(output.series.find((entry) => entry.key === 'load')?.technical).toBeUndefined();
  });

  it('A-005: não transforma rascunho em volume executado ao encerrar sessão parcial', () => {
    const partial = executed('partial-1', '2026-11-03', 'resistance', 'partial');
    partial.execution!.plannedExercises = [plannedUnit('unit-1', 'squat', 'Agachamento')];
    partial.execution!.items = [
      { plannedUnitId: 'unit-1', setNumber: 1, completedAt: null,
        loadKg: 99, repetitions: 99 },
      { plannedUnitId: 'unit-1', setNumber: 2, outcome: 'full', loadKg: 40, repetitions: 10 },
      { plannedUnitId: 'unit-1', setNumber: 3, outcome: 'partial', loadKg: 20, repetitions: 5 },
      { plannedUnitId: 'unit-1', setNumber: 4, completedAt: '2026-11-03T12:00:00.000Z',
        loadKg: 30, repetitions: 6 },
      { plannedUnitId: 'unit-1', setNumber: 5, outcome: 'not_performed' },
    ];
    const output = calculateWeeklyTrainingEvolution({ period, sessions: [partial], audience: 'professor' });
    expect(output.counts.partialSessions).toBe(1);
    expect(output.adherence.value).toBe(0);
    expect(output.metrics.find((m) => m.key === 'tonnage'))
      .toMatchObject({ status: 'available', value: 680, sampleCount: 1 });
    const loads = output.series.filter((entry) => entry.key === 'load');
    expect(loads).toHaveLength(3);
    expect(loads.flatMap((entry) => entry.points.map((point) => point.value)).sort((a, b) => a - b))
      .toEqual([20, 30, 40]);
    expect(output.technical?.indicators.find((m) => m.key === 'repetitions')?.observations).toHaveLength(3);

    const onlyDraft = executed('partial-draft', '2026-11-04', 'resistance', 'partial');
    onlyDraft.execution!.plannedExercises = [plannedUnit('unit-2', 'squat', 'Agachamento')];
    onlyDraft.execution!.items = [{ plannedUnitId: 'unit-2', setNumber: 1,
      loadKg: 99, repetitions: 99, completedAt: null }];
    const noVolume = calculateWeeklyTrainingEvolution({ period, sessions: [onlyDraft], audience: 'student' });
    expect(noVolume.metrics.find((m) => m.key === 'tonnage'))
      .toMatchObject({ status: 'insufficient_data', value: null, sampleCount: 0 });
    expect(noVolume.series.filter((entry) => entry.key === 'load')).toEqual([]);
  });

  it('A-006: separa distâncias da corrida e do ciclismo, preservando somas somente do mesmo tipo', () => {
    const run = executed('run', '2026-11-02', 'cyclic');
    run.method = 'Corrida contínua';
    run.execution!.sessionValues.distanceKm = 5;
    const bike = executed('bike', '2026-11-04', 'cyclic');
    bike.method = 'Ciclismo contínuo';
    bike.execution!.sessionValues.distanceKm = 30;
    const crossSport = calculateWeeklyTrainingEvolution({ period, sessions: [run, bike], audience: 'student' });
    expect(crossSport.metrics.find((m) => m.key === 'distance'))
      .toMatchObject({ status: 'incomparable', value: null, sampleCount: 2 });
    expect(crossSport.series.filter((entry) => entry.key === 'distance')).toHaveLength(2);
    expect(crossSport.series.filter((entry) => entry.key === 'distance')
      .flatMap((entry) => entry.points.map((point) => point.value)).sort((a, b) => a - b))
      .toEqual([5, 30]);

    const anotherRun = executed('run-again', '2026-11-06', 'cyclic');
    anotherRun.method = '  CORRIDA  CONTÍNUA ';
    anotherRun.execution!.sessionValues.distanceKm = 3;
    const compatible = calculateWeeklyTrainingEvolution({
      period, sessions: [run, anotherRun], audience: 'student',
    });
    expect(compatible.metrics.find((m) => m.key === 'distance'))
      .toMatchObject({ status: 'available', value: 8, sampleCount: 2 });
    expect(compatible.series.filter((entry) => entry.key === 'distance')).toHaveLength(1);
  });

  it('A-006: topologia idêntica sem método não prova mesmo esporte', () => {
    const a = executed('a', '2026-11-02', 'cyclic');
    const b = executed('b', '2026-11-04', 'cyclic');
    a.method = null;
    b.method = null;
    a.cyclicStructure = '[["work",null,1,[]]]';
    b.cyclicStructure = a.cyclicStructure;
    a.execution!.sessionValues = { distanceKm: 5, pace: '05:00' };
    b.execution!.sessionValues = { distanceKm: 30, pace: '06:00' };
    const output = calculateWeeklyTrainingEvolution({ period, sessions: [a, b], audience: 'student' });
    for (const key of ['distance', 'pace'] as const) {
      expect(output.metrics.find((m) => m.key === key))
        .toMatchObject({ status: 'incomparable', value: null, sampleCount: 2 });
      expect(output.series.filter((entry) => entry.key === key)).toHaveLength(2);
    }
  });

  it('A-007: método genérico idêntico não certifica esporte nem agrega distância/pace', () => {
    const run = executed('run-generic', '2026-11-02', 'cyclic');
    const bike = executed('bike-generic', '2026-11-04', 'cyclic');
    run.method = 'CEXT';
    bike.method = ' CEXT ';
    run.cyclicStructure = '[["work",null,null,[]]]';
    bike.cyclicStructure = run.cyclicStructure;
    run.execution!.sessionValues = { distanceKm: 5, pace: '05:00', durationSec: 1800 };
    bike.execution!.sessionValues = { distanceKm: 30, pace: '02:00', durationSec: 3600 };
    const student = calculateWeeklyTrainingEvolution({ period, sessions: [run, bike], audience: 'student' });
    for (const key of ['duration', 'distance', 'pace'] as const) {
      expect(student.metrics.find((metric) => metric.key === key))
        .toMatchObject({ status: 'incomparable', value: null, sampleCount: 2 });
      expect(student.series.filter((series) => series.key === key)).toHaveLength(2);
    }
    expect(student.series.every((series) => series.technical === undefined)).toBe(true);

    // A method containing incompatible sport markers must not be trusted either.
    run.method = 'Corrida e ciclismo contínuo';
    const mixed = calculateWeeklyTrainingEvolution({ period, sessions: [run], audience: 'professor' });
    expect(mixed.metrics.find((metric) => metric.key === 'distance'))
      .toMatchObject({ status: 'incomparable', value: null, sampleCount: 1 });
    expect(mixed.technical?.indicators.find((metric) => metric.key === 'distance')?.observations)
      .toHaveLength(1);
  });

  it('A-008: não soma o total repeat com as medições das etapas filhas', () => {
    const run = executed('run-repeat', '2026-11-02', 'cyclic');
    run.execution!.plannedCyclicStages = [
      { id: 'repeat-parent', kind: 'repeat', parentStageId: null },
      { id: 'child-a', kind: 'work', parentStageId: 'repeat-parent' },
    ];
    run.execution!.sessionValues.cyclicStages = [
      { plannedStageId: 'repeat-parent', iteration: 1, outcome: 'full',
        durationSec: 600, distanceMeters: 5000 },
      { plannedStageId: 'child-a', iteration: 1, outcome: 'full',
        durationSec: 300, distanceMeters: 2500 },
      { plannedStageId: 'child-a', iteration: 2, outcome: 'full',
        durationSec: 300, distanceMeters: 2500 },
    ];
    const project = () => calculateWeeklyTrainingEvolution({ period, sessions: [run], audience: 'student' });
    expect(project().metrics.find((metric) => metric.key === 'duration'))
      .toMatchObject({ status: 'available', value: 10 });
    expect(project().metrics.find((metric) => metric.key === 'distance'))
      .toMatchObject({ status: 'available', value: 5 });

    // Missing aggregate: keep both confirmed iterations. Parent-only is valid too.
    run.execution!.sessionValues.cyclicStages = run.execution!.sessionValues.cyclicStages!.slice(1);
    expect(project().metrics.find((metric) => metric.key === 'duration')?.value).toBe(10);
    expect(project().metrics.find((metric) => metric.key === 'distance')?.value).toBe(5);
    run.execution!.sessionValues.cyclicStages = [
      { plannedStageId: 'repeat-parent', outcome: 'full', durationSec: 600, distanceMeters: 5000 },
    ];
    expect(project().metrics.find((metric) => metric.key === 'duration')?.value).toBe(10);
    expect(project().metrics.find((metric) => metric.key === 'distance')?.value).toBe(5);
  });

  it('A-008: reconcilia métricas independentes e outros estágios fora de repeat', () => {
    const run = executed('run-topology', '2026-11-03', 'cyclic', 'partial');
    run.execution!.plannedCyclicStages = [
      { id: 'warmup', kind: 'warmup', parentStageId: null },
      { id: 'repeat', kind: 'repeat', parentStageId: null },
      { id: 'child', kind: 'work', parentStageId: 'repeat' },
    ];
    run.execution!.sessionValues.cyclicStages = [
      { plannedStageId: 'warmup', outcome: 'full', durationSec: 120, distanceMeters: 500 },
      { plannedStageId: 'repeat', outcome: 'partial', durationSec: 600 },
      { plannedStageId: 'child', iteration: 1, outcome: 'full', durationSec: 300, distanceMeters: 2500 },
      { plannedStageId: 'child', iteration: 2, outcome: 'full', durationSec: 300, distanceMeters: 2500 },
    ];
    const result = calculateWeeklyTrainingEvolution({ period, sessions: [run], audience: 'student' });
    expect(result.metrics.find((m) => m.key === 'duration'))
      .toMatchObject({ status: 'available', value: 12 });
    expect(result.metrics.find((m) => m.key === 'distance'))
      .toMatchObject({ status: 'available', value: 5.5 });
    expect(result.adherence.value).toBe(0);

    // Explicit zero is an authoritative parent total, never replaced by child totals.
    run.execution!.sessionValues.cyclicStages![1].distanceMeters = 0;
    const zero = calculateWeeklyTrainingEvolution({ period, sessions: [run], audience: 'student' });
    expect(zero.metrics.find((m) => m.key === 'distance')?.value).toBe(0.5);
  });

  it('A-008: histórico ambíguo não infere total, mas mantém leitura explícita da sessão', () => {
    const legacy = executed('legacy', '2026-11-04', 'cyclic');
    legacy.execution!.sessionValues.cyclicStages = [
      { plannedStageId: 'possibly-repeat', outcome: 'full', distanceMeters: 5000, durationSec: 600 },
      { plannedStageId: 'child', outcome: 'full', distanceMeters: 5000, durationSec: 600 },
    ];
    const unknown = calculateWeeklyTrainingEvolution({ period, sessions: [legacy], audience: 'student' });
    for (const key of ['duration', 'distance'] as const) {
      expect(unknown.metrics.find((m) => m.key === key))
        .toMatchObject({ status: 'incomparable', value: null, sampleCount: 0 });
    }
    legacy.execution!.sessionValues.distanceKm = 5;
    const explicit = calculateWeeklyTrainingEvolution({ period, sessions: [legacy], audience: 'student' });
    expect(explicit.metrics.find((m) => m.key === 'distance'))
      .toMatchObject({ status: 'available', value: 5 });
  });



  it('A-017: substituição cíclica não cria série de corrida e preserva repeat', () => {
    const normal = executed('normal-run', '2026-11-02', 'cyclic');
    normal.cyclicStructure = 'same-captured-method-and-topology';
    normal.execution!.plannedCyclicStages = [
      { id: 'normal-stage', kind: 'work', parentStageId: null, position: 1 },
    ];
    normal.execution!.sessionValues.cyclicStages = [
      { plannedStageId: 'normal-stage', outcome: 'full',
        durationSec: 600, distanceMeters: 1000, paceMinPerKm: 5 },
    ];
    const replaced = executed('replaced-run', '2026-11-04', 'cyclic', 'partial');
    replaced.cyclicStructure = normal.cyclicStructure;
    replaced.execution!.plannedCyclicStages = [
      { id: 'repeat-parent', kind: 'repeat', parentStageId: null, position: 1 },
      { id: 'repeat-child', kind: 'work', parentStageId: 'repeat-parent', position: 1 },
      { id: 'external', kind: 'cooldown', parentStageId: null, position: 2 },
    ];
    replaced.execution!.sessionValues.cyclicStages = [
      { plannedStageId: 'repeat-parent', outcome: 'substituted',
        durationSec: 600, distanceMeters: 1500, paceMinPerKm: 5.5 },
      { plannedStageId: 'repeat-child', iteration: 1, outcome: 'full',
        durationSec: 600, distanceMeters: 1500, paceMinPerKm: 5.5 },
      { plannedStageId: 'external', outcome: 'full',
        durationSec: 120, distanceMeters: 100, paceMinPerKm: 6.5 },
    ];
    const project = () => calculateWeeklyTrainingEvolution({
      period, sessions: [normal, replaced], audience: 'student',
    });
    const student = project();
    for (const key of ['duration', 'distance', 'pace'] as const) {
      expect(student.metrics.find((metric) => metric.key === key))
        .toMatchObject({ status: 'incomparable', value: null, sampleCount: 3 });
      expect(student.series.filter((series) => series.key === key)).toHaveLength(3);
    }
    const replacementDistances = student.series.filter((series) => series.key === 'distance'
      && series.points[0]?.date === '2026-11-04')
      .map((series) => series.points[0]?.value).sort((a, b) => a - b);
    expect(replacementDistances).toEqual([0.1, 1.5]); // Parent total replaces child.
    expect(student.adherence.value).toBe(50); // Partial remains separate.
    expect(JSON.stringify(student)).not.toMatch(/normal-stage|repeat-parent|replaced-run|release-1/);

    // A recorded total is a single observation, not evidence of the performed sport.
    replaced.execution!.sessionValues.durationSec = 840;
    replaced.execution!.sessionValues.distanceKm = 1.6;
    replaced.execution!.sessionValues.pace = '05:40';
    const explicit = project();
    for (const key of ['duration', 'distance', 'pace'] as const) {
      expect(explicit.metrics.find((metric) => metric.key === key))
        .toMatchObject({ status: 'incomparable', value: null, sampleCount: 2 });
      expect(explicit.series.filter((series) => series.key === key)).toHaveLength(2);
    }
    expect(explicit.series.find((series) => series.key === 'distance'
      && series.points[0]?.date === '2026-11-04')?.points[0]?.value).toBe(1.6);
  });

  it('A-009: última carga/repetições seguem a execução cronológica, não o ID', () => {
    const early = executed('z-early', '2026-11-02', 'resistance');
    const late = executed('a-late', '2026-11-02', 'resistance');
    early.executionFinishedAt = '2026-11-02T08:00:00.000Z';
    late.executionFinishedAt = '2026-11-02T18:00:00.000Z';
    early.execution!.plannedExercises = [plannedUnit('unit-early', 'squat', 'Agachamento')];
    late.execution!.plannedExercises = [plannedUnit('unit-late', 'squat', 'Agachamento')];
    early.execution!.items = [{ plannedUnitId: 'unit-early', setNumber: 1, outcome: 'full',
      loadKg: 30, repetitions: 8 }];
    late.execution!.items = [{ plannedUnitId: 'unit-late', setNumber: 1, outcome: 'full',
      loadKg: 50, repetitions: 5 }];
    const project = () => calculateWeeklyTrainingEvolution({ period, sessions: [early, late], audience: 'student' });
    expect(project().metrics.find((item) => item.key === 'load'))
      .toMatchObject({ status: 'available', value: 50, sampleCount: 2 });
    expect(project().metrics.find((item) => item.key === 'repetitions'))
      .toMatchObject({ status: 'available', value: 5, sampleCount: 2 });
    expect(project().series.find((item) => item.key === 'load')?.points)
      .toEqual([{ date: '2026-11-02', value: 30 }, { date: '2026-11-02', value: 50 }]);

    // A postponed session can be completed after a later scheduled session.
    early.date = '2026-11-06';
    late.date = '2026-11-02';
    early.executionFinishedAt = '2026-11-06T08:00:00.000Z';
    late.executionFinishedAt = '2026-11-07T18:00:00.000Z';
    expect(project().metrics.find((item) => item.key === 'load')?.value).toBe(50);
  });

  it('A-009: ausências e empates de conclusão isolam a ordem temporal desconhecida', () => {
    const early = executed('old', '2026-11-02', 'resistance');
    const late = executed('new', '2026-11-04', 'resistance');
    early.execution!.plannedExercises = [plannedUnit('u1', 'squat', 'Agachamento')];
    late.execution!.plannedExercises = [plannedUnit('u2', 'squat', 'Agachamento')];
    early.execution!.items = [{ plannedUnitId: 'u1', setNumber: 1, outcome: 'full',
      loadKg: 30, repetitions: 8 }];
    late.execution!.items = [{ plannedUnitId: 'u2', setNumber: 1, outcome: 'full',
      loadKg: 50, repetitions: 5 }];
    const project = () => calculateWeeklyTrainingEvolution({ period, sessions: [early, late], audience: 'student' });
    late.executionFinishedAt = null;
    for (const key of ['load', 'repetitions'] as const) {
      expect(project().metrics.find((metric) => metric.key === key))
        .toMatchObject({ status: 'incomparable', value: null, sampleCount: 2 });
      expect(project().series.filter((series) => series.key === key)
        .every((series) => series.points.length === 1)).toBe(true);
    }
    late.executionFinishedAt = early.executionFinishedAt;
    expect(project().metrics.find((metric) => metric.key === 'load')?.status).toBe('incomparable');
    late.execution!.items[0].completedAt = '2026-11-07T20:00:00.000Z';
    expect(project().metrics.find((metric) => metric.key === 'load'))
      .toMatchObject({ status: 'available', value: 50 });
  });

  it('A-010: topologia histórica inválida não se funde com plano cíclico vazio válido', () => {
    const empty = executed('empty', '2026-11-02', 'cyclic');
    const corrupt = executed('corrupt', '2026-11-04', 'cyclic');
    empty.method = 'Corrida contínua';
    corrupt.method = 'Corrida contínua';
    empty.cyclicStructure = '[]';
    corrupt.cyclicStructure = null;
    empty.execution!.sessionValues = { durationSec: 1800, distanceKm: 5, pace: '05:00' };
    corrupt.execution!.sessionValues = { durationSec: 2400, distanceKm: 8, pace: '06:00' };
    const project = () => calculateWeeklyTrainingEvolution({ period, sessions: [empty, corrupt], audience: 'student' });
    for (const key of ['duration', 'distance', 'pace'] as const) {
      expect(project().metrics.find((metric) => metric.key === key))
        .toMatchObject({ status: 'incomparable', value: null, sampleCount: 2 });
      expect(project().series.filter((series) => series.key === key)).toHaveLength(2);
    }
    corrupt.cyclicStructure = '[]';
    expect(project().metrics.find((metric) => metric.key === 'distance'))
      .toMatchObject({ status: 'available', value: 13, sampleCount: 2 });
  });

  it('A-011: counts substituted repeat leaves once, with parent-only and external stages preserved', () => {
    const run = executed('sub-repeat', '2026-11-02', 'cyclic', 'partial');
    run.execution!.plannedCyclicStages = [
      { id: 'parent', kind: 'repeat', parentStageId: null },
      { id: 'child', kind: 'work', parentStageId: 'parent' },
      { id: 'outside', kind: 'work', parentStageId: null },
    ];
    const parent = { plannedStageId: 'parent', outcome: 'substituted' as const, iteration: 1 };
    const first = { plannedStageId: 'child', outcome: 'substituted' as const, iteration: 1 };
    const second = { plannedStageId: 'child', outcome: 'substituted' as const, iteration: 2 };
    const outside = { plannedStageId: 'outside', outcome: 'substituted' as const, iteration: 1 };
    const result = () => calculateWeeklyTrainingEvolution({
      period, sessions: [run], audience: 'student',
    }).metrics.find((metric) => metric.key === 'substitutions');

    run.execution!.sessionValues.cyclicStages = [parent, first, second];
    expect(result()).toMatchObject({ status: 'available', value: 2, sampleCount: 1 });
    run.execution!.sessionValues.cyclicStages = [parent];
    expect(result()?.value).toBe(1);
    run.execution!.sessionValues.cyclicStages = [first, second];
    expect(result()?.value).toBe(2);
    run.execution!.sessionValues.cyclicStages = [parent, first, second, outside];
    expect(result()?.value).toBe(3);
    expect(calculateWeeklyTrainingEvolution({ period, sessions: [run], audience: 'student' })
      .adherence.value).toBe(0);
  });

  it('A-011: ambiguous and corrupt cyclic histories never generate a substitution total', () => {
    const run = executed('sub-legacy', '2026-11-03', 'cyclic');
    const parent = { plannedStageId: 'parent', outcome: 'substituted' as const };
    const child = { plannedStageId: 'child', outcome: 'substituted' as const };
    const result = () => calculateWeeklyTrainingEvolution({
      period, sessions: [run], audience: 'student',
    }).metrics.find((metric) => metric.key === 'substitutions');
    run.execution!.sessionValues.cyclicStages = [parent, child];
    expect(result()).toMatchObject({ status: 'incomparable', value: null });
    run.execution!.sessionValues.cyclicStages = [child];
    expect(result()?.value).toBe(1);
    run.execution!.plannedCyclicStages = [
      { id: 'child', kind: 'work', parentStageId: 'missing-repeat' },
    ];
    expect(result()).toMatchObject({ status: 'incomparable', value: null });
    run.execution!.plannedCyclicStages = [];
    expect(result()).toMatchObject({ status: 'incomparable', value: null });
    run.execution!.plannedCyclicStages = [
      { id: 'child', kind: 'work', parentStageId: null },
    ];
    run.execution!.sessionValues.cyclicStages = [child, child];
    expect(result()).toMatchObject({ status: 'incomparable', value: null });
  });

  it('A-012: counts substituted resistance groups even without substituted sets', () => {
    const run = executed('sub-group-only', '2026-11-04', 'resistance');
    run.execution!.plannedResistanceGroups = [{ id: 'group-a', memberUnitIds: ['unit-a'] }];
    const group = { plannedGroupId: 'group-a', outcome: 'substituted' as const };
    const result = () => calculateWeeklyTrainingEvolution({
      period, sessions: [run], audience: 'student',
    }).metrics.find((metric) => metric.key === 'substitutions');
    run.execution!.sessionValues.resistanceGroups = [group];
    expect(result()).toMatchObject({ status: 'available', value: 1, sampleCount: 1 });
    run.execution!.sessionValues.resistanceGroups = [{ ...group, outcome: 'full' }];
    expect(result()?.value).toBe(0);
    run.execution!.sessionValues.resistanceGroups = [group];
    const student = calculateWeeklyTrainingEvolution({ period, sessions: [run], audience: 'student' });
    const professor = calculateWeeklyTrainingEvolution({ period, sessions: [run], audience: 'professor' });
    expect(student.metrics.find((metric) => metric.key === 'substitutions')?.value)
      .toBe(professor.metrics.find((metric) => metric.key === 'substitutions')?.value);
    expect(JSON.stringify(student)).not.toMatch(/group-a|unit-a|release-1|training-evolution-v1/);
  });

  it('A-012: reconciles group aggregates with their member sets, preserving external units', () => {
    const run = executed('sub-group-members', '2026-11-05', 'resistance');
    run.execution!.plannedResistanceGroups = [
      { id: 'group-a', memberUnitIds: ['unit-a', 'unit-b'] },
      { id: 'group-b', memberUnitIds: ['unit-c'] },
    ];
    run.execution!.sessionValues.resistanceGroups = [
      { plannedGroupId: 'group-a', outcome: 'substituted' },
    ];
    const one = { plannedUnitId: 'unit-a', setNumber: 1, outcome: 'substituted' as const };
    const two = { plannedUnitId: 'unit-b', setNumber: 1, outcome: 'substituted' as const };
    const external = { plannedUnitId: 'unit-c', setNumber: 1, outcome: 'substituted' as const };
    const metric = () => calculateWeeklyTrainingEvolution({
      period, sessions: [run], audience: 'student',
    }).metrics.find((entry) => entry.key === 'substitutions');
    run.execution!.items = [one];
    expect(metric()).toMatchObject({ status: 'available', value: 1 });
    run.execution!.items = [one, two];
    expect(metric()?.value).toBe(2);
    run.execution!.items = [one, external];
    expect(metric()?.value).toBe(2);
    run.execution!.items = [external];
    expect(metric()?.value).toBe(2);
  });

  it('A-012: rejects unverifiable group-to-set overlap without a matching captured graph', () => {
    const run = executed('sub-unknown-group', '2026-11-06', 'resistance');
    run.execution!.sessionValues.resistanceGroups = [
      { plannedGroupId: 'group-a', outcome: 'substituted' },
    ];
    const metric = () => calculateWeeklyTrainingEvolution({
      period, sessions: [run], audience: 'student',
    }).metrics.find((entry) => entry.key === 'substitutions');
    expect(metric()?.value).toBe(1);
    run.execution!.items = [{ plannedUnitId: 'unit-a', setNumber: 1, outcome: 'substituted' }];
    expect(metric()).toMatchObject({ status: 'incomparable', value: null });
    run.execution!.plannedResistanceGroups = [];
    expect(metric()).toMatchObject({ status: 'incomparable', value: null });
    run.execution!.plannedResistanceGroups = [{ id: 'group-a', memberUnitIds: ['unit-a'] }];
    expect(metric()).toMatchObject({ status: 'available', value: 1 });
  });

  it('A-013: preserva pace cíclico confirmado em etapas historicamente equivalentes', () => {
    const first = executed('first', '2026-11-02', 'cyclic');
    const second = executed('second', '2026-11-04', 'cyclic', 'partial');
    for (const session of [first, second]) {
      session.execution!.plannedCyclicStages = [
        { id: `stage-${session.sessionId}`, kind: 'work', parentStageId: null, position: 1 },
      ];
      session.cyclicStructure = '[["work",null,null,[]]]';
    }
    first.execution!.sessionValues.cyclicStages = [{ plannedStageId: 'stage-first', iteration: 1,
      outcome: 'full', durationSec: 312, distanceMeters: 1000, paceMinPerKm: 5.2 }];
    second.execution!.sessionValues.cyclicStages = [{ plannedStageId: 'stage-second', iteration: 1,
      outcome: 'partial', durationSec: 336, distanceMeters: 1000, paceMinPerKm: 5.6 }];
    const student = calculateWeeklyTrainingEvolution({ period, sessions: [second, first], audience: 'student' });
    const professor = calculateWeeklyTrainingEvolution({ period, sessions: [second, first], audience: 'professor' });
    expect(student.metrics.find((entry) => entry.key === 'pace'))
      .toMatchObject({ status: 'available', value: 5.4, sampleCount: 2 });
    expect(student.metrics.find((entry) => entry.key === 'duration')?.value).toBe(10.8);
    expect(student.metrics.find((entry) => entry.key === 'distance')?.value).toBe(2);
    expect(student.series.find((entry) => entry.key === 'pace')?.points)
      .toEqual([{ date: '2026-11-02', value: 5.2 }, { date: '2026-11-04', value: 5.6 }]);
    expect(student.adherence.value).toBe(50); // A partial session never counts as completed.
    expect(JSON.stringify(student)).not.toMatch(/stage-first|stage-second|training-evolution-v1|release-1/);
    expect(professor.technical?.indicators.find((entry) => entry.key === 'pace')?.observations)
      .toMatchObject([
        { sourceId: 'cyclic-stage:stage-first:iteration:1' },
        { sourceId: 'cyclic-stage:stage-second:iteration:1' },
      ]);
  });

  it('A-013: pai repeat com pace prevalece sobre filhos, sem duplicar a leitura', () => {
    const run = executed('repeat-pace', '2026-11-03', 'cyclic');
    run.execution!.plannedCyclicStages = [
      { id: 'parent', kind: 'repeat', parentStageId: null, position: 1 },
      { id: 'work', kind: 'work', parentStageId: 'parent', position: 1 },
      { id: 'external', kind: 'cooldown', parentStageId: null, position: 2 },
    ];
    run.execution!.sessionValues.cyclicStages = [
      { plannedStageId: 'parent', outcome: 'full', paceMinPerKm: 5.4 },
      { plannedStageId: 'work', iteration: 1, outcome: 'full', paceMinPerKm: 5.2 },
      { plannedStageId: 'work', iteration: 2, outcome: 'full', paceMinPerKm: 5.6 },
    ];
    const project = () => calculateWeeklyTrainingEvolution({ period, sessions: [run], audience: 'student' });
    expect(project().metrics.find((entry) => entry.key === 'pace'))
      .toMatchObject({ status: 'available', value: 5.4, sampleCount: 1 });
    run.execution!.sessionValues.cyclicStages!.shift();
    expect(project().metrics.find((entry) => entry.key === 'pace'))
      .toMatchObject({ status: 'incomparable', value: null, sampleCount: 2 });
    run.execution!.sessionValues.cyclicStages = [
      { plannedStageId: 'work', iteration: 1, outcome: 'not_performed', paceMinPerKm: 7 },
      { plannedStageId: 'work', iteration: 2, outcome: 'full', paceMinPerKm: 5.6 },
    ];
    expect(project().metrics.find((entry) => entry.key === 'pace'))
      .toMatchObject({ status: 'available', value: 5.6, sampleCount: 1 });
  });

  it('A-013: metodo ambiguo e grafo invalido preservam ritmo sem inventar tendencia', () => {
    const run = executed('ambiguous-pace', '2026-11-02', 'cyclic');
    run.method = 'CEXT';
    run.execution!.plannedCyclicStages = [{ id: 'stage', kind: 'work', parentStageId: null, position: 1 }];
    run.execution!.sessionValues.cyclicStages = [{ plannedStageId: 'stage', outcome: 'full', paceMinPerKm: 5.5 }];
    const metric = () => calculateWeeklyTrainingEvolution({ period, sessions: [run], audience: 'student' });
    expect(metric().metrics.find((entry) => entry.key === 'pace'))
      .toMatchObject({ status: 'incomparable', value: null, sampleCount: 1 });
    expect(metric().series.filter((entry) => entry.key === 'pace')).toHaveLength(1);
    run.method = 'Corrida contínua';
    run.execution!.plannedCyclicStages![0].parentStageId = 'unlinked';
    expect(metric().metrics.find((entry) => entry.key === 'pace')?.status).toBe('incomparable');
    run.execution!.plannedCyclicStages![0].parentStageId = null;
    run.execution!.sessionValues.cyclicStages!.push({
      plannedStageId: 'stage', outcome: 'full', paceMinPerKm: 7,
    });
    expect(metric().metrics.find((entry) => entry.key === 'pace')?.status).toBe('incomparable');
  });

  it('A-013: itens confirmados preservam duracao, distancia e pace por identidade historica', () => {
    const first = executed('item-a', '2026-11-02', 'cyclic+resistance');
    const second = executed('item-b', '2026-11-04', 'cyclic+resistance');
    for (const run of [first, second]) {
      run.execution!.plannedExercises = [{
        ...plannedUnit(`unit-${run.sessionId}`, 'treadmill', 'Esteira'),
        capturedCapacity: 'cyclic', capturedCategory: 'running',
      }];
      run.cyclicStructure = '[]';
      run.execution!.items = [{ plannedUnitId: `unit-${run.sessionId}`,
        plannedSetId: `set-${run.sessionId}`, setNumber: 1, outcome: 'full',
        durationSec: 1650, distanceKm: 5, pace: '05:30' }];
    }
    const student = calculateWeeklyTrainingEvolution({ period, sessions: [first, second], audience: 'student' });
    const professor = calculateWeeklyTrainingEvolution({ period, sessions: [first, second], audience: 'professor' });
    expect(student.metrics.find((entry) => entry.key === 'duration'))
      .toMatchObject({ status: 'available', value: 55, sampleCount: 2 });
    expect(student.metrics.find((entry) => entry.key === 'distance'))
      .toMatchObject({ status: 'available', value: 10, sampleCount: 2 });
    expect(student.metrics.find((entry) => entry.key === 'pace'))
      .toMatchObject({ status: 'available', value: 5.5, sampleCount: 2 });
    expect(student.series.find((entry) => entry.key === 'pace')?.points).toHaveLength(2);
    expect(JSON.stringify(student)).not.toMatch(/unit-item|set-item|treadmill|training-evolution-v1/);
    expect(professor.technical?.indicators.find((entry) => entry.key === 'pace')?.observations)
      .toMatchObject([{ sourceId: 'execution-item:set-item-a' }, { sourceId: 'execution-item:set-item-b' }]);
  });

  it('A-013: historico de itens sem identidade segue visivel e nao comparavel', () => {
    const first = executed('legacy-item-a', '2026-11-02', 'cyclic+resistance');
    const second = executed('legacy-item-b', '2026-11-04', 'cyclic+resistance');
    for (const run of [first, second]) {
      run.execution!.items = [{ plannedUnitId: 'legacy', setNumber: 1, outcome: 'full',
        durationSec: 1650, distanceKm: 5, pace: '05:30' }];
    }
    const result = calculateWeeklyTrainingEvolution({ period, sessions: [first, second], audience: 'student' });
    for (const key of ['duration', 'distance', 'pace'] as const) {
      expect(result.metrics.find((entry) => entry.key === key))
        .toMatchObject({ status: 'incomparable', value: null, sampleCount: 2 });
      expect(result.series.filter((entry) => entry.key === key)).toHaveLength(2);
    }
  });

  it('A-013: rascunhos e valores invalidos nao viram execucao; zero explicitamente confirmado e preservado', () => {
    const run = executed('item-draft', '2026-11-03', 'cyclic+resistance', 'partial');
    run.execution!.plannedExercises = [{
      ...plannedUnit('unit', 'exercise', 'Esteira'),
      capturedCapacity: 'cyclic', capturedMovementPattern: 'running',
    }];
    run.execution!.items = [{ plannedUnitId: 'unit', setNumber: 1,
      durationSec: 1200, distanceKm: 4, pace: '05:00' }];
    const project = () => calculateWeeklyTrainingEvolution({ period, sessions: [run], audience: 'student' });
    for (const key of ['duration', 'distance', 'pace'] as const) {
      expect(project().metrics.find((entry) => entry.key === key))
        .toMatchObject({ status: 'insufficient_data', sampleCount: 0 });
    }
    run.execution!.items[0].outcome = 'full';
    run.execution!.items[0].durationSec = 0;
    run.execution!.items[0].distanceKm = 0;
    run.execution!.items[0].pace = '00:00';
    for (const key of ['duration', 'distance', 'pace'] as const) {
      expect(project().metrics.find((entry) => entry.key === key))
        .toMatchObject({ status: 'available', value: 0, sampleCount: 1 });
    }
    run.execution!.items[0].pace = '5.5';
    expect(project().metrics.find((entry) => entry.key === 'pace')?.status).toBe('incomparable');
  });

  it('A-013: total de sessao prevalece e etapa + item permanecem isolados sem soma duplicada', () => {
    const run = executed('same-session', '2026-11-03', 'cyclic+resistance');
    run.execution!.plannedCyclicStages = [
      { id: 'stage', kind: 'work', parentStageId: null, position: 1 },
    ];
    run.execution!.plannedExercises = [{
      ...plannedUnit('unit', 'treadmill', 'Esteira'),
      capturedCapacity: 'cyclic', capturedCategory: 'running',
    }];
    run.execution!.sessionValues = {
      durationSec: 1800, distanceKm: 6, pace: '05:00',
      cyclicStages: [{ plannedStageId: 'stage', outcome: 'full', durationSec: 1800,
        distanceMeters: 6000, paceMinPerKm: 5 }],
    };
    run.execution!.items = [{ plannedUnitId: 'unit', setNumber: 1, outcome: 'full',
      durationSec: 1800, distanceKm: 6, pace: '05:00' }];
    const project = () => calculateWeeklyTrainingEvolution({ period, sessions: [run], audience: 'student' });
    for (const [key, value] of [['duration', 30], ['distance', 6], ['pace', 5]] as const) {
      expect(project().metrics.find((entry) => entry.key === key))
        .toMatchObject({ status: 'available', value, sampleCount: 1 });
    }
    run.execution!.sessionValues.durationSec = null;
    run.execution!.sessionValues.distanceKm = null;
    run.execution!.sessionValues.pace = null;
    for (const key of ['duration', 'distance', 'pace'] as const) {
      expect(project().metrics.find((entry) => entry.key === key))
        .toMatchObject({ status: 'incomparable', value: null, sampleCount: 2 });
    }
  });


  it('A-014: exercício resistido em sessão combinada não gera pace ou distância cíclicos', () => {
    const first = executed('squat-a', '2026-11-02', 'cyclic+resistance');
    const second = executed('squat-b', '2026-11-04', 'cyclic+resistance');
    for (const run of [first, second]) {
      run.execution!.plannedExercises = [{
        ...plannedUnit(`squat-unit-${run.sessionId}`, 'squat', 'Agachamento'),
        capturedCapacity: 'resisted', capturedCategory: 'resisted',
      }];
      run.execution!.items = [{
        plannedUnitId: `squat-unit-${run.sessionId}`, setNumber: 1, outcome: 'full',
        durationSec: 900, distanceKm: 5, pace: run === first ? '05:30' : '05:50',
      }];
    }
    const student = calculateWeeklyTrainingEvolution({ period, sessions: [first, second], audience: 'student' });
    const professor = calculateWeeklyTrainingEvolution({ period, sessions: [first, second], audience: 'professor' });
    for (const key of ['pace', 'distance'] as const) {
      expect(student.metrics.find((metric) => metric.key === key))
        .toMatchObject({ status: 'incomparable', value: null, sampleCount: 2 });
      expect(student.series.filter((series) => series.key === key)).toHaveLength(2);
      expect(professor.technical?.indicators.find((indicator) => indicator.key === key)?.observations)
        .toHaveLength(2);
    }
    // Duration is a legitimate execution value independent of sport identity.
    expect(student.metrics.find((metric) => metric.key === 'duration'))
      .toMatchObject({ status: 'available', value: 30 });
    expect(JSON.stringify(student)).not.toMatch(/squat-unit|training-evolution-v1|release-1/);
  });

  it('A-014: categoria genérica, capacidade ausente ou esporte divergente não bastam', () => {
    const run = executed('legacy-cyclic', '2026-11-02', 'cyclic+resistance');
    run.execution!.plannedExercises = [{
      ...plannedUnit('unit', 'catalog', 'Esteira'), capturedCategory: 'running',
    }];
    run.execution!.items = [{ plannedUnitId: 'unit', setNumber: 1, outcome: 'partial',
      pace: '05:00', distanceKm: 3 }];
    const result = () => calculateWeeklyTrainingEvolution({ period, sessions: [run], audience: 'student' });
    for (const key of ['pace', 'distance'] as const) {
      expect(result().metrics.find((metric) => metric.key === key))
        .toMatchObject({ status: 'incomparable', value: null, sampleCount: 1 });
    }
    const plan = run.execution!.plannedExercises[0];
    plan.capturedCapacity = 'cyclic';
    plan.capturedCategory = 'cyclic';
    expect(result().metrics.find((metric) => metric.key === 'pace')?.status).toBe('incomparable');
    plan.capturedMovementPattern = 'cycling'; // Different sport from the frozen running session.
    expect(result().metrics.find((metric) => metric.key === 'pace')?.status).toBe('incomparable');
    plan.capturedCategory = 'running'; // Explicit contradictory historical fields.
    expect(result().metrics.find((metric) => metric.key === 'pace')?.status).toBe('incomparable');
    plan.capturedCategory = 'resisted';
    plan.capturedMovementPattern = 'running';
    expect(result().metrics.find((metric) => metric.key === 'pace')?.status).toBe('incomparable');
    plan.capturedCategory = 'running';
    plan.capturedMovementPattern = 'running or cycling';
    expect(result().metrics.find((metric) => metric.key === 'pace')?.status).toBe('incomparable');
  });

  it('A-014: item cíclico comprovado é comparável; movimento em outro esporte não se mistura', () => {
    const run = executed('treadmill-1', '2026-11-02', 'cyclic+resistance');
    run.execution!.plannedExercises = [{ ...plannedUnit('unit', 'treadmill', 'Esteira'),
      capturedCapacity: 'cyclic', capturedCategory: 'cyclic', capturedMovementPattern: 'running' }];
    run.execution!.items = [{ plannedUnitId: 'unit', setNumber: 1, outcome: 'full',
      pace: '05:30', distanceKm: 5 }];
    const result = () => calculateWeeklyTrainingEvolution({ period, sessions: [run], audience: 'student' });
    expect(result().metrics.find((metric) => metric.key === 'pace'))
      .toMatchObject({ status: 'available', value: 5.5 });
    expect(result().metrics.find((metric) => metric.key === 'distance'))
      .toMatchObject({ status: 'available', value: 5 });
    run.execution!.plannedExercises[0].capturedMovementPattern = 'cycling';
    expect(result().metrics.find((metric) => metric.key === 'pace'))
      .toMatchObject({ status: 'incomparable', value: null });
  });

});
