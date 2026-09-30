import { describe, expect, it } from 'vitest';
import { splitStudentWorkouts } from './StudentWorkouts';
import type { StudentWorkoutSummary } from '../services/student-workout.service';

function workout(id: string, weekStartDate: string): StudentWorkoutSummary {
  return {
    id,
    planId: 'plan-1',
    mesocycleNumber: 1,
    weekNumber: 1,
    weekStartDate,
    releasedAt: '2026-09-01T10:00:00.000Z',
    plan: { id: 'plan-1', name: 'Plano' },
    workoutDays: [],
  };
}

describe('StudentWorkouts grouping', () => {
  it('mantém atuais e futuros antes do histórico sem perder treinos antigos', () => {
    const source = [
      workout('old', '2026-09-07T00:00:00.000Z'),
      workout('current', '2026-09-28T00:00:00.000Z'),
      workout('future', '2026-10-05T00:00:00.000Z'),
    ];

    const result = splitStudentWorkouts(source, new Date('2026-09-29T12:00:00.000Z'));

    expect(result.currentAndUpcoming.map((item) => item.id)).toEqual(['current', 'future']);
    expect(result.history.map((item) => item.id)).toEqual(['old']);
  });
});
