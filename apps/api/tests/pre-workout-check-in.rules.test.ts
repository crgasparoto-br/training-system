import { evaluatePreWorkoutCheckInRules } from '../src/modules/workout/pre-workout-check-in.service.js';

describe('pre-workout check-in rules (#388)', () => {
  it.each([
    [0, 'green'],
    [2, 'green'],
    [3, 'attention'],
    [4, 'attention'],
    [5, 'alert'],
    [9, 'alert'],
  ])('aplica somente a triagem canônica de dor %s', (painLevel, expected) => {
    const result = evaluatePreWorkoutCheckInRules(painLevel);
    expect(result.painTriage).toBe(expected);
    expect(result.blocksWorkout).toBe(false);
    expect(result.changesWorkoutAutomatically).toBe(false);
  });

  it('não inventa alerta nem score quando dor/desconforto não foi informado', () => {
    const result = evaluatePreWorkoutCheckInRules(null);
    expect(result).toMatchObject({
      painTriage: null,
      studentMessage: null,
      technicalMessage: null,
      blocksWorkout: false,
      changesWorkoutAutomatically: false,
    });
    expect(result).not.toHaveProperty('readinessScore');
  });
});
