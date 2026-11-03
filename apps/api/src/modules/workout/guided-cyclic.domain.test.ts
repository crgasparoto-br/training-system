import type { TrainingSessionExecutionView } from '@corrida/types';
import { MAX_CYCLIC_STAGE_EXECUTION_RECORDS, MAX_CYCLIC_STAGE_OCCURRENCES,
  MAX_CYCLIC_TOP_LEVEL_STAGES } from './cyclic-stages.domain.js';
import {
  canCompleteGuidedCyclic, deriveGuidedCyclicPlan, elapsedGuidedCyclicMs, projectGuidedCyclic,
  type GuidedCyclicPlannedStage,
} from './guided-cyclic.domain.js';

function stage(id: string, position: number, kind = 'work', unit = 'seconds',
  seconds = 60): GuidedCyclicPlannedStage {
  return {
    id, position, kind, durationUnit: unit, durationValue: seconds,
    targetKind: null, targetValue: null, targetMin: null, targetMax: null,
    inclinePercent: null, cadenceSpm: null, repeatCount: null, notes: null, children: [],
  };
}
const plan = () => deriveGuidedCyclicPlan([
  stage('warmup', 1, 'warmup', 'seconds', 300),
  { ...stage('repeated', 2, 'repeat'), durationUnit: null, durationValue: null,
    repeatCount: 2, children: [
      { ...stage('work', 1, 'work'), targetKind: 'heart_rate_bpm', targetMin: 153, targetMax: 159 },
      stage('recover', 2, 'recovery', 'seconds', 30),
    ] },
  stage('finish', 3, 'cooldown', 'meters', 800),
]);
const execution = (overrides: Partial<TrainingSessionExecutionView> = {}): TrainingSessionExecutionView => ({
  sessionId: 'day', status: 'in_progress', version: 2,
  startedAt: '2026-11-03T09:00:00.000Z', finishedAt: null,
  currentPauseStartedAt: null, pausedDurationMs: 0, interruptionReason: null,
  origin: { releaseId: 'release', workoutTemplateId: 'template', trainingPlanId: 'plan' },
  sessionValues: {}, items: [],
  ...overrides,
});
const record = (id: string, iteration = 1) => ({
  plannedStageId: id, iteration, outcome: 'full' as const,
});

