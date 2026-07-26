import type { StudentLifecycleStatus, StudentOnboardingModuleStatus } from './student-lifecycle.js';

export const PRE_REGISTRATION_DUPLICATE_CLASSIFICATIONS = [
  'NONE',
  'INFORMATIONAL',
  'REVIEW_REQUIRED',
  'BLOCKING',
] as const;

export type PreRegistrationDuplicateClassification =
  (typeof PRE_REGISTRATION_DUPLICATE_CLASSIFICATIONS)[number];

export const PRE_REGISTRATION_DUPLICATE_SIGNAL_CODES = [
  'CPF_EXACT',
  'ACCOUNT_ALREADY_LINKED',
  'ACCOUNT_INCOMPATIBLE',
  'EMAIL_EXACT',
  'PHONE_EXACT',
  'NAME_AND_BIRTH_DATE',
  'NAME_SIMILAR',
] as const;

export type PreRegistrationDuplicateSignalCode =
  (typeof PRE_REGISTRATION_DUPLICATE_SIGNAL_CODES)[number];

export interface PreRegistrationDuplicateSignalDTO {
  code: PreRegistrationDuplicateSignalCode;
  classification: Exclude<PreRegistrationDuplicateClassification, 'NONE'>;
  label: string;
}

export interface PreRegistrationIdentityDifferenceDTO {
  field:
    | 'name'
    | 'cpf'
    | 'birthDate'
    | 'phone'
    | 'additionalPhone'
    | 'email'
    | 'additionalEmail'
    | 'guardianName'
    | 'guardianCpf'
    | 'guardianPhone'
    | 'guardianEmail';
  label: string;
  sourceValueMasked?: string;
  canonicalValueMasked?: string;
  sourceEmpty: boolean;
  canonicalEmpty: boolean;
  sensitive: boolean;
}

export interface PreRegistrationDuplicateCandidateDTO {
  candidateAlunoId: string;
  maskedName: string;
  status: StudentLifecycleStatus;
  classification: Exclude<PreRegistrationDuplicateClassification, 'NONE'>;
  signals: PreRegistrationDuplicateSignalDTO[];
  differences: PreRegistrationIdentityDifferenceDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface PreRegistrationLeadDuplicateCheckDTO {
  fingerprint: string;
  classification: PreRegistrationDuplicateClassification;
  candidates: PreRegistrationDuplicateCandidateDTO[];
  restrictedCandidateCount: number;
  hasBlockingCpfConflict: boolean;
}

export interface PreRegistrationDuplicateDecisionDTO {
  action: 'CONFIRM_DIFFERENT' | 'USE_EXISTING_CANONICAL';
  candidateAlunoId?: string;
  reason: string;
  fingerprint: string;
  reviewedRecordVersion: number;
  decidedAt: string;
  validUntil: string;
  actorProfessorId?: string;
}

export interface PreRegistrationEnrollmentReviewDTO {
  alunoId: string;
  status: StudentLifecycleStatus;
  recordVersion: number;
  fingerprint: string;
  classification: PreRegistrationDuplicateClassification;
  candidates: PreRegistrationDuplicateCandidateDTO[];
  restrictedCandidateCount?: number;
  currentDecision?: PreRegistrationDuplicateDecisionDTO;
  canConfirmDifferentPeople: boolean;
  canUseExistingCanonical: boolean;
  canMarkReady: boolean;
  canConfirmEnrollment: boolean;
  health: {
    healthModuleStatus: StudentOnboardingModuleStatus;
    parqModuleStatus: StudentOnboardingModuleStatus;
    parqRequiresProfessionalReview: boolean;
  };
  downstream: {
    contract: 'NOT_CONFIGURED';
    plan: 'NOT_CONFIGURED';
    billing: 'NOT_CONFIGURED';
    responsibleProfessor: 'NOT_CONFIGURED';
    schedule: 'NOT_CONFIGURED';
  };
}

export type PreRegistrationIdentityFieldDecision =
  | 'KEEP_CANONICAL'
  | 'USE_SOURCE_IF_EMPTY';

export interface PreRegistrationDuplicateDecisionInputDTO {
  action: 'CONFIRM_DIFFERENT' | 'USE_EXISTING_CANONICAL' | 'CANCEL';
  candidateAlunoId?: string;
  reason?: string;
  expectedVersion: number;
  fingerprint: string;
  fieldDecisions?: Partial<
    Record<PreRegistrationIdentityDifferenceDTO['field'], PreRegistrationIdentityFieldDecision>
  >;
}

export interface PreRegistrationReadyForEnrollmentInputDTO {
  expectedVersion: number;
  fingerprint: string;
  reason: string;
}

export interface PreRegistrationConfirmEnrollmentInputDTO {
  expectedVersion: number;
  fingerprint: string;
  confirmationAccepted: true;
}

export interface PreRegistrationEnrollmentResultDTO {
  alunoId: string;
  status: 'ACTIVE_STUDENT';
  redirectTo: string;
  idempotent: boolean;
}

export interface PreRegistrationConsolidationResultDTO {
  canonicalAlunoId: string;
  duplicateAlunoId: string;
  redirectTo: string;
}
