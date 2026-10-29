import type { TrainingSessionExecutionView } from '@corrida/types';
import {
  captureWorkoutComparisonPlan,
  compareWorkoutSession,
  projectWorkoutComparisonForAudience,
  readCapturedWorkoutComparisonPlan,
  type TrainingComparisonSnapshot,
} from './workout-session-comparison.domain.js';

function planned(): TrainingComparisonSnapshot {
  return {
    id: 'day-1',
    sessionDurationMin: 30, cyclicTimeMin: null, stimulusDurationMin: null,
    targetHrMin: null, targetHrMax: null, targetSpeedMin: null, targetSpeedMax: null,
    paceMin: null, paceMax: null, template: { totalVolumeKm: 5 },
    cyclicStages: [
      { id: 'warmup', parentStageId: null, position: 1, kind: 'warmup',
        durationUnit: 'seconds', durationValue: 300, targetKind: null,
        targetValue: null, targetMin: null, targetMax: null, repeatCount: null },
      { id: 'repeat', parentStageId: null, position: 2, kind: 'repeat',
        durationUnit: null, durationValue: null, targetKind: null,
        targetValue: null, targetMin: null, targetMax: null, repeatCount: 2 },
      { id: 'work', parentStageId: 'repeat', position: 1, kind: 'work',
        durationUnit: 'meters', durationValue: 400, targetKind: 'speed_kmh',
        targetValue: 12, targetMin: null, targetMax: null, repeatCount: null },
    ],
    exercises: [{
      id: 'ex-1', section: 'principal', exerciseOrder: 1, sets: 2, reps: 10,
      load: 20, intervalSec: 60, exercise: { name: 'Nome atual' },
      releasedCatalog: { catalog: { name: 'Nome liberado' } },
      resistanceBlocks: [{
        id: 'block-1', position: 1, kind: 'principal',
        plannedSets: [{
          id: 'set-1', position: 1, repsMin: 8, repsMax: 12,
          loadKg: 20, loadPercent: null, rir: 2, rpe: 7, tempo: '2-0-2', restSec: 60,
        }, {
          id: 'set-2', position: 2, repsMin: 10, repsMax: 10,
          loadKg: 22, loadPercent: null, rir: 1, rpe: 8, tempo: null, restSec: 90,
        }],
      }],
    }],
    resistanceGroups: [{
      id: 'group-1', kind: 'bi_set', position: 1, rounds: 2,
      restBetweenExercisesSec: 30, restBetweenRoundsSec: 75,
      members: [{ workoutExerciseId: 'ex-1', position: 1 }],
    }],
  } as unknown as TrainingComparisonSnapshot;
}

function execution(overrides: Partial<TrainingSessionExecutionView> = {}): TrainingSessionExecutionView {
  return {
    sessionId: 'day-1', status: 'completed', version: 3,
    startedAt: '2026-10-01T14:00:00.000Z', finishedAt: '2026-10-01T14:30:00.000Z',
    currentPauseStartedAt: null, pausedDurationMs: 0, interruptionReason: null,
    origin: { releaseId: 'rel-1', workoutTemplateId: 'tpl-1', trainingPlanId: 'plan-1' },
    sessionValues: {}, items: [], ...overrides,
  };
}

const get = (units: ReturnType<typeof compareWorkoutSession>['units'], id: string) =>
  units.filter((unit) => unit.plannedUnitId === id);

