import type { AdipometryAssessmentSummary } from '@corrida/types';

export type AdipometryMutationCapabilities = {
  canManage: boolean;
  canCorrectCompleted: boolean;
};

type AdipometryRevisionIdentity = Pick<AdipometryAssessmentSummary, 'revisionNumber'>;

export function canMutateAdipometryAssessment(
  assessment: AdipometryRevisionIdentity | null | undefined,
  capabilities: AdipometryMutationCapabilities
): boolean {
  if (!assessment) return capabilities.canManage;
  return assessment.revisionNumber > 1
    ? capabilities.canCorrectCompleted
    : capabilities.canManage;
}
