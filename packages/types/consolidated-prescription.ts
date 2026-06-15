import type { CapacityPrescriptionDraft, CapacityPrescriptionSourceRef, PhysicalCapacityType } from './capacity-prescription.js';

export const CONSOLIDATED_PRESCRIPTION_STATUSES = [
  'draft',
  'ready_for_review',
  'approved',
  'released',
  'blocked',
  'archived',
] as const;

export type ConsolidatedPrescriptionStatus = (typeof CONSOLIDATED_PRESCRIPTION_STATUSES)[number];

export type ConsolidatedCapacityValidationStatus = 'validated' | 'pending' | 'rejected';

export interface ConsolidatedCapacityBlock {
  capacity: PhysicalCapacityType;
  capacityVersion: number;
  status: CapacityPrescriptionDraft['status'];
  validationStatus: ConsolidatedCapacityValidationStatus;
  draft: CapacityPrescriptionDraft;
}

export interface ConsolidatedPrescriptionDataRef extends CapacityPrescriptionSourceRef {
  role: 'capacity_source' | 'assessment' | 'routine' | 'manual_observation' | 'exercise_substitution';
}

export interface ConsolidatedPrescriptionConflict {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  affectedCapacities: PhysicalCapacityType[];
  sourceRefIds: string[];
}

export interface ConsolidatedPrescriptionTraceability {
  capacityCount: number;
  sourceRefIds: string[];
  capacityVersions: Array<{
    capacity: PhysicalCapacityType;
    version: number;
  }>;
}

export interface ConsolidatedPrescriptionAssembly {
  alunoId: string;
  contractId: string;
  responsibleProfessorId: string;
  version: number;
  status: ConsolidatedPrescriptionStatus;
  capacityBlocks: ConsolidatedCapacityBlock[];
  dataRefs: ConsolidatedPrescriptionDataRef[];
  conflicts: ConsolidatedPrescriptionConflict[];
  technicalObservation?: string | null;
  professorJustification: string;
  studentInstruction?: string | null;
  validatedByProfessorId?: string | null;
  validatedAt?: string | null;
  traceability: ConsolidatedPrescriptionTraceability;
  canReleaseOperationalWorkout: boolean;
  createsTodayWorkoutDirectly: false;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConsolidatedPrescriptionAssemblyPayload {
  alunoId: string;
  contractId: string;
  responsibleProfessorId: string;
  version?: number;
  status?: ConsolidatedPrescriptionStatus;
  capacityBlocks: ConsolidatedCapacityBlock[];
  dataRefs?: ConsolidatedPrescriptionDataRef[];
  technicalObservation?: string | null;
  professorJustification: string;
  studentInstruction?: string | null;
  validatedByProfessorId?: string | null;
  validatedAt?: string | null;
}
