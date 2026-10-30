import type {
  TrainingSessionComparisonOutcome,
  TrainingSessionExecutionItemValue,
  TrainingSessionExecutionOutcome,
  TrainingSessionExecutionView,
} from '@corrida/types';
import {
  captureWorkoutComparisonPlan,
  compareWorkoutSession,
  projectWorkoutComparisonForAudience,
  readCapturedWorkoutComparisonPlan,
  workoutComparisonPlanSelect,
  type TrainingComparisonSnapshot,
} from './workout-session-comparison.domain.js';

function planned(): TrainingComparisonSnapshot {
  return {
    id: 'day-1',
    sessionDurationMin: 30, cyclicTimeMin: null, stimulusDurationMin: null,
    targetHrMin: null, targetHrMax: null, targetSpeedMin: null, targetSpeedMax: null,
    paceMin: null, paceMax: null,
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
    expect(get(comparison.units, 'day-1')[0].metrics[1]).toMatchObject({
      planned: null, executed: 5, difference: null, plannedUnit: 'km',
    });
    expect(get(comparison.units, 'set-1')[0].metrics[0]).toMatchObject({
      planned: 8, plannedMax: 12, executed: 10, difference: null,
    });
  });


  it('A-401-11: unilateral cyclic limits are not point targets; exact targets remain comparable', () => {
    const day = planned();
    const stage = day.cyclicStages.find((item) => item.id === 'work')!;
    const actual = execution({ sessionValues: { cyclicStages: [
      { plannedStageId: 'work', iteration: 1, outcome: 'full', speedKmh: 9 },
    ] } });
    const compareTarget = () => get(compareWorkoutSession(day, actual, 'captured').units, 'work')[0]
      .metrics.find((entry) => entry.key === 'target');

    stage.targetValue = null;
    stage.targetMin = 8;
    stage.targetMax = null;
    expect(compareTarget()).toMatchObject({
      planned: 8, plannedMax: null, plannedConstraint: 'minimum', executed: 9, difference: null,
    });
    stage.targetMin = null;
    stage.targetMax = 10;
    expect(compareTarget()).toMatchObject({
      planned: null, plannedMax: 10, plannedConstraint: 'maximum', executed: 9, difference: null,
    });
    stage.targetMin = 8;
    expect(compareTarget()).toMatchObject({
      planned: 8, plannedMax: 10, plannedConstraint: 'range', executed: 9, difference: null,
    });
    stage.targetMin = null;
    stage.targetMax = null;
    stage.targetValue = 8;
    expect(compareTarget()).toMatchObject({
      planned: 8, plannedMax: null, plannedConstraint: 'exact', executed: 9, difference: 1,
    });
    // The legacy session's numeric minimum is also a bound, not a point target.
    day.targetSpeedMin = '8';
    day.targetSpeedMax = null;
    const sessionSpeed = get(compareWorkoutSession(day, execution({
      sessionValues: { speedKmh: 9 },
    }), 'captured').units, 'day-1')[0].metrics.find((entry) => entry.key === 'speed');
    expect(sessionSpeed).toMatchObject({ plannedConstraint: 'minimum', difference: null });
  });

  it('A-401-11: resistance repetition bounds do not produce fictitious deltas', () => {
    const day = planned();
    const set = day.exercises[0].resistanceBlocks[0].plannedSets[0];
    const actual = execution({ items: [
      { plannedUnitId: 'ex-1', plannedSetId: 'set-1', setNumber: 1, repetitions: 10 },
    ] });
    const compareReps = () => get(compareWorkoutSession(day, actual, 'captured').units, 'set-1')[0]
      .metrics.find((entry) => entry.key === 'repetitions');
    set.repsMin = 8;
    set.repsMax = null;
    expect(compareReps()).toMatchObject({
      planned: 8, plannedMax: null, plannedConstraint: 'minimum', executed: 10, difference: null,
    });
    set.repsMin = null;
    set.repsMax = 12;
    expect(compareReps()).toMatchObject({
      planned: null, plannedMax: 12, plannedConstraint: 'maximum', difference: null,
    });
    set.repsMin = 8;
    expect(compareReps()).toMatchObject({
      planned: 8, plannedMax: 12, plannedConstraint: 'range', difference: null,
    });
    set.repsMin = 10;
    set.repsMax = 10;
    expect(compareReps()).toMatchObject({
      planned: 10, plannedMax: 10, plannedConstraint: 'exact', executed: 10, difference: 0,
    });
    // Legitimate zero must not be mistaken for an absent execution.
    set.repsMin = 0;
    set.repsMax = 0;
    const zero = compareWorkoutSession(day, execution({ items: [
      { plannedUnitId: 'ex-1', plannedSetId: 'set-1', setNumber: 1, repetitions: 0 },
    ] }), 'captured');
    expect(get(zero.units, 'set-1')[0].metrics.find((entry) => entry.key === 'repetitions'))
      .toMatchObject({ planned: 0, executed: 0, plannedConstraint: 'exact', difference: 0 });
    const absent = compareWorkoutSession(day, execution(), 'captured');
    expect(get(absent.units, 'set-1')[0].metrics.find((entry) => entry.key === 'repetitions'))
      .toMatchObject({ planned: 0, executed: null, difference: null });
    const legacy = compareWorkoutSession(day, actual, 'released_plan');
    expect(get(legacy.units, 'set-1')[0].metrics.find((entry) => entry.key === 'repetitions'))
      .toMatchObject({ planned: null, plannedMax: null, plannedConstraint: null, difference: null });
  });

  it('A-401-12: structured exercise summarizes distinct sets without mixing legacy target metrics', () => {
    const day = planned();
    day.exercises[0].sets = 99; // Obsolete legacy count must not override structured sets.
    const oneSet = execution({ items: [{
      plannedUnitId: 'ex-1', plannedSetId: 'set-2', setNumber: 2,
      outcome: 'full', repetitions: 10, loadKg: 22, restSec: 90,
    }] });
    const comparison = compareWorkoutSession(day, oneSet, 'captured');
    const exercise = get(comparison.units, 'ex-1')[0];
    expect(exercise.outcome).toBe('incomplete_record');
    expect(exercise.metrics).toEqual([expect.objectContaining({
      key: 'sets', label: 'Séries com registro', planned: 2, executed: 1, difference: -1,
    })]);
    const plannedSet = get(comparison.units, 'set-2')[0];
    expect(plannedSet.metrics.find((entry) => entry.key === 'load_kg'))
      .toMatchObject({ planned: 22, executed: 22, difference: 0 });
    const student = projectWorkoutComparisonForAudience(comparison, 'student');
    expect(get(student.units, 'ex-1')[0].metrics.map((entry) => entry.key)).toEqual(['sets']);
    expect(student.units.some((entry) => entry.kind === 'set' || entry.kind === 'block')).toBe(false);
    expect(get(student.units, 'ex-1')[0].metrics[0].difference).toBeNull();

    // Even after all sets are recorded, different set loads never become an
    // arbitrary exercise-level load. Set IDs still resolve each planned target.
    const complete = compareWorkoutSession(day, execution({ items: [
      { plannedUnitId: 'ex-1', plannedSetId: 'set-1', setNumber: 1,
        outcome: 'full', repetitions: 8, loadKg: 20 },
      { plannedUnitId: 'ex-1', plannedSetId: 'set-2', setNumber: 2,
        outcome: 'full', repetitions: 10, loadKg: 22 },
    ] }), 'captured');
    expect(get(complete.units, 'ex-1')[0].metrics).toEqual([
      expect.objectContaining({ key: 'sets', planned: 2, executed: 2, difference: 0 }),
    ]);
    expect(get(complete.units, 'set-1')[0].metrics.find((entry) => entry.key === 'load_kg'))
      .toMatchObject({ planned: 20, executed: 20, difference: 0 });
    expect(get(complete.units, 'set-2')[0].metrics.find((entry) => entry.key === 'load_kg'))
      .toMatchObject({ planned: 22, executed: 22, difference: 0 });
  });

  it('A-401-12: an exercise without structured sets keeps its legacy comparisons', () => {
    const day = planned();
    day.exercises[0].resistanceBlocks = [];
    const comparison = compareWorkoutSession(day, execution({ items: [{
      plannedUnitId: 'ex-1', setNumber: 1, outcome: 'full', repetitions: 11, loadKg: 22, restSec: 70,
    }] }), 'captured');
    expect(get(comparison.units, 'ex-1')[0].metrics.find((entry) => entry.key === 'load'))
      .toMatchObject({ planned: 20, executed: 22, difference: 2 });
    expect(get(comparison.units, 'ex-1')[0].metrics.find((entry) => entry.key === 'repetitions'))
      .toMatchObject({ planned: 10, executed: 11, difference: 1 });
    expect(get(comparison.units, 'ex-1')[0].metrics.find((entry) => entry.key === 'rest'))
      .toMatchObject({ planned: 60, executed: 70, difference: 10 });
  });

  it('A-401-05: never promotes the weekly template distance into a session target', () => {
    const day = Object.assign(planned(), { template: { totalVolumeKm: 30 } });
    const comparison = compareWorkoutSession(day, execution({
      sessionValues: { distanceKm: 10, cyclicStages: [
        { plannedStageId: 'work', iteration: 1, outcome: 'full', distanceMeters: 400 },
      ] },
    }), 'captured');
    const distance = get(comparison.units, 'day-1')[0].metrics.find((entry) => entry.key === 'distance');
    expect(distance).toMatchObject({ planned: null, executed: 10, difference: null,
      plannedUnit: 'km', executedUnit: 'km' });
    expect(get(comparison.units, 'work')[0].metrics[0]).toMatchObject({
      planned: 400, executed: 400, difference: 0, plannedUnit: 'm',
    });
    // Future snapshots must not capture week-level targets as a day prescription.
    expect('template' in workoutComparisonPlanSelect).toBe(false);
  });

  it('A-401-06: preserves both limits and original string/numeric types of cyclic targets', () => {
    const day = planned();
    day.targetHrMin = '120';
    day.targetHrMax = '160';
    day.targetSpeedMin = '8';
    day.targetSpeedMax = '10';
    day.paceMin = 5;
    day.paceMax = 6;
    const metrics = get(compareWorkoutSession(day, execution({
      sessionValues: { heartRateBpm: 140, pace: '5:30', speedKmh: 9 },
    }), 'captured').units, 'day-1')[0].metrics;
    expect(metrics.find((entry) => entry.key === 'heart_rate')).toMatchObject({
      planned: '120', plannedMax: '160', executed: 140, difference: null, plannedUnit: 'bpm',
    });
    expect(metrics.find((entry) => entry.key === 'speed')).toMatchObject({
      planned: '8', plannedMax: '10', executed: 9, difference: null, plannedUnit: 'km/h',
    });
    expect(metrics.find((entry) => entry.key === 'pace')).toMatchObject({
      planned: 5, plannedMax: 6, executed: '5:30', difference: null, plannedUnit: 'min/km',
    });
    day.targetHrMin = null;
    expect(get(compareWorkoutSession(day, execution(), 'captured').units, 'day-1')[0]
      .metrics.find((entry) => entry.key === 'heart_rate')).toMatchObject({
        planned: null, plannedMax: '160', difference: null,
      });
  });

  it('A-401-09: compares explicit speed for a legacy cyclic day without structured stages', () => {
    const legacyDay = planned();
    legacyDay.cyclicStages = [];
    legacyDay.exercises = [];
    legacyDay.resistanceGroups = [];
    legacyDay.targetSpeedMin = '8';
    legacyDay.targetSpeedMax = '10';
    const recorded = compareWorkoutSession(legacyDay, execution({
      sessionValues: { speedKmh: 9 },
    }), 'captured');
    const session = get(recorded.units, 'day-1')[0];
    expect(recorded.units).toHaveLength(1);
    expect(session.metrics.find((entry) => entry.key === 'speed')).toMatchObject({
      planned: '8', plannedMax: '10', executed: 9,
      plannedUnit: 'km/h', executedUnit: 'km/h', difference: null,
    });
    // A measurement alone cannot turn a lifecycle-completed workout into an inferred full workout.
    expect(session.outcome).toBe('unclassified');
    const missing = compareWorkoutSession(legacyDay, execution(), 'captured');
    expect(get(missing.units, 'day-1')[0].metrics.find((entry) => entry.key === 'speed')?.executed)
      .toBeNull();
    const zero = compareWorkoutSession(legacyDay, execution({
      sessionValues: { speedKmh: 0 },
    }), 'captured');
    expect(get(zero.units, 'day-1')[0].metrics.find((entry) => entry.key === 'speed')?.executed)
      .toBe(0);
    expect(get(zero.units, 'day-1')[0].outcome).toBe('unclassified');
    const historical = compareWorkoutSession(legacyDay, execution({
      sessionValues: { speedKmh: 9 },
    }), 'released_plan');
    expect(get(historical.units, 'day-1')[0].metrics.find((entry) => entry.key === 'speed'))
      .toMatchObject({ planned: null, plannedMax: null, executed: 9, difference: null });
  });

  it('A-401-07: completed lifecycle is full only when all independent planned units are explicitly full', () => {
    const completelyRecorded = execution({
      sessionValues: {
        cyclicStages: [
          { plannedStageId: 'warmup', outcome: 'full' },
          { plannedStageId: 'work', iteration: 1, outcome: 'full' },
          { plannedStageId: 'work', iteration: 2, outcome: 'full' },
        ],
        resistanceGroups: [{ plannedGroupId: 'group-1', outcome: 'full' }],
      },
      items: [
        { plannedUnitId: 'ex-1', plannedSetId: 'set-1', setNumber: 1, outcome: 'full' },
        { plannedUnitId: 'ex-1', plannedSetId: 'set-2', setNumber: 2, outcome: 'full' },
      ],
    });
    const allFull = compareWorkoutSession(planned(), completelyRecorded, 'captured');
    expect(get(allFull.units, 'day-1')[0]).toMatchObject({ outcome: 'full', containsSubstitution: false });
    const partial = compareWorkoutSession(planned(), {
      ...completelyRecorded,
      items: completelyRecorded.items.map((item, index) => index === 0
        ? { ...item, outcome: 'partial' as const } : item),
    }, 'captured');
    expect(get(partial.units, 'day-1')[0].outcome).toBe('partial');
    const missingSet = compareWorkoutSession(planned(), {
      ...completelyRecorded, items: completelyRecorded.items.slice(0, 1),
    }, 'captured');
    expect(get(missingSet.units, 'day-1')[0].outcome).toBe('incomplete_record');
    const incompleteSubstitution = compareWorkoutSession(planned(), {
      ...completelyRecorded,
      items: [{ ...completelyRecorded.items[0], outcome: 'substituted', substitutionNote: 'Bike' }],
    }, 'captured');
    expect(get(incompleteSubstitution.units, 'day-1')[0]).toMatchObject({
      outcome: 'incomplete_record', containsSubstitution: true,
    });
    expect(get(compareWorkoutSession(planned(), execution(), 'captured').units, 'day-1')[0].outcome)
      .toBe('not_recorded');
    expect(get(compareWorkoutSession(planned(), { ...completelyRecorded, status: 'in_progress' },
      'captured').units, 'day-1')[0].outcome).toBe('incomplete_record');
  });

  it('A-401-07: a session measurement does not prove the missing units were performed', () => {
    const comparison = compareWorkoutSession(planned(), execution({
      sessionValues: { durationSec: 1800, distanceKm: 10 },
    }), 'captured');
    expect(get(comparison.units, 'day-1')[0].outcome).toBe('incomplete_record');
    const sessionOnly = planned();
    sessionOnly.cyclicStages = [];
    sessionOnly.exercises = [];
    sessionOnly.resistanceGroups = [];
    expect(get(compareWorkoutSession(sessionOnly, execution({
      sessionValues: { durationSec: 0 },
    }), 'captured').units, 'day-1')[0].outcome).toBe('unclassified');
    expect(get(compareWorkoutSession(sessionOnly, execution(), 'captured').units,
      'day-1')[0].outcome).toBe('not_recorded');
  });

  it('RISK-001: an older session without a frozen plan cannot claim current targets as historical', () => {
    const oldDay = planned();
    oldDay.paceMin = 6;
    oldDay.paceMax = 7;
    const legacy = compareWorkoutSession(oldDay, execution({
      sessionValues: { pace: '5:30' },
      items: [{ plannedUnitId: 'ex-1', plannedSetId: 'set-1', setNumber: 1,
        outcome: 'full', loadKg: 25 }],
    }), 'released_plan');
    expect(legacy.snapshotSource).toBe('released_plan');
    expect(legacy.units.flatMap((item) => item.metrics).every((entry) =>
      entry.planned === null && entry.plannedMax === null && entry.difference === null)).toBe(true);
    expect(get(legacy.units, 'day-1')[0].metrics.find((item) => item.key === 'pace')?.executed)
      .toBe('5:30');
    expect(get(legacy.units, 'set-1')[0].metrics.find((item) => item.key === 'load_kg')?.executed)
      .toBe(25);
    const captured = compareWorkoutSession(oldDay, execution(), 'captured');
    expect(get(captured.units, 'day-1')[0].metrics.find((item) => item.key === 'pace'))
      .toMatchObject({ planned: 6, plannedMax: 7 });
  });

  it('A-401-08: public write outcomes exactly match the four API-accepted values', () => {
    type WriteOutcome = NonNullable<TrainingSessionExecutionItemValue['outcome']>;
    type ApiOutcome = TrainingSessionExecutionOutcome;
    type ContractIsExact = [WriteOutcome] extends [ApiOutcome]
      ? [ApiOutcome] extends [WriteOutcome] ? true : false : false;
    const contractAligned: ContractIsExact = true;
    const comparisonOnly: Exclude<TrainingSessionComparisonOutcome, ApiOutcome>[] = [
      'not_recorded', 'unclassified', 'incomplete_record',
    ];
    expect(contractAligned).toBe(true);
    expect(comparisonOnly).toHaveLength(3);
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


  it('A-401-13: preserves multiple legacy series by exercise ID and recorded ordinal', () => {
    const day = planned();
    day.exercises[0].resistanceBlocks = [];
    day.exercises[0].sets = 3;
    const comparison = compareWorkoutSession(day, execution({ items: [
      { plannedUnitId: 'ex-1', setNumber: 3, outcome: 'substituted',
        substitutionNote: 'Adaptação', repetitions: 8, loadKg: 25, restSec: 45,
        rir: 1, rpe: 8, tempo: '3-1-1', durationSec: 600, distanceKm: 1.5,
        pace: '6:40', heartRateBpm: 155, heartRateZone: 'Z4' },
      { plannedUnitId: 'ex-1', setNumber: 1, outcome: 'full',
        repetitions: 10, loadKg: 20, restSec: 60,
        durationSec: 0, distanceKm: 0, heartRateBpm: 145, heartRateZone: 'Z3' },
    ] }), 'captured');
    const exercise = comparison.units.find((entry) => entry.kind === 'exercise');
    expect(exercise).toMatchObject({ plannedUnitId: 'ex-1',
      outcome: 'incomplete_record', containsSubstitution: true });
    expect(exercise?.metrics).toEqual([expect.objectContaining({
      key: 'sets', planned: 3, executed: 2,
    })]);
    const records = comparison.units.filter((entry) =>
      entry.kind === 'set' && entry.plannedUnitId === 'ex-1');
    expect(records.map((entry) => entry.executedSetNumber)).toEqual([1, 3]);
    expect(records.map((entry) => entry.parentUnitId)).toEqual(['ex-1', 'ex-1']);
    expect(records[0].metrics.find((entry) => entry.key === 'load'))
      .toMatchObject({ planned: 20, executed: 20, difference: 0 });
    expect(records[1].metrics.find((entry) => entry.key === 'load'))
      .toMatchObject({ planned: 20, executed: 25, difference: 5 });
    expect(records[1].metrics.find((entry) => entry.key === 'tempo'))
      .toMatchObject({ planned: null, executed: '3-1-1', difference: null });
    expect(records[1]).toMatchObject({
      outcome: 'substituted', substitutionNote: 'Adaptação',
    });
    expect(records[0].metrics.find((entry) => entry.key === 'duration'))
      .toMatchObject({ planned: null, executed: 0, difference: null });
    expect(records[1].metrics.find((entry) => entry.key === 'duration'))
      .toMatchObject({ planned: null, executed: 600, difference: null });
    expect(projectWorkoutComparisonForAudience(comparison, 'student').units
      .some((entry) => entry.kind === 'set')).toBe(false);
    const legacy = compareWorkoutSession(day, execution({ items: [
      { plannedUnitId: 'ex-1', setNumber: 1, outcome: 'full', loadKg: 20 },
      { plannedUnitId: 'ex-1', setNumber: 2, outcome: 'full', loadKg: 22 },
      { plannedUnitId: 'ex-1', setNumber: 3, outcome: 'full', loadKg: 24 },
    ] }), 'released_plan');
    expect(legacy.units.find((entry) => entry.kind === 'exercise')?.outcome).toBe('full');
    expect(legacy.units.filter((entry) => entry.kind === 'set')).toHaveLength(3);
    expect(legacy.units.flatMap((entry) => entry.metrics).every((entry) =>
      entry.planned === null && entry.difference === null)).toBe(true);
  });

  it('A-401-14: exposes legacy per-exercise cyclic measurements without synthetic targets', () => {
    const day = planned();
    day.exercises[0].resistanceBlocks = [];
    const comparison = compareWorkoutSession(day, execution({ items: [{
      plannedUnitId: 'ex-1', setNumber: 1, outcome: 'partial',
      durationSec: 600, distanceKm: 0, pace: '6:30',
      heartRateBpm: 145, heartRateZone: 'Z3',
      rir: 2, rpe: 7, tempo: '2-0-2',
    }] }), 'captured');
    const exercise = comparison.units.find((entry) => entry.kind === 'exercise');
    expect(exercise).toBeDefined();
    for (const [key, value, unit] of [
      ['duration', 600, 's'], ['distance', 0, 'km'],
      ['pace', '6:30', 'min/km'], ['heart_rate', 145, 'bpm'],
      ['heart_rate_zone', 'Z3', null],
    ] as const) {
      expect(exercise?.metrics.find((entry) => entry.key === key))
        .toMatchObject({ planned: null, executed: value,
          plannedUnit: unit, executedUnit: unit, difference: null });
    }
    expect(exercise?.metrics.find((entry) => entry.key === 'rir'))
      .toMatchObject({ planned: null, executed: 2, difference: null });
    expect(projectWorkoutComparisonForAudience(comparison, 'student').units
      .find((entry) => entry.kind === 'exercise')?.metrics.find((entry) =>
        entry.key === 'distance')?.executed).toBe(0);
  });

  it('A-401-14: structured set cyclic recordings remain on their own planned set', () => {
    const comparison = compareWorkoutSession(planned(), execution({ items: [{
      plannedUnitId: 'ex-1', plannedSetId: 'set-2', setNumber: 2, outcome: 'full',
      repetitions: 10, loadKg: 22, durationSec: 0, distanceKm: 1.8,
      pace: '5:15', heartRateBpm: 151, heartRateZone: 'Z4',
    }] }), 'captured');
    const set = get(comparison.units, 'set-2')[0];
    expect(set.metrics.find((entry) => entry.key === 'duration'))
      .toMatchObject({ planned: null, executed: 0, difference: null });
    expect(set.metrics.find((entry) => entry.key === 'distance'))
      .toMatchObject({ planned: null, executed: 1.8, difference: null });
    expect(set.metrics.find((entry) => entry.key === 'pace'))
      .toMatchObject({ planned: null, executed: '5:15', difference: null });
    expect(set.metrics.find((entry) => entry.key === 'heart_rate'))
      .toMatchObject({ planned: null, executed: 151, difference: null });
    expect(set.metrics.find((entry) => entry.key === 'heart_rate_zone'))
      .toMatchObject({ planned: null, executed: 'Z4', difference: null });
    expect(get(comparison.units, 'ex-1')[0].metrics.map((entry) => entry.key))
      .toEqual(['sets']);
    expect(projectWorkoutComparisonForAudience(comparison, 'student').units
      .some((entry) => entry.kind === 'set')).toBe(false);
  });
});
