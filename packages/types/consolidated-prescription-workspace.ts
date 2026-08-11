import type {
  CapacityPrescriptionSourceRef,
  CapacityPrescriptionStatus,
  PhysicalCapacityType,
} from './capacity-prescription.js';

export const CONSOLIDATED_CAPACITY_CANDIDATE_REASON_CODES = [
  'eligible',
  'missing_prescription',
  'missing_current_version',
  'prescription_not_active',
  'version_not_active',
] as const;

export type ConsolidatedCapacityCandidateReasonCode =
  (typeof CONSOLIDATED_CAPACITY_CANDIDATE_REASON_CODES)[number];

export interface ConsolidatedPrescriptionWorkspacePerson {
  id: string;
  name: string | null;
}

export interface ConsolidatedPrescriptionCapacityCandidate {
  capacity: PhysicalCapacityType;
  prescriptionId: string | null;
  prescriptionStatus: CapacityPrescriptionStatus | null;
  capacityPrescriptionVersionId: string | null;
  version: number | null;
  versionStatus: CapacityPrescriptionStatus | null;
  eligible: boolean;
  reasonCode: ConsolidatedCapacityCandidateReasonCode;
  reason: string | null;
  professorSummary: string | null;
  sourceRefs: CapacityPrescriptionSourceRef[];
}

export interface ConsolidatedPrescriptionWorkspaceContext {
  aluno: ConsolidatedPrescriptionWorkspacePerson;
  actorProfessor: ConsolidatedPrescriptionWorkspacePerson;
  assignedProfessor: ConsolidatedPrescriptionWorkspacePerson | null;
  responsibleProfessor: ConsolidatedPrescriptionWorkspacePerson | null;
  capacityCandidates: ConsolidatedPrescriptionCapacityCandidate[];
  capacityCandidatesError: string | null;
}
