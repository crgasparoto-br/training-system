import { prescribedRestAfter, projectResistanceRest, measuredRestMs, withResistanceRestRequestTiming } from './resistance-rest.domain.js';
import type { GuidedResistanceUnit } from '@corrida/types';

const unit = (restSec: number | null) => ({ restSec }) as GuidedResistanceUnit;
const base = {
  id: 'rest-1', afterPlannedSetId: 'planned-1', plannedSeconds: 60,
  extensionSeconds: 0, startedAt: new Date('2026-10-30T10:00:00.000Z'),
  targetEndsAt: new Date('2026-10-30T10:01:00.000Z'), pausedDurationMs: 0n,
};

describe('issue #488: canonical resistance rest', () => {
  it('subtracts server work before a late-starting rest without changing its deadline', () => {
    const view = { sessionId: 'day-1', status: 'in_progress' as const, version: 2,
      availability: 'available' as const, completed: 1, total: 2,
      current: null, next: null,
      rest: projectResistanceRest(base, { status: 'in_progress', currentPauseStartedAt: null },
        new Date('2026-10-30T10:00:00.000Z')) };
    const timed = withResistanceRestRequestTiming(view, Date.parse('2026-10-30T09:59:20.000Z'));
    expect(timed.rest).toMatchObject({ plannedSeconds: 60, remainingMs: 60000,
      requestProcessingMs: 40000 });
    expect(view.rest).not.toHaveProperty('requestProcessingMs');
    expect(withResistanceRestRequestTiming({ ...view, rest: null }, 0).rest).toBeNull();
    expect(withResistanceRestRequestTiming(view, Date.parse('2026-10-30T10:00:05.000Z'))
      .rest?.requestProcessingMs).toBe(0);
  });

  it('starts only for a positive explicitly planned transition with a successor', () => {
    expect(prescribedRestAfter(unit(60), unit(null))).toBe(60);
    expect(prescribedRestAfter(unit(null), unit(null))).toBeNull();
    expect(prescribedRestAfter(unit(0), unit(null))).toBeNull();
    expect(prescribedRestAfter(unit(60), null)).toBeNull();
  });
  it('uses timestamps after a background return instead of UI ticks', () => {
    const active = projectResistanceRest(base, { status: 'in_progress', currentPauseStartedAt: null },
      new Date('2026-10-30T10:00:40.000Z'));
    expect(active).toMatchObject({ remainingMs: 20000, elapsedMs: 40000, plannedSeconds: 60 });
    const expired = projectResistanceRest(base, { status: 'in_progress', currentPauseStartedAt: null },
      new Date('2026-10-30T10:01:30.000Z'));
    expect(expired).toMatchObject({ remainingMs: 0, elapsedMs: 90000 });
  });
  it('freezes paused seconds even when wall clock advances', () => {
    const paused = projectResistanceRest(base, {
      status: 'paused', currentPauseStartedAt: new Date('2026-10-30T10:00:25.000Z'),
    }, new Date('2026-10-30T11:00:00.000Z'));
    expect(paused).toMatchObject({ remainingMs: 35000, elapsedMs: 25000 });
  });
  it('extends only execution deadline and excludes explicit pause from realized duration', () => {
    const resumed = { ...base, extensionSeconds: 30, pausedDurationMs: 20000n,
      targetEndsAt: new Date('2026-10-30T10:01:50.000Z') };
    expect(projectResistanceRest(resumed, { status: 'in_progress', currentPauseStartedAt: null },
      new Date('2026-10-30T10:01:10.000Z'))).toMatchObject({ remainingMs: 40000, elapsedMs: 50000 });
    expect(measuredRestMs(resumed, new Date('2026-10-30T10:01:10.000Z'))).toBe(50000);
  });
});
