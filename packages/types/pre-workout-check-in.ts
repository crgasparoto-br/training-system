export const PRE_WORKOUT_CHECK_IN_RULE_SET_VERSION = 'pre-workout-check-in-v1' as const;

export type PreWorkoutPainTriage = 'green' | 'attention' | 'alert';

export interface PreWorkoutCheckInValues {
  psr: number | null;
  sleepQuality: number | null;
  fatigue: number | null;
  painLevel: number | null;
  motivation: number | null;
  availableMinutes: number | null;
  notes: string | null;
}

export interface PreWorkoutCheckInRuleSnapshot {
  version: typeof PRE_WORKOUT_CHECK_IN_RULE_SET_VERSION;
  painTriage: PreWorkoutPainTriage | null;
  studentMessage: string | null;
  technicalMessage: string | null;
  blocksWorkout: false;
  changesWorkoutAutomatically: false;
}

export interface PreWorkoutCheckInView {
  id: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  editable: boolean;
  values: PreWorkoutCheckInValues;
  guidance: Pick<PreWorkoutCheckInRuleSnapshot, 'painTriage' | 'studentMessage' | 'blocksWorkout' | 'changesWorkoutAutomatically'>;
  technical?: {
    ruleSetVersion: string;
    technicalMessage: string | null;
  };
}

export interface UpsertPreWorkoutCheckInPayload {
  operationKey: string;
  psr?: number | null;
  sleepQuality?: number | null;
  fatigue?: number | null;
  painLevel?: number | null;
  motivation?: number | null;
  availableMinutes?: number | null;
  notes?: string | null;
}
