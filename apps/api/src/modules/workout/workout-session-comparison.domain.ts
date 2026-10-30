import { Prisma } from '@prisma/client';
import type {
  TrainingRoutineAudience,
  TrainingSessionComparison,
  TrainingSessionComparisonMetric,
  TrainingSessionComparisonOutcome,
  TrainingSessionComparisonUnit,
  TrainingSessionExecutionView,
} from '@corrida/types';

/**
 * The released WorkoutDay is the only plan authority. Capture its content at
 * the first execution operation; never calculate historical comparisons from
 * the mutable WorkoutTemplate currently being edited.
 */
export const workoutComparisonPlanSelect = {
  id: true,
  sessionDurationMin: true,
  cyclicTimeMin: true,
  stimulusDurationMin: true,
  targetHrMin: true,
  targetHrMax: true,
  targetSpeedMin: true,
  targetSpeedMax: true,
  paceMin: true,
  paceMax: true,
  cyclicStages: {
    orderBy: [{ parentStageId: 'asc' as const }, { position: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true, parentStageId: true, position: true, kind: true,
      durationUnit: true, durationValue: true, targetKind: true,
      targetValue: true, targetMin: true, targetMax: true, repeatCount: true,
    },
  },
  exercises: {
    orderBy: [{ section: 'asc' as const }, { exerciseOrder: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true, section: true, exerciseOrder: true, sets: true, reps: true,
      load: true, intervalSec: true, exercise: { select: { name: true } },
      releasedCatalog: { select: { catalog: true } },
      resistanceBlocks: {
        orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
        select: {
          id: true, kind: true, position: true,
          plannedSets: {
            orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
            select: {
              id: true, position: true, repsMin: true, repsMax: true,
              loadKg: true, loadPercent: true, rir: true, rpe: true,
              tempo: true, restSec: true,
            },
          },
        },
      },
    },
  },
  resistanceGroups: {
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true, kind: true, position: true, rounds: true,
      restBetweenExercisesSec: true, restBetweenRoundsSec: true,
      members: {
        orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
        select: { workoutExerciseId: true, position: true },
      },
    },
  },
} satisfies Prisma.WorkoutDaySelect;

type DayPlan = Prisma.WorkoutDayGetPayload<{ select: typeof workoutComparisonPlanSelect }>;
export type TrainingComparisonSnapshot = DayPlan;

/** Detach the captured plan from Prisma's live objects and dates. */
export function captureWorkoutComparisonPlan(day: DayPlan): TrainingComparisonSnapshot {
  return JSON.parse(JSON.stringify(day)) as TrainingComparisonSnapshot;
}

export function readCapturedWorkoutComparisonPlan(value: unknown): TrainingComparisonSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const plan = value as Record<string, unknown>;
  if (typeof plan.id !== 'string' || !Array.isArray(plan.cyclicStages)
    || !Array.isArray(plan.exercises) || !Array.isArray(plan.resistanceGroups)) return null;
  return value as TrainingComparisonSnapshot;
}

const present = (value: number | string | null | undefined): number | string | null =>
  value === undefined ? null : value;

function metric(
  key: string,
  label: string,
  planned: number | string | null | undefined,
  executed: number | string | null | undefined,
  plannedUnit: string | null,
  executedUnit = plannedUnit,
  plannedMax?: number | string | null,
  bounded = false,
): TrainingSessionComparisonMetric {
  const p = present(planned);
  const max = present(plannedMax);
  const e = present(executed);
  // Distinguish a true point target from a single lower/upper bound. A missing
  // bound does not turn the remaining bound into an exact prescription.
  const plannedConstraint: TrainingSessionComparisonMetric['plannedConstraint'] = bounded
    ? p === null ? max === null ? null : 'maximum'
      : max === null ? 'minimum' : p === max ? 'exact' : 'range'
    : p === null ? null : 'exact';
  return {
    key, label, planned: p, plannedMax: max, plannedConstraint,
    executed: e, plannedUnit, executedUnit,
    difference: plannedConstraint === 'exact' && plannedUnit === executedUnit
      && typeof p === 'number' && typeof e === 'number' ? e - p : null,
  };
}

