import type { ReleaseConsolidatedOperationalWorkoutCommand } from '@corrida/types';
import { releaseRequestFingerprint } from './consolidated-prescription-release.service.js';

const command = (): ReleaseConsolidatedOperationalWorkoutCommand => ({
  expectedCurrentVersion: 7,
  target: {
    trainingPlanId: 'plan-1',
    mesocycleNumber: 2,
    weekNumber: 3,
    weekStartDate: '2026-08-17T00:00:00.000Z',
    placements: [
      {
        projectionKey: 'resisted:capacity-v1:technical-squat',
        dayOfWeek: 1,
        workoutDate: '2026-08-17T00:00:00.000Z',
        section: 'principal',
        exerciseOrder: 1,
      },
      {
        projectionKey: 'cyclic:capacity-v2',
        dayOfWeek: 3,
        workoutDate: '2026-08-19T00:00:00.000Z',
      },
    ],
  },
});

describe('releaseRequestFingerprint', () => {
  it('is stable when placement order changes', () => {
    const first = command();
    const second = command();
    second.target.placements.reverse();
    expect(releaseRequestFingerprint(first)).toBe(releaseRequestFingerprint(second));
  });

  it('changes when the explicit operational target changes', () => {
    const first = command();
    const second = command();
    second.target.weekNumber = 4;
    expect(releaseRequestFingerprint(first)).not.toBe(releaseRequestFingerprint(second));
  });

  it('changes when an exercise is positioned elsewhere', () => {
    const first = command();
    const second = command();
    second.target.placements[0].exerciseOrder = 2;
    expect(releaseRequestFingerprint(first)).not.toBe(releaseRequestFingerprint(second));
  });
});
