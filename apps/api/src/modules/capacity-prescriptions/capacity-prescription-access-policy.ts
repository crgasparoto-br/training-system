import { canProfessorAccessBlock } from '../access-control/access-control.service.js';

export type CapacityAccessSubject = Parameters<typeof canProfessorAccessBlock>[0];

export const CAPACITY_GOAL_CLASSIFICATION_READ_BLOCKS = [
  'plans.capacityPrescriptions.view',
  'physicalAssessment.prnt.goals',
] as const;

export const CAPACITY_GOAL_CLASSIFICATION_WRITE_BLOCKS = [
  'plans.capacityPrescriptions.manage',
  'physicalAssessment.prnt.goals',
] as const;

export async function canProfessorAccessCapacityBlocks(
  professor: CapacityAccessSubject,
  blockKeys: readonly string[]
) {
  for (const blockKey of blockKeys) {
    if (!(await canProfessorAccessBlock(professor, blockKey))) return false;
  }
  return true;
}