function unit(
  plannedUnitId: string,
  kind: TrainingSessionComparisonUnit['kind'],
  label: string,
  outcome: TrainingSessionComparisonOutcome,
  metrics: TrainingSessionComparisonMetric[],
  parentUnitId: string | null = null,
  iteration: number | null = null,
  substitutionNote: string | null = null,
  executedSetNumber: number | null = null,
  containsSubstitution = outcome === 'substituted',
): TrainingSessionComparisonUnit {
  return { plannedUnitId, kind, label, outcome, parentUnitId, iteration, substitutionNote, executedSetNumber, containsSubstitution, metrics };
}

type RecordedExerciseItem = TrainingSessionExecutionView['items'][number];

/** Execution measurements belong to the item, not to an invented day/stage target. */
function exerciseItemCyclicMetrics(recorded: RecordedExerciseItem | null): TrainingSessionComparisonMetric[] {
  return [
    metric('duration', 'Duração', null, recorded?.durationSec, 's'),
    metric('distance', 'Distância', null, recorded?.distanceKm, 'km'),
    metric('pace', 'Ritmo', null, recorded?.pace, 'min/km'),
    metric('heart_rate', 'Frequência cardíaca', null, recorded?.heartRateBpm, 'bpm'),
    metric('heart_rate_zone', 'Zona de FC', null, recorded?.heartRateZone, null),
  ];
}

/** Legacy exercises prescribe values at exercise level, not through plannedSetId. */
function legacyExerciseItemMetrics(
  exercise: DayPlan['exercises'][number],
  recorded: RecordedExerciseItem | null,
): TrainingSessionComparisonMetric[] {
  return [
    metric('repetitions', 'Repetições', exercise.reps, recorded?.repetitions, 'rep'),
    metric('load', 'Carga', exercise.load, recorded?.loadKg, 'kg'),
    metric('rest', 'Intervalo', exercise.intervalSec, recorded?.restSec, 's'),
    metric('rir', 'RIR', null, recorded?.rir, null),
    metric('rpe', 'RPE', null, recorded?.rpe, null),
    metric('tempo', 'Cadência', null, recorded?.tempo, null),
    ...exerciseItemCyclicMetrics(recorded),
  ];
}

function summaryOutcome(
  recorded: TrainingSessionComparisonOutcome[],
  expectedCount: number,
): TrainingSessionComparisonOutcome {
  if (!recorded.length || recorded.every((outcome) => outcome === 'not_recorded')) return 'not_recorded';
  // Missing records never prove actual partial performance.
  if (recorded.length < expectedCount || recorded.includes('not_recorded')
    || recorded.includes('incomplete_record')) return 'incomplete_record';
  if (recorded.includes('unclassified')) return 'unclassified';
  if (recorded.every((outcome) => outcome === 'not_performed')) return 'not_performed';
  if (recorded.includes('partial') || recorded.includes('not_performed')) return 'partial';
  if (recorded.includes('substituted')) return 'substituted';
  return 'full';
}