describe('issue #401: granular planned/executed comparison', () => {
  it('preserves equal metrics with zero difference, never a judgement', () => {
    const comparison = compareWorkoutSession(planned(), execution({
      items: [{ plannedUnitId: 'ex-1', plannedSetId: 'set-2', setNumber: 2,
        outcome: 'full', repetitions: 10, loadKg: 22, rir: 1, rpe: 8, restSec: 90 }],
    }), 'captured');
    const set = get(comparison.units, 'set-2')[0];
    expect(set.outcome).toBe('full');
    expect(set.metrics.find((item) => item.key === 'load_kg')).toMatchObject({
      planned: 22, executed: 22, difference: 0, plannedUnit: 'kg',
    });
    expect(set.metrics.find((item) => item.key === 'repetitions')).toMatchObject({
      planned: 10, executed: 10, difference: 0,
    });
    expect(JSON.stringify(comparison)).not.toMatch(/melhora|piora|evolução/i);
  });

  it('keeps missing data null rather than synthesizing zero and compares actual zero', () => {
    const comparison = compareWorkoutSession(planned(), execution(), 'captured');
    const warmup = get(comparison.units, 'warmup')[0];
    expect(warmup.outcome).toBe('not_recorded');
    expect(warmup.metrics[0]).toMatchObject({
      planned: 300, executed: null, difference: null, plannedUnit: 's',
    });
    const withZero = compareWorkoutSession(planned(), execution({
      sessionValues: { cyclicStages: [{ plannedStageId: 'warmup', outcome: 'partial', durationSec: 0 }] },
    }), 'captured');
    expect(get(withZero.units, 'warmup')[0].metrics[0].executed).toBe(0);
  });

  it('distinguishes partial, substituted, not performed and repeated stages with stable IDs', () => {
    const comparison = compareWorkoutSession(planned(), execution({
      sessionValues: {
        cyclicStages: [
          { plannedStageId: 'work', iteration: 1, outcome: 'substituted',
            substitutionNote: 'Bike', distanceMeters: 300, speedKmh: 9 },
          { plannedStageId: 'work', iteration: 2, outcome: 'partial', distanceMeters: 200 },
        ],
        resistanceGroups: [{ plannedGroupId: 'group-1', outcome: 'not_performed' }],
      },
      items: [{ plannedUnitId: 'ex-1', plannedSetId: 'set-1', setNumber: 1,
        outcome: 'substituted', substitutionNote: 'Flexão', repetitions: 7 }],
    }), 'captured');
    const work = get(comparison.units, 'work');
    expect(work).toHaveLength(2);
    expect(work.map((item) => item.iteration)).toEqual([1, 2]);
    expect(work.map((item) => item.outcome)).toEqual(['substituted', 'partial']);
    expect(work[0].parentUnitId).toBe('repeat');
    expect(work[0].metrics[0]).toMatchObject({
      planned: 400, executed: 300, difference: -100, plannedUnit: 'm',
    });
    expect(get(comparison.units, 'set-1')[0].outcome).toBe('substituted');
    expect(get(comparison.units, 'group-1')[0].outcome).toBe('not_performed');
  });

  it('does not silently convert minutes to seconds or ranges to a single target', () => {
    const comparison = compareWorkoutSession(planned(), execution({
      sessionValues: { durationSec: 1800, distanceKm: 5 },
      items: [{ plannedUnitId: 'ex-1', plannedSetId: 'set-1', setNumber: 1, repetitions: 10 }],
    }), 'captured');
    expect(get(comparison.units, 'day-1')[0].metrics[0]).toMatchObject({
      planned: 30, plannedUnit: 'min', executed: 1800, executedUnit: 's', difference: null,
    });
    expect(get(comparison.units, 'day-1')[0].metrics[1].difference).toBe(0);
    expect(get(comparison.units, 'set-1')[0].metrics[0]).toMatchObject({
      planned: 8, plannedMax: 12, executed: 10, difference: null,
    });
  });

  it('historical capture stays unchanged after template/catalog objects evolve', () => {
    const source = planned();
    const frozen = captureWorkoutComparisonPlan(source);
    source.exercises[0].exercise.name = 'Outro nome';
    source.exercises[0].resistanceBlocks[0].plannedSets[0].loadKg = 99;
    const first = compareWorkoutSession(frozen, execution(), 'captured');
    expect(get(first.units, 'ex-1')[0].label).toBe('Nome liberado');
    expect(get(first.units, 'set-1')[0].metrics.find((item) => item.key === 'load_kg')?.planned).toBe(20);
    expect(readCapturedWorkoutComparisonPlan(frozen)).not.toBeNull();
    expect(readCapturedWorkoutComparisonPlan({ id: 'day-1' })).toBeNull();
    expect(first.originReleaseId).toBe('rel-1');
  });

  it('rejects mismatching day identity instead of comparing another session', () => {
    expect(() => compareWorkoutSession(planned(), execution({ sessionId: 'day-2' }), 'captured'))
      .toThrow('não pertence');
  });

  it('does not discard two recorded occurrences of the same planned set', () => {
    const comparison = compareWorkoutSession(planned(), execution({
      items: [
        { plannedUnitId: 'ex-1', plannedSetId: 'set-1', setNumber: 1,
          outcome: 'full', repetitions: 8, loadKg: 20 },
        { plannedUnitId: 'ex-1', plannedSetId: 'set-1', setNumber: 3,
          outcome: 'substituted', substitutionNote: 'Adaptação', repetitions: 6, loadKg: 0 },
      ],
    }), 'captured');
    const sets = get(comparison.units, 'set-1');
    expect(sets).toHaveLength(2);
    expect(sets.map((item) => item.executedSetNumber)).toEqual([1, 3]);
    expect(sets[1]).toMatchObject({
      outcome: 'substituted', substitutionNote: 'Adaptação',
    });
    expect(sets[1].metrics.find((item) => item.key === 'load_kg')?.executed).toBe(0);
  });

  it('propagates an explicitly not-performed session without treating it as missing data', () => {
    const comparison = compareWorkoutSession(planned(), execution({
      status: 'not_performed', startedAt: null,
    }), 'captured');
    expect(get(comparison.units, 'day-1')[0].outcome).toBe('not_performed');
    expect(get(comparison.units, 'warmup')[0].outcome).toBe('not_performed');
    expect(get(comparison.units, 'set-1')[0].outcome).toBe('not_performed');
    expect(get(comparison.units, 'group-1')[0].outcome).toBe('not_performed');
    expect(get(comparison.units, 'warmup')[0].metrics[0].executed).toBeNull();
  });

  it('redacts per-set technical evidence on the server for the student audience', () => {
    const comparison = compareWorkoutSession(planned(), execution({
      items: [{ plannedUnitId: 'ex-1', plannedSetId: 'set-2', setNumber: 2,
        repetitions: 10, loadKg: 21, rir: 1 }],
    }), 'captured');
    const student = projectWorkoutComparisonForAudience(comparison, 'student');
    const professor = projectWorkoutComparisonForAudience(comparison, 'professor');
    expect(student.units.some((item) => item.kind === 'block' || item.kind === 'set')).toBe(false);
    expect(student.units.flatMap((item) => item.metrics).every((metric) => metric.difference === null)).toBe(true);
    expect(professor.units.some((item) => item.kind === 'block' || item.kind === 'set')).toBe(true);
    expect(get(professor.units, 'set-2')[0].metrics.find((metric) => metric.key === 'load_kg')?.difference).toBe(-1);
  });
  it('does not label an unclassified legacy item as fully performed', () => {
    const comparison = compareWorkoutSession(planned(), execution({
      items: [{ plannedUnitId: 'ex-1', plannedSetId: 'set-1', setNumber: 1, repetitions: 4 }],
    }), 'captured');
    expect(get(comparison.units, 'set-1')[0].outcome).toBe('unclassified');
    expect(get(comparison.units, 'set-1')[0].metrics[0].executed).toBe(4);
    expect(get(comparison.units, 'set-2')[0].outcome).toBe('not_recorded');
    expect(get(comparison.units, 'ex-1')[0].outcome).toBe('incomplete_record');
  });

  it('retains substitution even when other planned sets are missing or partial', () => {
    const oneOfTwo = compareWorkoutSession(planned(), execution({
      items: [{
        plannedUnitId: 'ex-1', plannedSetId: 'set-1', setNumber: 1,
        outcome: 'substituted', substitutionNote: 'Leg press', repetitions: 7,
      }],
    }), 'captured');
    for (const id of ['block-1', 'ex-1']) {
      expect(get(oneOfTwo.units, id)[0]).toMatchObject({
        outcome: 'incomplete_record', containsSubstitution: true,
      });
    }

    const both = compareWorkoutSession(planned(), execution({
      items: [
        { plannedUnitId: 'ex-1', plannedSetId: 'set-1', setNumber: 1,
          outcome: 'substituted', substitutionNote: 'Leg press' },
        { plannedUnitId: 'ex-1', plannedSetId: 'set-2', setNumber: 2,
          outcome: 'partial', repetitions: 5 },
      ],
    }), 'captured');
    expect(get(both.units, 'ex-1')[0]).toMatchObject({
      outcome: 'partial', containsSubstitution: true,
    });
    expect(get(both.units, 'block-1')[0]).toMatchObject({
      outcome: 'partial', containsSubstitution: true,
    });
  });

  it('counts distinct planned sets rather than repeated logs of one set', () => {
    const comparison = compareWorkoutSession(planned(), execution({
      items: [
        { plannedUnitId: 'ex-1', plannedSetId: 'set-1', setNumber: 1,
          outcome: 'full', repetitions: 8 },
        { plannedUnitId: 'ex-1', plannedSetId: 'set-1', setNumber: 3,
          outcome: 'full', repetitions: 9 },
      ],
    }), 'captured');
    expect(get(comparison.units, 'set-1')).toHaveLength(2);
    expect(get(comparison.units, 'block-1')[0].outcome).toBe('incomplete_record');
    expect(get(comparison.units, 'ex-1')[0].outcome).toBe('incomplete_record');
    expect(get(comparison.units, 'ex-1')[0].metrics[0].executed).toBe(1);
  });

  it('keeps a repeated stage incomplete while exposing its substitution', () => {
    const comparison = compareWorkoutSession(planned(), execution({
      sessionValues: { cyclicStages: [{
        plannedStageId: 'work', iteration: 1, outcome: 'substituted',
        substitutionNote: 'Bike', distanceMeters: 300,
      }] },
    }), 'captured');
    expect(get(comparison.units, 'repeat')[0]).toMatchObject({
      outcome: 'incomplete_record', containsSubstitution: true,
    });
  });

});
