import type { PreRegistrationClaimRole, PreRegistrationPublicTenantDTO } from './pre-registration-public.js';

export const HEALTH_INTAKE_STEPS = [
  'CONSENT',
  'HEALTH_HISTORY',
  'MEDICATIONS',
  'INJURIES',
  'ACTIVITY',
  'REVIEW',
] as const;

export type HealthIntakeStep = (typeof HEALTH_INTAKE_STEPS)[number];
export type HealthIntakeStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface HealthIntakeAnswersDTO {
  mainGoal?: string;
  hasMedicalConditions?: boolean;
  medicalHistory?: string;
  usesMedication?: boolean;
  currentMedications?: string;
  hasInjuries?: boolean;
  injuriesHistory?: string;
  hasAllergies?: boolean;
  allergies?: string;
  hasExerciseRestrictions?: boolean;
  exerciseRestrictions?: string;
  trainingBackground?: string;
  observations?: string;
}

export interface HealthIntakeConsentDTO {
  privacyNoticeVersion: string;
  accepted: true;
}

export interface HealthIntakeSessionDTO {
  alunoId: string;
  status: HealthIntakeStatus;
  version: number;
  currentStep: HealthIntakeStep;
  formVersion: string;
  answers: HealthIntakeAnswersDTO;
  consent: {
    requiredVersion: string;
    acceptedVersion?: string;
    acceptedAt?: string;
  };
  respondent: {
    role: PreRegistrationClaimRole;
    userId: string;
  };
  lastSavedAt?: string;
  completedAt?: string;
  declarationAcceptedAt?: string;
  migratedFromLegacy: boolean;
  migrationReviewRequired: boolean;
  tenant: PreRegistrationPublicTenantDTO;
}

export type SaveHealthIntakeStepDTO =
  | {
      expectedVersion: number;
      step: 'CONSENT';
      consent: HealthIntakeConsentDTO;
      data: Record<string, never>;
    }
  | {
      expectedVersion: number;
      step: 'HEALTH_HISTORY';
      consent?: HealthIntakeConsentDTO;
      data: Pick<
        HealthIntakeAnswersDTO,
        'mainGoal' | 'hasMedicalConditions' | 'medicalHistory'
      >;
    }
  | {
      expectedVersion: number;
      step: 'MEDICATIONS';
      consent?: HealthIntakeConsentDTO;
      data: Pick<
        HealthIntakeAnswersDTO,
        'usesMedication' | 'currentMedications' | 'hasAllergies' | 'allergies'
      >;
    }
  | {
      expectedVersion: number;
      step: 'INJURIES';
      consent?: HealthIntakeConsentDTO;
      data: Pick<
        HealthIntakeAnswersDTO,
        'hasInjuries' | 'injuriesHistory' | 'hasExerciseRestrictions' | 'exerciseRestrictions'
      >;
    }
  | {
      expectedVersion: number;
      step: 'ACTIVITY';
      consent?: HealthIntakeConsentDTO;
      data: Pick<HealthIntakeAnswersDTO, 'trainingBackground' | 'observations'>;
    }
  | {
      expectedVersion: number;
      step: 'REVIEW';
      consent?: HealthIntakeConsentDTO;
      data: Record<string, never>;
    };

export interface CompleteHealthIntakeDTO {
  expectedVersion: number;
  declarationAccepted: true;
}

export type HealthIntakeErrorCode =
  | 'NOT_FOUND'
  | 'BASIC_PRE_REGISTRATION_REQUIRED'
  | 'CONSENT_REQUIRED'
  | 'CONSENT_VERSION_MISMATCH'
  | 'CONCURRENT_MODIFICATION'
  | 'MISSING_REQUIRED_FIELDS'
  | 'HEALTH_INTAKE_COMPLETED';
