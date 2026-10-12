import type { TrainingSessionExecutionStatus } from '@corrida/types';

export const TERMINAL_EXECUTION_STATUSES = new Set<TrainingSessionExecutionStatus>([
  'completed',
  'partial',
  'not_performed',
]);

export const EXECUTION_TRANSITIONS: Readonly<Record<TrainingSessionExecutionStatus, readonly TrainingSessionExecutionStatus[]>> = {
  not_started: ['in_progress', 'not_performed'],
  in_progress: ['paused', 'completed', 'partial'],
  paused: ['in_progress', 'partial'],
  completed: [],
  partial: [],
  not_performed: [],
};

export class WorkoutSessionExecutionTransitionError extends Error {
  readonly code = 'WORKOUT_SESSION_EXECUTION_INVALID_TRANSITION';

  constructor(
    readonly currentStatus: TrainingSessionExecutionStatus,
    readonly targetStatus: TrainingSessionExecutionStatus
  ) {
    super(`Transição de ${currentStatus} para ${targetStatus} não é permitida.`);
  }
}

export function assertWorkoutSessionTransition(
  currentStatus: TrainingSessionExecutionStatus,
  targetStatus: TrainingSessionExecutionStatus
) {
  if (!EXECUTION_TRANSITIONS[currentStatus].includes(targetStatus)) {
    throw new WorkoutSessionExecutionTransitionError(currentStatus, targetStatus);
  }
}
