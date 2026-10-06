import { describe, expect, it } from 'vitest';
import {
  assertWorkoutSessionTransition,
  EXECUTION_TRANSITIONS,
  TERMINAL_EXECUTION_STATUSES,
  WorkoutSessionExecutionTransitionError,
} from './workout-session-execution.domain.js';

describe('workout session execution lifecycle (#389)', () => {
  it('expõe exatamente a matriz canônica de transições', () => {
    expect(EXECUTION_TRANSITIONS).toEqual({
      not_started: ['in_progress', 'not_performed'],
      in_progress: ['paused', 'completed', 'partial'],
      paused: ['in_progress', 'partial'],
      completed: [],
      partial: [],
      not_performed: [],
    });
  });

  it.each([
    ['not_started', 'in_progress'],
    ['not_started', 'not_performed'],
    ['in_progress', 'paused'],
    ['in_progress', 'completed'],
    ['in_progress', 'partial'],
    ['paused', 'in_progress'],
    ['paused', 'partial'],
  ] as const)('aceita %s -> %s', (from, to) => {
    expect(() => assertWorkoutSessionTransition(from, to)).not.toThrow();
  });

  it.each([
    ['not_started', 'completed'],
    ['in_progress', 'not_performed'],
    ['paused', 'completed'],
    ['completed', 'in_progress'],
    ['partial', 'in_progress'],
    ['not_performed', 'in_progress'],
  ] as const)('rejeita %s -> %s', (from, to) => {
    expect(() => assertWorkoutSessionTransition(from, to)).toThrow(WorkoutSessionExecutionTransitionError);
  });

  it('mantém os três estados terminais sem saída', () => {
    expect([...TERMINAL_EXECUTION_STATUSES]).toEqual(['completed', 'partial', 'not_performed']);
  });
});