export function compareWorkoutSession(
  planned: TrainingComparisonSnapshot,
  execution: TrainingSessionExecutionView,
  snapshotSource: TrainingSessionComparison['snapshotSource'],
): TrainingSessionComparison {
  if (planned.id !== execution.sessionId) throw new Error('A execução não pertence ao planejamento capturado.');
  const result: TrainingSessionComparisonUnit[] = [];
  const state = execution.sessionValues;
  const missingOutcome: TrainingSessionComparisonOutcome = execution.status === 'not_performed'
    ? 'not_performed' : 'not_recorded';
  // Lifecycle completion is not proof that every prescribed unit was performed.
  // The session outcome is finalized from child evidence after building the units.
  result.push(unit(planned.id, 'session', 'Sessão', missingOutcome, [
    metric('duration', 'Duração', planned.sessionDurationMin ?? planned.cyclicTimeMin ?? planned.stimulusDurationMin,
      state.durationSec, 'min', 's'),
    // WorkoutTemplate.totalVolumeKm is a WEEKLY target, not a WorkoutDay target.
    // Distance is compared only at stages that prescribe it explicitly.
    metric('distance', 'Distância', null, state.distanceKm, 'km'),
    metric('pace', 'Ritmo', planned.paceMin, state.pace, 'min/km', 'min/km', planned.paceMax, true),
    metric('speed', 'Velocidade', planned.targetSpeedMin, state.speedKmh, 'km/h', 'km/h', planned.targetSpeedMax, true),
    metric('heart_rate', 'Frequência cardíaca', planned.targetHrMin, state.heartRateBpm,
      'bpm', 'bpm', planned.targetHrMax, true),
    metric('heart_rate_zone', 'Zona de FC', null, state.heartRateZone, null),
  ]));

  const stageRecords = state.cyclicStages ?? [];
  for (const stage of planned.cyclicStages) {
    const parent = stage.parentStageId
      ? planned.cyclicStages.find((item) => item.id === stage.parentStageId) : null;
    const iterations = parent?.kind === 'repeat' ? Math.max(1, parent.repeatCount ?? 1) : 1;
    for (let iteration = 1; iteration <= iterations; iteration++) {
      const actual = stageRecords.find((item) => item.plannedStageId === stage.id && (item.iteration ?? 1) === iteration);
      const target = stage.targetKind;
      const value = target === 'pace_min_per_km' ? actual?.paceMinPerKm
        : target === 'speed_kmh' ? actual?.speedKmh
        : target === 'heart_rate_bpm' ? actual?.heartRateBpm
        : target === 'zone' ? actual?.heartRateZone
        : target === 'pse' ? actual?.pse : null;
      const targetUnit = target === 'pace_min_per_km' ? 'min/km'
        : target === 'speed_kmh' ? 'km/h'
        : target === 'heart_rate_bpm' ? 'bpm'
        : target === 'zone' ? null : target === 'pse' ? 'PSE' : null;
      const durationExecuted = stage.durationUnit === 'seconds'
        ? actual?.durationSec : stage.durationUnit === 'meters' ? actual?.distanceMeters : null;
      const childIds = stage.kind === 'repeat'
        ? planned.cyclicStages.filter((child) => child.parentStageId === stage.id).map((child) => child.id)
        : [];
      const childRecords = stageRecords.filter((entry) => childIds.includes(entry.plannedStageId));
      const derivedOutcome = childRecords.length
        ? summaryOutcome(childRecords.map((entry) => entry.outcome), childIds.length * (stage.repeatCount ?? 1))
        : missingOutcome;
      result.push(unit(stage.id, 'cyclic_stage',
        'Etapa ' + stage.position + ' · ' + stage.kind,
        actual?.outcome ?? derivedOutcome, [
          metric('duration', stage.durationUnit === 'meters' ? 'Distância' : 'Duração',
            stage.durationValue, durationExecuted, stage.durationUnit === 'seconds' ? 's' : stage.durationUnit === 'meters' ? 'm' : null),
          metric('target', 'Alvo', stage.targetValue ?? stage.targetMin,
            value, targetUnit, targetUnit, stage.targetMax, stage.targetValue == null),
         ], stage.parentStageId, parent ? iteration : null, actual?.substitutionNote ?? null,
         null, actual?.outcome === 'substituted' || childRecords.some((item) => item.outcome === 'substituted')));
    }
  }

  const itemRecords = execution.items;
  for (const exercise of planned.exercises) {
    const items = itemRecords.filter((item) => item.plannedUnitId === exercise.id);
    const setCount = exercise.resistanceBlocks.reduce((count, block) => count + block.plannedSets.length, 0);
    const expected = setCount || (exercise.sets ?? 1);
    // A structured set's measurement belongs to its plannedSetId, not to the
    // exercise-level legacy prescription (which may have different targets).
    const actual = setCount === 0 && items.length === 1 ? items[0] : null;
    // Repeated logs for one planned set do not cover a different planned set.
    const setStatuses = exercise.resistanceBlocks.flatMap((block) => block.plannedSets.map((set) => {
      const records = items.filter((item) => item.plannedSetId === set.id);
      return records.length
        ? summaryOutcome(records.map((item) => item.outcome ?? 'unclassified'), 1)
        : 'not_recorded' as const;
    }));
    const statuses = setCount ? setStatuses : items.map((item) => item.outcome ?? 'unclassified');
    const recordedCount = setCount
      ? setStatuses.filter((outcome) => outcome !== 'not_recorded').length : items.length;
    const exerciseMetrics = setCount > 0
      // Structured sets own their measurements; do not aggregate incompatible targets.
      ? [metric('sets', 'Séries com registro', setCount, recordedCount || null, 'séries')]
      : items.length > 1
        // Multiple legacy records cannot be collapsed into a single executed value.
        ? [metric('sets', 'Séries', exercise.sets, recordedCount, 'séries')]
        : [
          metric('sets', 'Séries', exercise.sets, recordedCount || null, 'séries'),
          ...legacyExerciseItemMetrics(exercise, actual),
        ];
    result.push(unit(exercise.id, 'exercise', (() => {
      const catalog = exercise.releasedCatalog?.catalog;
      const name = catalog && typeof catalog === 'object' && !Array.isArray(catalog)
        && 'name' in catalog && typeof catalog.name === 'string' ? catalog.name : exercise.exercise.name;
      return name;
    })(), recordedCount ? summaryOutcome(statuses, expected) : missingOutcome, exerciseMetrics,
    null, null, items.find((item) => item.outcome === 'substituted')?.substitutionNote ?? null,
    null, items.some((item) => item.outcome === 'substituted')));

    if (setCount === 0 && items.length > 1) {
      // A legacy series has no plannedSetId. Keep the exercise's real ID and
      // the recorded setNumber rather than choosing one record or inventing IDs.
      for (const logged of [...items].sort((a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0))) {
        result.push(unit(exercise.id, 'set', 'Série registrada',
          logged.outcome ?? 'unclassified',
          legacyExerciseItemMetrics(exercise, logged),
          exercise.id, null, logged.substitutionNote ?? null, logged.setNumber ?? 0));
      }
    }

    for (const block of exercise.resistanceBlocks) {
      const results = block.plannedSets.flatMap((set) =>
        items.filter((item) => item.plannedSetId === set.id));
      const blockStatuses = block.plannedSets.map((set) => {
        const records = items.filter((item) => item.plannedSetId === set.id);
        return records.length
          ? summaryOutcome(records.map((item) => item.outcome ?? 'unclassified'), 1)
          : 'not_recorded' as const;
      });
      result.push(unit(block.id, 'block', 'Bloco ' + block.position + ' · ' + block.kind,
        results.length ? summaryOutcome(blockStatuses, block.plannedSets.length) : missingOutcome,
        [], exercise.id, null, null, null, results.some((item) => item.outcome === 'substituted')));
      for (const set of block.plannedSets) {
        const recorded = items.filter((item) => item.plannedSetId === set.id)
          .sort((a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0));
        for (const logged of recorded.length ? recorded : [null]) {
          result.push(unit(set.id, 'set', 'Série ' + set.position,
            logged ? logged.outcome ?? 'unclassified' : missingOutcome, [
              metric('repetitions', 'Repetições', set.repsMin, logged?.repetitions, 'rep', 'rep', set.repsMax, true),
              metric('load_kg', 'Carga (kg)', set.loadKg, logged?.loadKg, 'kg'),
              metric('load_pct', 'Carga (%)', set.loadPercent, null, '%'),
              metric('rir', 'RIR', set.rir, logged?.rir, null),
              metric('rpe', 'RPE', set.rpe, logged?.rpe, null),
              metric('tempo', 'Cadência', set.tempo, logged?.tempo, null),
              metric('rest', 'Intervalo', set.restSec, logged?.restSec, 's'),
              ...exerciseItemCyclicMetrics(logged),
            ], block.id, null, logged?.substitutionNote ?? null, logged?.setNumber ?? null));
        }
      }
    }
  }
  for (const group of planned.resistanceGroups) {
    const actual = state.resistanceGroups?.find((item) => item.plannedGroupId === group.id);
    result.push(unit(group.id, 'group', 'Agrupamento ' + group.position + ' · ' + group.kind,
      actual?.outcome ?? missingOutcome, [
        metric('rounds', 'Rodadas', group.rounds, actual?.roundsCompleted, 'rodadas'),
        metric('exercise_rest', 'Intervalo entre exercícios',
          group.restBetweenExercisesSec, actual?.restBetweenExercisesSec, 's'),
        metric('round_rest', 'Intervalo entre rodadas',
          group.restBetweenRoundsSec, actual?.restBetweenRoundsSec, 's'),
      ], null, null, actual?.substitutionNote ?? null));
  }

  // Roll up only independent planned units: repeated cyclic stage children,
  // exercises (which already consolidate their sets), and resistance groups.
  // Missing and unclassified child records must never become a full session.
  const cyclicLeafIds = new Set(planned.cyclicStages
    .filter((stage) => stage.kind !== 'repeat').map((stage) => stage.id));
  const children = result.slice(1).filter((item) => item.kind === 'exercise'
    || item.kind === 'group'
    || (item.kind === 'cyclic_stage' && cyclicLeafIds.has(item.plannedUnitId)));
  const hasSessionMeasurement = [state.durationSec, state.distanceKm, state.pace,
    state.speedKmh, state.heartRateBpm, state.heartRateZone]
    .some((value) => value !== undefined && value !== null);
  const combined = summaryOutcome(children.map((item) => item.outcome), children.length);
  const recordedOutcome = combined === 'not_recorded' && hasSessionMeasurement
    ? children.length ? 'incomplete_record' : 'unclassified'
    : combined;
  result[0].outcome = execution.status === 'not_performed' ? 'not_performed'
    : execution.status === 'partial' ? 'partial'
      : execution.status === 'completed' ? recordedOutcome
        : recordedOutcome === 'full' ? 'incomplete_record' : recordedOutcome;
  result[0].containsSubstitution = result.slice(1).some((item) => item.containsSubstitution);

  // An older execution without its own frozen plan cannot prove historical
  // prescription values. Keep recorded values and explicit source provenance,
  // but never show contemporary released-plan targets as historical facts.
  const units = snapshotSource === 'released_plan'
    ? result.map((item) => ({ ...item, metrics: item.metrics.map((entry) => ({
      ...entry, planned: null, plannedMax: null, plannedConstraint: null, difference: null,
    })) }))
    : result;
  return {
    sessionId: planned.id,
    originReleaseId: execution.origin.releaseId,
    snapshotSource,
    executionVersion: execution.version,
    units,
  };
}

/** Filter technical series and deltas at the API boundary, not only with CSS. */
export function projectWorkoutComparisonForAudience(
  comparison: TrainingSessionComparison,
  audience: TrainingRoutineAudience,
): TrainingSessionComparison {
  if (audience === 'professor') return comparison;
  return {
    ...comparison,
    units: comparison.units
      .filter((item) => item.kind !== 'block' && item.kind !== 'set')
      .map((item) => ({
        ...item,
        metrics: item.metrics.map((metric) => ({ ...metric, difference: null })),
      })),
  };
}
