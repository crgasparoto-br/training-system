import type { PhysicalCapacityType } from './capacity-prescription.js';

export const POST_WORKOUT_FEEDBACK_ACTORS = ['student', 'professor'] as const;
export type PostWorkoutFeedbackActor = (typeof POST_WORKOUT_FEEDBACK_ACTORS)[number];

export const SUGGESTED_DECISION_ACTIONS = [
  'maintain',
  'progress',
  'reduce',
  'swap',
  'suspend',
  'reassess',
] as const;

export type SuggestedDecisionAction = (typeof SUGGESTED_DECISION_ACTIONS)[number];

export const SUGGESTED_DECISION_STATUSES = [
  'suggested',
  'approved',
  'rejected',
  'applied',
] as const;

export type SuggestedDecisionStatus = (typeof SUGGESTED_DECISION_STATUSES)[number];

export interface PostWorkoutExecutionMetrics {
  plannedExercises?: number | null;
  completedExercises?: number | null;
  plannedSessions?: number | null;
  completedSessions?: number | null;
  plannedHomework?: number | null;
  completedHomework?: number | null;
  plannedVolume?: number | null;
  completedVolume?: number | null;
  tonnage?: number | null;
  calories?: number | null;
  durationMinutes?: number | null;
  adherenceRate?: number | null;
}

export interface PostWorkoutCapacityFeedback {
  capacity: PhysicalCapacityType;
  actor: PostWorkoutFeedbackActor;
  pse?: number | null;
  psr?: number | null;
  difficulty?: number | null;
  painLevel?: number | null;
  discomfortNotes?: string | null;
  dizziness?: boolean | null;
  fatigue?: number | null;
  loadUsed?: string | null;
  repsExecuted?: string | null;
  adherenceNotes?: string | null;
  observations?: string | null;
}

export interface SuggestedPostWorkoutDecision {
  action: SuggestedDecisionAction;
  status: SuggestedDecisionStatus;
  rationale: string;
  technicalMessage: string;
  studentMessage?: string | null;
  createdBy: 'system' | 'professor';
  approvedByProfessorId?: string | null;
  approvedAt?: string | null;
  appliedAt?: string | null;
  changesPrescriptionAutomatically: false;
}

export interface PostWorkoutFeedbackSession {
  id?: string;
  workoutDayId: string;
  workoutExecutionIds: string[];
  consolidatedPrescriptionId?: string | null;
  alunoId: string;
  contractId: string;
  responsibleProfessorId?: string | null;
  feedbackAt: string;
  sessionStatus: 'completed' | 'partial' | 'missed' | 'cancelled';
  readiness?: number | null;
  generalWellBeing?: number | null;
  finalClassFeedback?: string | null;
  studentPracticalSummary?: string | null;
  professorTechnicalNotes?: string | null;
  executionMetrics: PostWorkoutExecutionMetrics;
  capacityFeedback: PostWorkoutCapacityFeedback[];
  suggestedDecision: SuggestedPostWorkoutDecision;
  timelineSummary: string;
  updatesProntuarioFollowUp: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePostWorkoutFeedbackSessionPayload {
  workoutDayId: string;
  workoutExecutionIds?: string[];
  consolidatedPrescriptionId?: string | null;
  alunoId: string;
  contractId: string;
  responsibleProfessorId?: string | null;
  sessionStatus: PostWorkoutFeedbackSession['sessionStatus'];
  readiness?: number | null;
  generalWellBeing?: number | null;
  finalClassFeedback?: string | null;
  studentPracticalSummary?: string | null;
  professorTechnicalNotes?: string | null;
  executionMetrics?: PostWorkoutExecutionMetrics;
  capacityFeedback: PostWorkoutCapacityFeedback[];
}
