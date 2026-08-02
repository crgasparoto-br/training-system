export const ADIPOMETRY_CLINICAL_RESPONSIBLE_DOMAIN =
  'ADIPOMETRY_CLINICAL_RESPONSIBLE' as const;

export const ADIPOMETRY_PROTOCOL_APPROVAL_BLOCK_KEY =
  'settings.contract.adipometryProtocolApproval' as const;

export const ADIPOMETRY_RESPONSIBILITY_MANAGEMENT_BLOCK_KEY =
  'settings.contract.actions.manageClinicalTechnicalResponsibility' as const;

export type AdipometryContractProtocolStatus = 'DRAFT' | 'APPROVED' | 'DISABLED';

export interface AdipometryClinicalResponsibleSummary {
  id: string;
  contractId: string;
  domain: typeof ADIPOMETRY_CLINICAL_RESPONSIBLE_DOMAIN;
  professorId: string;
  professorName: string;
  professorCref: string;
  collaboratorFunctionName: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  designatedAt: string;
  endedAt?: string | null;
  endReason?: string | null;
  active: boolean;
}

export interface AdipometryEligibleClinicalResponsible {
  professorId: string;
  professorName: string;
  professorCref: string;
  collaboratorFunctionName: string;
}

export interface AdipometryProtocolApprovalSummary {
  id: string;
  contractId: string;
  protocolCode: string;
  protocolVersion: number;
  responsibilityId: string;
  approvedByProfessorId: string;
  approvedByNameSnapshot: string;
  approvedByCrefSnapshot: string;
  approvedAt: string;
  approvalStatement: string;
  approvedSpecificationHash: string;
  revokedAt?: string | null;
  revokedByProfessorId?: string | null;
  revokedByUserId?: string | null;
  revocationReason?: string | null;
  active: boolean;
}

export interface AdipometryGovernedProtocolSummary {
  id: string;
  code: string;
  version: number;
  internalVersion: string;
  name: string;
  definitionStatus: 'DRAFT' | 'APPROVED' | 'DISABLED';
  contractStatus: AdipometryContractProtocolStatus;
  reference?: string | null;
  specificationHash: string;
  approval?: AdipometryProtocolApprovalSummary | null;
}

export interface AdipometryGovernanceResponse {
  domain: typeof ADIPOMETRY_CLINICAL_RESPONSIBLE_DOMAIN;
  currentResponsibility?: AdipometryClinicalResponsibleSummary | null;
  responsibilityHistory: AdipometryClinicalResponsibleSummary[];
  eligibleProfessionals: AdipometryEligibleClinicalResponsible[];
  protocols: AdipometryGovernedProtocolSummary[];
  canManageResponsibility: boolean;
  canCurrentUserApprove: boolean;
  canCurrentUserRevoke: boolean;
}

export interface DesignateAdipometryClinicalResponsibleInput {
  professorId: string;
  endReason?: string;
}

export interface ApproveAdipometryProtocolInput {
  approvalStatement: string;
  approvedSpecificationHash: string;
}

export interface RevokeAdipometryProtocolInput {
  reason: string;
}