describe('issue #489: canonical guided cyclic domain', () => {
  it('reserves room for #401 repeat parents without reducing the #398 leaf limit', () => {
    expect(MAX_CYCLIC_STAGE_OCCURRENCES).toBe(80_000);
    expect(MAX_CYCLIC_STAGE_EXECUTION_RECORDS).toBe(MAX_CYCLIC_STAGE_OCCURRENCES + MAX_CYCLIC_TOP_LEVEL_STAGES);
  });
  it('expands explicit warmup, work/recovery rounds and cooldown in released order', () => {
    const result = plan();
    expect(result.availability).toBe('available');
    expect(result.units.map((item) => [item.plannedStageId, item.iteration])).toEqual([
      ['warmup', 1], ['work', 1], ['recover', 1], ['work', 2], ['recover', 2], ['finish', 1],
    ]);
    expect(result.units[1]).toMatchObject({
      kind: 'work', roundNumber: 1, roundTotal: 2, targetKind: 'heart_rate_bpm',
      targetMin: 153, targetMax: 159,
    });
    expect(result.units[5]).toMatchObject({ durationUnit: 'meters', durationValue: 800 });
  });

  it('preserves exact 90-second work and recovery timing and the order of four rounds', () => {
    const repeat = { ...stage('block-90', 2, 'repeat'), durationUnit: null, durationValue: null,
      repeatCount: 4, children: [
        { ...stage('work-90', 1, 'work', 'seconds', 90),
          targetKind: 'speed_kmh', targetMin: 9.5, targetMax: 12.5 },
        stage('recovery-90', 2, 'recovery', 'seconds', 90),
      ] };
    const released = deriveGuidedCyclicPlan([
      stage('warmup-90', 1, 'warmup', 'seconds', 240),
      repeat,
      stage('cooldown-90', 3, 'cooldown', 'meters', 500),
    ]);
    expect(released.availability).toBe('available');
    expect(released.units).toHaveLength(10);
    expect(released.units.map((unit) => [unit.plannedStageId, unit.iteration])).toEqual([
      ['warmup-90', 1], ['work-90', 1], ['recovery-90', 1],
      ['work-90', 2], ['recovery-90', 2],
      ['work-90', 3], ['recovery-90', 3],
      ['work-90', 4], ['recovery-90', 4],
      ['cooldown-90', 1],
    ]);
    expect(released.units[1]).toMatchObject({
      roundNumber: 1, roundTotal: 4, durationValue: 90, targetMin: 9.5, targetMax: 12.5,
    });
    expect(released.units[2]).toMatchObject({
      kind: 'recovery', roundNumber: 1, roundTotal: 4, durationValue: 90,
    });
    const base = execution({
      sessionValues: {
        cyclicStages: [record('warmup-90')],
        guidedCyclic: { plannedStageId: 'work-90', iteration: 1,
          startedAt: '2026-11-03T09:00:00.000Z', pausedDurationAtStartMs: 0 },
      },
    });
    expect(projectGuidedCyclic('day', base, released,
      new Date('2026-11-03T09:00:45.000Z'))).toMatchObject({
      completed: 1, remainingMs: 45_000,
      current: { plannedStageId: 'work-90', iteration: 1 },
      next: { plannedStageId: 'recovery-90', iteration: 1 },
    });
    expect(projectGuidedCyclic('day', base, released,
      new Date('2026-11-03T09:01:30.000Z')).remainingMs).toBe(0);
  });

  it('does not hallucinate stages for a legacy prescription and rejects malformed plans', () => {
    expect(deriveGuidedCyclicPlan([])).toEqual({ availability: 'legacy_read_only', units: [] });
    expect(deriveGuidedCyclicPlan([stage('id', 2)])).toMatchObject({ availability: 'invalid_plan' });
    expect(deriveGuidedCyclicPlan([stage('same', 1), stage('same', 2)])).toMatchObject({ availability: 'invalid_plan' });
    expect(deriveGuidedCyclicPlan([{ ...stage('wrong', 1), durationUnit: 'minutes' }]))
      .toMatchObject({ availability: 'invalid_plan' });
    expect(deriveGuidedCyclicPlan([{ ...stage('repeat', 1, 'repeat'), durationUnit: null,
      durationValue: null, repeatCount: 2, children: [stage('work', 1)] }]))
      .toMatchObject({ availability: 'invalid_plan' });
    expect(deriveGuidedCyclicPlan([{ ...stage('repeat', 1, 'repeat'), durationUnit: null,
      durationValue: null, repeatCount: 2, children: [
        stage('work', 1), stage('recover', 2, 'recovery'), stage('work-second', 3, 'work'),
      ] }])).toMatchObject({ availability: 'available' });
  });

  it('reads the current stage from persisted prefix and cursor, not the UI index', () => {
    const now = new Date('2026-11-03T09:02:00.000Z');
    const view = projectGuidedCyclic('day', execution({
      version: 4,
      sessionValues: {
        cyclicStages: [record('warmup')],
        guidedCyclic: { plannedStageId: 'work', iteration: 1,
          startedAt: '2026-11-03T09:01:00.000Z', pausedDurationAtStartMs: 0 },
      },
    }), plan(), now);
    expect(view).toMatchObject({
      sessionId: 'day', availability: 'available', completed: 1, total: 6, version: 4,
      current: { plannedStageId: 'work', iteration: 1 },
      next: { plannedStageId: 'recover', iteration: 1 },
      elapsedMs: 60_000, remainingMs: 0,
    });
    const afterRefresh = projectGuidedCyclic('day', execution({
      sessionValues: {
        cyclicStages: [record('warmup')],
        guidedCyclic: { plannedStageId: 'work', iteration: 1,
          startedAt: '2026-11-03T09:01:00.000Z', pausedDurationAtStartMs: 0 },
      },
    }), plan(), new Date('2026-11-03T09:01:12.000Z'));
    expect(afterRefresh.remainingMs).toBe(48_000);
  });

  it('keeps the optional #401 repeat-parent aggregate separate from guided leaf progress and completion', () => {
    const released = plan();
    const cursor = { plannedStageId: 'work', iteration: 1,
      startedAt: '2026-11-03T09:00:00.000Z', pausedDurationAtStartMs: 0 };
    const now = new Date('2026-11-03T09:00:15.000Z');
    const withRows = (rows: ReturnType<typeof record>[], guidedCyclic = cursor) => execution({
      sessionValues: { cyclicStages: rows, guidedCyclic },
    });
    const withoutParent = projectGuidedCyclic('day', withRows([record('warmup')]), released, now);
    const withParent = projectGuidedCyclic('day', withRows([
      record('repeated'), record('warmup'),
    ]), released, now);
    expect(withParent).toEqual(withoutParent);
    expect(withParent).toMatchObject({ availability: 'available', completed: 1, total: 6,
      current: { plannedStageId: 'work', iteration: 1, roundNumber: 1 },
      next: { plannedStageId: 'recover', iteration: 1 }, remainingMs: 45_000 });

    const leaves = released.units.map((unit) => record(unit.plannedStageId, unit.iteration));
    const finishedCursor = { plannedStageId: null, iteration: null,
      startedAt: null, pausedDurationAtStartMs: null };
    for (const rows of [[record('repeated'), ...leaves], [...leaves, record('repeated')]]) {
      const finished = execution({ sessionValues: { cyclicStages: rows, guidedCyclic: finishedCursor } });
      expect(projectGuidedCyclic('day', finished, released, now)).toMatchObject({
        availability: 'available', completed: 6, total: 6, current: null, next: null,
      });
      expect(canCompleteGuidedCyclic('day', finished, released, now)).toBe(true);
      expect(canCompleteGuidedCyclic('day', execution({ sessionValues: { cyclicStages: rows } }),
        released, now)).toBe(true); // The manual #401 path has the same coverage rule.
    }
  });

  it('fails closed for invalid or duplicated parent aggregates without hiding missing or reordered leaves', () => {
    const released = plan();
    const now = new Date('2026-11-03T09:00:30.000Z');
    const leaves = released.units.map((unit) => record(unit.plannedStageId, unit.iteration));
    const finishedCursor = { plannedStageId: null, iteration: null,
      startedAt: null, pausedDurationAtStartMs: null };
    const invalidRows = [
      [...leaves, record('repeated'), record('repeated')],
      [...leaves, record('repeated', 2)],
      [...leaves, record('foreign-parent')],
      [...leaves, record('work', 3)],
      [...leaves, record('warmup')],
      [record('repeated'), ...leaves.slice(1)],
    ];
    for (const cyclicStages of invalidRows) {
      const guided = execution({ sessionValues: { cyclicStages, guidedCyclic: finishedCursor } });
      expect(projectGuidedCyclic('day', guided, released, now).availability)
        .toBe('reconciliation_required');
      expect(canCompleteGuidedCyclic('day', guided, released, now)).toBe(false);
      expect(canCompleteGuidedCyclic('day', execution({ sessionValues: { cyclicStages } }),
        released, now)).toBe(false);
    }
    const skipped = execution({ sessionValues: { cyclicStages: [record('repeated'), record('work', 2)],
      guidedCyclic: { plannedStageId: 'warmup', iteration: 1,
        startedAt: null, pausedDurationAtStartMs: null } } });
    expect(projectGuidedCyclic('day', skipped, released, now).availability)
      .toBe('reconciliation_required');
  });

  it('freezes on #389 pause and resumes without double-counting old pauses', () => {
    const cursor = { plannedStageId: 'warmup', iteration: 1,
      startedAt: '2026-11-03T09:00:00.000Z', pausedDurationAtStartMs: 4000 };
    const paused = execution({ status: 'paused', pausedDurationMs: 6000,
      currentPauseStartedAt: '2026-11-03T09:00:25.000Z',
      sessionValues: { guidedCyclic: cursor } });
    expect(elapsedGuidedCyclicMs(cursor, paused, new Date('2026-11-03T09:02:00.000Z'))).toBe(23_000);
    expect(projectGuidedCyclic('day', paused, plan(), new Date('2026-11-03T10:00:00.000Z')).remainingMs)
      .toBe(277_000);
    const resumed = execution({ pausedDurationMs: 10000,
      sessionValues: { guidedCyclic: cursor } });
    expect(elapsedGuidedCyclicMs(cursor, resumed, new Date('2026-11-03T09:00:40.000Z'))).toBe(34_000);
  });

  it('fails closed on orphan, duplicate, skipped or mismatched progress', () => {
    const current = { plannedStageId: 'warmup', iteration: 1,
      startedAt: null, pausedDurationAtStartMs: null };
    for (const values of [
      { cyclicStages: [record('work', 1)], guidedCyclic: current },
      { cyclicStages: [record('warmup'), record('warmup')], guidedCyclic: current },
      { cyclicStages: [record('foreign')], guidedCyclic: current },
      { cyclicStages: [record('warmup')] },
      { cyclicStages: [record('warmup')], guidedCyclic: current },
    ]) {
      expect(projectGuidedCyclic('day', execution({ sessionValues: values }), plan(),
        new Date('2026-11-03T09:00:00.000Z')).availability).toBe('reconciliation_required');
    }
    expect(projectGuidedCyclic('day', execution({
      sessionValues: { guidedCyclic: { ...current, startedAt: 'not-a-date',
        pausedDurationAtStartMs: 0 } },
    }), plan(), new Date()).availability).toBe('reconciliation_required');
  });

  it('permits complete #401 manual values with repeat-parent aggregate while rejecting incomplete, duplicate and foreign records', () => {
    const planned = plan();
    const rows = planned.units.map((unit) => record(unit.plannedStageId, unit.iteration));
    const manual = (cyclicStages: typeof rows, guidedCyclic?: TrainingSessionExecutionView['sessionValues']['guidedCyclic']) =>
      execution({ sessionValues: { cyclicStages, ...(guidedCyclic === undefined ? {} : { guidedCyclic }) } });
    const check = (cyclicStages: typeof rows, guidedCyclic?: TrainingSessionExecutionView['sessionValues']['guidedCyclic']) =>
      canCompleteGuidedCyclic('day', manual(cyclicStages, guidedCyclic), planned,
        new Date('2026-11-03T09:01:00.000Z'));
    expect(check([...rows, record('repeated')])).toBe(true);
    expect(check(rows)).toBe(true);
    expect(check(rows.slice(1))).toBe(false);
    expect(check([...rows, rows[0]])).toBe(false);
    expect(check([...rows, record('foreign')])).toBe(false);
    expect(check([...rows, record('repeated', 2)])).toBe(false);
    expect(check([...rows, record('repeated'), record('repeated')])).toBe(false);
    expect(check([...rows, record('repeated')], { plannedStageId: null, iteration: null,
      startedAt: null, pausedDurationAtStartMs: null })).toBe(true);
    expect(canCompleteGuidedCyclic('day', manual(rows), deriveGuidedCyclicPlan([]),
      new Date('2026-11-03T09:01:00.000Z'))).toBe(false);
    const gui = manual(rows, { plannedStageId: null, iteration: null,
      startedAt: null, pausedDurationAtStartMs: null });
    expect(canCompleteGuidedCyclic('day', gui, planned, new Date('2026-11-03T09:01:00.000Z')))
      .toBe(true);
  });

  it('executes every #398-valid repetition without truncating at the former 500-record limit', () => {
    const repeated = [{ ...stage('repeat', 1, 'repeat'), durationUnit: null,
      durationValue: null, repeatCount: 100, children: Array.from({ length: 6 }, (_, i) =>
        stage('child-' + i, i + 1, i === 0 ? 'work' : i === 1 ? 'recovery' : 'work')) }];
    const derived = deriveGuidedCyclicPlan(repeated);
    expect(derived.availability).toBe('available');
    expect(derived.units).toHaveLength(600);
    expect(derived.units.at(-1)).toMatchObject({ plannedStageId: 'child-5', iteration: 100,
      order: 600, roundTotal: 100 });
    const recorded = derived.units.slice(0, 501).map((unit) => record(unit.plannedStageId, unit.iteration));
    const projected = projectGuidedCyclic('day', execution({
      sessionValues: { cyclicStages: recorded,
        guidedCyclic: { plannedStageId: 'child-3', iteration: 84,
          startedAt: null, pausedDurationAtStartMs: null } },
    }), derived, new Date('2026-11-03T09:00:00.000Z'));
    // Round 84: indices 498-503, so index 501 is child-3.
    expect(projected).toMatchObject({ availability: 'available', completed: 501, total: 600,
      current: { plannedStageId: 'child-3', iteration: 84 } });
  });

  it('never advances the clock after terminal completion or partial interruption, even after refresh', () => {
    const cursor = { plannedStageId: 'warmup', iteration: 1,
      startedAt: '2026-11-03T09:00:00.000Z', pausedDurationAtStartMs: 0 };
    const running = execution({ sessionValues: { guidedCyclic: cursor } });
    const initial = projectGuidedCyclic('day', running, plan(), new Date('2026-11-03T09:00:30.000Z'));
    expect(initial).toMatchObject({ elapsedMs: 30_000, remainingMs: 270_000 });
    for (const status of ['partial', 'completed'] as const) {
      const terminal = execution({ ...running, status, finishedAt: '2026-11-03T09:00:30.000Z' });
      const later = projectGuidedCyclic('day', terminal, plan(), new Date('2026-11-03T09:12:00.000Z'));
      expect(later).toMatchObject({ elapsedMs: 30_000, remainingMs: 270_000 });
      expect(elapsedGuidedCyclicMs(cursor, terminal, new Date('2026-11-04T09:00:00.000Z'))).toBe(30_000);
    }
    const pausedPartial = execution({ ...running, status: 'partial',
      finishedAt: '2026-11-03T09:04:30.000Z', pausedDurationMs: 240_000 });
    expect(projectGuidedCyclic('day', pausedPartial, plan(), new Date('2026-11-03T10:00:00.000Z')))
      .toMatchObject({ elapsedMs: 30_000, remainingMs: 270_000 });
    const corruptedTerminal = execution({ ...running, status: 'partial', finishedAt: null });
    expect(projectGuidedCyclic('day', corruptedTerminal, plan(), new Date()).availability)
      .toBe('reconciliation_required');
  });
});
