import { describe, expect, it } from 'vitest';
import { resolveWorkoutBuilderPosition } from './workout-plan-position';

describe('resolveWorkoutBuilderPosition', () => {
  it('mapeia semanas globais para mesociclo e microciclo com quatro semanas por meso', () => {
    expect(resolveWorkoutBuilderPosition(1, 4)).toEqual({ mesocycleNumber: 1, weekNumber: 1 });
    expect(resolveWorkoutBuilderPosition(4, 4)).toEqual({ mesocycleNumber: 1, weekNumber: 4 });
    expect(resolveWorkoutBuilderPosition(5, 4)).toEqual({ mesocycleNumber: 2, weekNumber: 1 });
    expect(resolveWorkoutBuilderPosition(12, 4)).toEqual({ mesocycleNumber: 3, weekNumber: 4 });
  });

  it('respeita quantidade configurável de semanas por mesociclo', () => {
    expect(resolveWorkoutBuilderPosition(4, 3)).toEqual({ mesocycleNumber: 2, weekNumber: 1 });
    expect(resolveWorkoutBuilderPosition(7, 3)).toEqual({ mesocycleNumber: 3, weekNumber: 1 });
  });

  it('normaliza valores inválidos para a primeira posição do plano', () => {
    expect(resolveWorkoutBuilderPosition(0, 0)).toEqual({ mesocycleNumber: 1, weekNumber: 1 });
    expect(resolveWorkoutBuilderPosition(Number.NaN, Number.NaN)).toEqual({
      mesocycleNumber: 1,
      weekNumber: 1,
    });
  });
});
