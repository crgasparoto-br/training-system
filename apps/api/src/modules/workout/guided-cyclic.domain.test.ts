import type { TrainingSessionExecutionView } from '@corrida/types';
import {
  deriveGuidedCyclicPlan, elapsedGuidedCyclicMs, projectGuidedCyclic,
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
        stage('work', 1), stage('recover', 2, 'recovery'), stage('work', 3, 'work'),
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

  it('does not silently accept more stage occurrences than the canonical value limit', () => {
    const repeated = [{ ...stage('repeat', 1, 'repeat'), durationUnit: null,
      durationValue: null, repeatCount: 100, children: Array.from({ length: 6 }, (_, i) =>
        stage('child-' + i, i + 1, i === 0 ? 'work' : i === 1 ? 'recovery' : 'work')) }];
    expect(deriveGuidedCyclicPlan(repeated).availability).toBe('invalid_plan');
  });
});
