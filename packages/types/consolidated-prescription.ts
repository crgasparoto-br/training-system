import type {
  CapacityPrescriptionSourceRef,
  CapacityPrescriptionStatus,
  PhysicalCapacityType,
} from './capacity-prescription.js';

export const CONSOLIDATED_PRESCRIPTION_STATUSES = [
  'draft',
  'ready_for_review',
  'approved',
  'released',
  'blocked',
  'archived',
] as const;

export type ConsolidatedPrescriptionStatus = (typeof CONSOLIDATED_PRESCRIPTION_STATUSES)[number];

export const CONSOLIDATED_PRESCRIPTION_DATA_REF_ROLES = [
  'capacity_source',
  'assessment',
  'routine',
  'manual_observation',
  'exercise_substitution',
] as const;

export type ConsolidatedPrescriptionDataRefRole =
  (typeof CONSOLIDATED_PRESCRIPTION_DATA_REF_ROLES)[number];

export interface ConsolidatedPrescriptionCapacityVersionInput {
  capacityPrescriptionVersionId: string;
  position?: number | null;
}

export interface ConsolidatedCapacityBlock {
  id: string;
  capacityPrescriptionVersionId: string;
  capacity: PhysicalCapacityType;
  capacityVersion: number;
  capacityStatus: CapacityPrescriptionStatus;
  position: number;
}

export interface ConsolidatedPrescriptionDataRef {
  id: string;
  role: ConsolidatedPrescriptionDataRefRole;
  sourceType: CapacityPrescriptionSourceRef['type'] | 'routine' | 'manual_observation' | 'exercise_substitution';
  sourceId: string;
  label?: string | null;
  assessedAt?: string | null;
  origin?: string | null;
  sourceVersion?: number | string | null;
  responsibleProfessorId?: string | null;
  context?: Record<string, unknown> | null;
}

export interface ConsolidatedPrescriptionDataRefInput
  extends Omit<ConsolidatedPrescriptionDataRef, 'id' | 'role'> {
  role: Exclude<ConsolidatedPrescriptionDataRefRole, 'capacity_source'>;
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
    capacityPrescriptionVersionId: string;
    capacity: PhysicalCapacityType;
    version: number;
    status: CapacityPrescriptionStatus;
  }>;
}

export interface ConsolidatedPrescriptionSummary {
  id: string;
  contractId: string;
  alunoId: string;
  currentVersion: number;
  currentStatus: ConsolidatedPrescriptionStatus;
  createdByProfessorId: string;
  updatedByProfessorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConsolidatedPrescriptionVersionDetail {
  id: string;
  assemblyId: string;
  contractId: string;
  alunoId: string;
  version: number;
  previousVersionId?: string | null;
  status: ConsolidatedPrescriptionStatus;
  responsibleProfessorId: string;
  technicalObservation?: string | null;
  professorJustification: string;
  studentInstruction?: string | null;
  reviewedByProfessorId?: string | null;
  reviewedAt?: string | null;
  approvedByProfessorId?: string | null;
  approvedAt?: string | null;
  blockedByProfessorId?: string | null;
  blockedAt?: string | null;
  blockReason?: string | null;
  createdByProfessorId: string;
  createdAt: string;
  capacityBlocks: ConsolidatedCapacityBlock[];
  dataRefs: ConsolidatedPrescriptionDataRef[];
  conflicts: ConsolidatedPrescriptionConflict[];
  traceability: ConsolidatedPrescriptionTraceability;
  canReleaseOperationalWorkout: boolean;
  createsTodayWorkoutDirectly: false;
}

export interface ConsolidatedPrescriptionAssembly extends ConsolidatedPrescriptionSummary {
  latestVersion: ConsolidatedPrescriptionVersionDetail;
}

export interface ConsolidatedPrescriptionCompositionPayload {
  responsibleProfessorId?: string | null;
  capacityBlocks: ConsolidatedPrescriptionCapacityVersionInput[];
  dataRefs?: ConsolidatedPrescriptionDataRefInput[];
  technicalObservation?: string | null;
  professorJustification: string;
  studentInstruction?: string | null;
}

export type CreateConsolidatedPrescriptionDraftPayload = ConsolidatedPrescriptionCompositionPayload;

export interface UpdateConsolidatedPrescriptionCompositionPayload
  extends ConsolidatedPrescriptionCompositionPayload {
  expectedCurrentVersion: number;
}

export interface ConsolidatedPrescriptionVersionCommand {
  expectedCurrentVersion: number;
}

export interface BlockConsolidatedPrescriptionCommand extends ConsolidatedPrescriptionVersionCommand {
  reason: string;
}

export interface ConsolidatedPrescriptionHistory {
  assembly: ConsolidatedPrescriptionSummary;
  versions: ConsolidatedPrescriptionVersionDetail[];
}

export interface ConsolidatedPrescriptionConflictResponse {
  code: 'CONFLICT';
  message: string;
  expectedCurrentVersion: number;
  actualCurrentVersion: number;
}

export interface ConsolidatedPrescriptionAlertResponse {
  code: string;
  message: string;
  severity: ConsolidatedPrescriptionConflict['severity'];
  version: number;
}

/**
 * @deprecated Use CreateConsolidatedPrescriptionDraftPayload. Contract/status/version and
 * approval metadata are intentionally no longer accepted from the client.
 */
export type CreateConsolidatedPrescriptionAssemblyPayload = CreateConsolidatedPrescriptionDraftPayload;
