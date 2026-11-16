import type { PostWorkoutDecisionStatus } from '@corrida/types';

export type PostWorkoutDecisionTransition = 'approve' | 'reject' | 'apply';
export function canTransitionDecision(status: PostWorkoutDecisionStatus, version: number,
  action: PostWorkoutDecisionTransition, expectedVersion: number) {
  return Number.isInteger(expectedVersion) && expectedVersion > 0 &&
    status === (action === 'apply' ? 'approved' : 'suggested') && version === expectedVersion;
}
export function canExposePostWorkoutDecision(status: PostWorkoutDecisionStatus,
  exposeToStudent: boolean, studentMessage: string | null) {
  return status === 'applied' && exposeToStudent && Boolean(studentMessage?.trim());
}
export function isFuturePlanningDate(date: Date, now: Date) {
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(0,0,0,0);
  tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  return date.getTime() >= tomorrow.getTime();
}
