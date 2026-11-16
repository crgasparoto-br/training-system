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


/** Contrato canônico e revisionado do feedback pós-treino (#390). */
export const POST_WORKOUT_FEEDBACK_RULE_SET_VERSION = 'post-workout-feedback-v1' as const;
export const POST_WORKOUT_FEEDBACK_FATIGUE_LEVELS = ['low', 'medium', 'high'] as const;
export const POST_WORKOUT_FEEDBACK_ENERGY_LEVELS = ['good', 'medium', 'poor'] as const;
export const POST_WORKOUT_FEEDBACK_SLEEP_LEVELS = ['good', 'medium', 'poor'] as const;
export type PostWorkoutFeedbackFatigueLevel = (typeof POST_WORKOUT_FEEDBACK_FATIGUE_LEVELS)[number];
export type PostWorkoutFeedbackEnergyLevel = (typeof POST_WORKOUT_FEEDBACK_ENERGY_LEVELS)[number];
export type PostWorkoutFeedbackSleepLevel = (typeof POST_WORKOUT_FEEDBACK_SLEEP_LEVELS)[number];
export type PostWorkoutFeedbackPainTriage = 'green' | 'attention' | 'alert';
export type PostWorkoutFeedbackExecutionStatus = 'completed' | 'partial';

export interface CanonicalPostWorkoutFeedbackValues {
  pse: number | null;
  psr: number | null;
  painBefore: number | null;
  painDuring: number | null;
  painAfter: number | null;
  painLocation: string | null;
  difficulty: number | null;
  fatigueLevel: PostWorkoutFeedbackFatigueLevel | null;
  energyLevel: PostWorkoutFeedbackEnergyLevel | null;
  sleepQuality: PostWorkoutFeedbackSleepLevel | null;
  dizziness: boolean | null;
  observations: string | null;
  professorTechnicalNotes: string | null;
}
export interface PostWorkoutFeedbackSignal {
  code: 'pain_green' | 'pain_attention' | 'pain_alert' | 'dizziness' | 'fatigue_high';
  severity: 'info' | 'warning' | 'critical';
  painTriage: PostWorkoutFeedbackPainTriage | null;
  studentMessage: string;
  technicalMessage: string;
  requiresFollowUp: boolean;
  changesWorkoutAutomatically: false;
}
export interface CanonicalPostWorkoutFeedbackRevisionView {
  id: string;
  sessionId: string;
  executionId: string;
  executionStatus: PostWorkoutFeedbackExecutionStatus;
  scopeKey: string;
  capacity: PhysicalCapacityType | null;
  revisionNumber: number;
  previousRevisionId: string | null;
  correctionReason: string | null;
  perceptionAuthor: PostWorkoutFeedbackActor;
  revisedBy: PostWorkoutFeedbackActor;
  createdAt: string;
  values: CanonicalPostWorkoutFeedbackValues;
  signals: PostWorkoutFeedbackSignal[];
  current: boolean;
  technical?: {
    ruleSetVersion: string;
    originReleaseId: string;
    originWorkoutTemplateId: string;
    originTrainingPlanId: string;
  };
}
export interface CreateCanonicalPostWorkoutFeedbackPayload {
  operationKey: string;
  capacity?: PhysicalCapacityType | null;
  values: Partial<CanonicalPostWorkoutFeedbackValues>;
}
export interface CorrectCanonicalPostWorkoutFeedbackPayload {
  operationKey: string;
  baseRevisionId: string;
  reason: string;
  values: Partial<CanonicalPostWorkoutFeedbackValues>;
}


/** Canonical durable decision contract (#406). */
export const POST_WORKOUT_DECISION_ACTIONS = ['maintain','progress','reduce','replace','suspend','reassess'] as const;
export type PostWorkoutDecisionAction = (typeof POST_WORKOUT_DECISION_ACTIONS)[number];
export type PostWorkoutDecisionStatus = 'suggested'|'approved'|'rejected'|'applied';
export interface PostWorkoutDecisionView {
  id:string;alunoId:string;contractId:string;workoutDayId:string;sourceFeedbackRevisionId:string;
  trainingPlanId:string;action:PostWorkoutDecisionAction;rationale:string;status:PostWorkoutDecisionStatus;version:number;
  suggestedAt:string;suggestedByProfessorId:string;approvedAt:string|null;approvedByProfessorId:string|null;
  approvalReason:string|null;rejectedAt:string|null;rejectedByProfessorId:string|null;rejectionReason:string|null;
  appliedAt:string|null;appliedByProfessorId:string|null;studentMessage:string|null;exposeToStudent:boolean;
  sourceSnapshot:{feedbackRevisionNumber:number;scopeKey:string;ruleSetVersion:string;recordedAt:string;originReleaseId:string;values:CanonicalPostWorkoutFeedbackValues;signals:PostWorkoutFeedbackSignal[]};
  adjustment:{id:string;version:number;effectiveFrom:string;instruction:string}|null;
}
export interface CreatePostWorkoutDecisionPayload {
  operationKey:string;workoutDayId:string;sourceFeedbackRevisionId:string;action:PostWorkoutDecisionAction;
  rationale:string;studentMessage?:string|null;exposeToStudent?:boolean;
}
export interface TransitionPostWorkoutDecisionPayload {operationKey:string;expectedVersion:number;reason?:string;}
export interface ApplyPostWorkoutDecisionPayload extends TransitionPostWorkoutDecisionPayload {
  expectedPlanningVersion:number;effectiveFrom:string;instruction:string;
}
export interface PostWorkoutDecisionSource {
  workoutDayId:string;feedbackRevisionId:string;revisionNumber:number;recordedAt:string;scopeKey:string;signals:PostWorkoutFeedbackSignal[];
}
export interface PostWorkoutDecisionStudentNotice {id:string;action:PostWorkoutDecisionAction;message:string;appliedAt:string;}
