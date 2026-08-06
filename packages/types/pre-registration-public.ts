import type {
  StudentLifecycleStatus,
  StudentOnboardingModuleStatus,
  UpdateStudentPreRegistrationDTO,
} from './student-lifecycle.js';

export const PRE_REGISTRATION_STEPS = [
  'IDENTIFICATION',
  'CONTACT',
  'ADDRESS',
  'GUARDIAN',
  'PRIVACY',
] as const;

export type PreRegistrationStep = (typeof PRE_REGISTRATION_STEPS)[number];

export const PRE_REGISTRATION_CLAIM_ROLES = ['STUDENT', 'GUARDIAN'] as const;
export type PreRegistrationClaimRole = (typeof PRE_REGISTRATION_CLAIM_ROLES)[number];

export interface PreRegistrationPublicTenantDTO {
  name: string;
  logoUrl?: string;
  privacyNoticeUrl: string;
}

export interface PreRegistrationPublicLandingDTO {
  purpose: 'PRE_REGISTRATION';
  expiresAt: string;
  greeting?: string;
  tenant: PreRegistrationPublicTenantDTO;
  lead?: {
    name?: string;
    email?: string;
  };
  stages: Array<{
    key: 'BASIC_DATA' | 'ANAMNESIS' | 'PARQ';
    title: string;
    optional: boolean;
  }>;
  approximateDuration: string;
}

export interface PreRegistrationAccountRegistrationDTO {
  name: string;
  email: string;
  password: string;
  role: PreRegistrationClaimRole;
}

export interface PreRegistrationClaimDTO {
  token: string;
  role: PreRegistrationClaimRole;
}

export interface PreRegistrationClaimResultDTO {
  alunoId: string;
  redirectTo: '/pre-cadastro';
}

export interface ConfirmGuardianAuthorizationDTO {
  relationship: string;
  declarationAccepted: true;
}

export interface RequestGuardianAuthorizationResultDTO {
  status: 'PENDING' | 'ACTIVE';
  relationship: string;
  requestedAt?: string;
  approvalRequired: boolean;
}

export interface PreRegistrationGuardianAuthorizationDTO {
  status: 'NOT_REQUIRED' | 'PENDING' | 'ACTIVE' | 'REVOKED';
  role?: PreRegistrationClaimRole;
  relationship?: string;
  validatedAt?: string;
  revokedAt?: string;
}

export interface PreRegistrationIdentityDTO extends UpdateStudentPreRegistrationDTO {
  gender?: 'male' | 'female' | 'other';
}

export interface PreRegistrationNextStepDTO {
  key: 'ANAMNESIS' | 'PARQ';
  title: string;
  description: string;
  optional: true;
  status: StudentOnboardingModuleStatus;
  action: 'START' | 'CONTINUE' | 'VIEW';
  href: string;
}

export interface PreRegistrationProcessSummaryDTO {
  alunoId: string;
  status: StudentLifecycleStatus;
  claimRole: PreRegistrationClaimRole;
  currentStep: PreRegistrationStep;
  lastSavedAt?: string;
  displayName: string;
  tenant: PreRegistrationPublicTenantDTO;
  guardianAuthorizationStatus: PreRegistrationGuardianAuthorizationDTO['status'];
  guardianAuthorizationRelationship?: string;
  guardianAuthorizationRequestedAt?: string;
  requiresGuardianConfirmation: boolean;
}

export interface PreRegistrationSessionDTO {
  alunoId: string;
  status: StudentLifecycleStatus;
  version: number;
  currentStep: PreRegistrationStep;
  lastSavedAt?: string;
  completedAt?: string;
  tenant: PreRegistrationPublicTenantDTO;
  identity: PreRegistrationIdentityDTO;
  isMinor: boolean;
  claimRole: PreRegistrationClaimRole;
  guardianAuthorization: PreRegistrationGuardianAuthorizationDTO;
  privacy: {
    noticeVersion: string;
    noticeUrl: string;
    acceptedAt?: string;
  };
  missingRequiredFields: string[];
  duplicateWarnings: Array<'email' | 'phone'>;
  nextSteps: PreRegistrationNextStepDTO[];
}

export type PreRegistrationIdentificationStepDTO = Partial<
  Pick<PreRegistrationIdentityDTO, 'name' | 'birthDate' | 'cpf' | 'gender'>
>;

export type PreRegistrationContactStepDTO = Partial<
  Pick<PreRegistrationIdentityDTO, 'phone' | 'additionalPhone' | 'email' | 'additionalEmail'>
>;

export type PreRegistrationAddressStepDTO = Partial<
  Pick<
    PreRegistrationIdentityDTO,
    | 'addressZipCode'
    | 'addressStreet'
    | 'addressNumber'
    | 'addressComplement'
    | 'addressNeighborhood'
    | 'addressCity'
    | 'addressState'
  >
>;

export type PreRegistrationGuardianStepDTO = Partial<
  Pick<
    PreRegistrationIdentityDTO,
    'guardianName' | 'guardianCpf' | 'guardianPhone' | 'guardianEmail'
  >
>;

export type SavePreRegistrationStepDTO =
  | {
      expectedVersion: number;
      step: 'IDENTIFICATION';
      data: PreRegistrationIdentificationStepDTO;
    }
  | {
      expectedVersion: number;
      step: 'CONTACT';
      data: PreRegistrationContactStepDTO;
    }
  | {
      expectedVersion: number;
      step: 'ADDRESS';
      data: PreRegistrationAddressStepDTO;
    }
  | {
      expectedVersion: number;
      step: 'GUARDIAN';
      data: PreRegistrationGuardianStepDTO;
    }
  | {
      expectedVersion: number;
      step: 'PRIVACY';
      data: Record<string, never>;
    };

export interface CompletePreRegistrationDTO {
  expectedVersion: number;
  privacyAccepted: true;
}

export type PreRegistrationPublicErrorCode =
  | 'INVALID_INVITE'
  | 'ACCOUNT_EXISTS'
  | 'ACCOUNT_INCOMPATIBLE'
  | 'ACCOUNT_ALREADY_LINKED'
  | 'CONCURRENT_MODIFICATION'
  | 'DUPLICATE_REVIEW_REQUIRED'
  | 'MISSING_REQUIRED_FIELDS'
  | 'GUARDIAN_AUTHORIZATION_REQUIRED'
  | 'PRE_REGISTRATION_COMPLETED'
  | 'ACTIVE_STUDENT'
  | 'NOT_FOUND';