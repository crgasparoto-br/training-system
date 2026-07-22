import type {
  StudentLifecycleEventType,
  StudentLifecycleProgressSummary,
  StudentLifecycleStatus,
  StudentOnboardingModuleStatus,
} from './student-lifecycle.js';
import type {
  PreRegistrationInviteAllowedActions,
  PreRegistrationInviteStatus,
  PreRegistrationInviteSummaryDTO,
} from './pre-registration-invite.js';

export const PRE_REGISTRATION_ADMIN_STATUSES = [
  'LEAD',
  'INVITED',
  'PRE_REGISTRATION_IN_PROGRESS',
  'PRE_REGISTRATION_COMPLETED',
  'READY_FOR_ENROLLMENT',
  'DISCARDED',
] as const satisfies readonly StudentLifecycleStatus[];

export type PreRegistrationAdminStatus = (typeof PRE_REGISTRATION_ADMIN_STATUSES)[number];
export type PreRegistrationAdminInviteFilter = PreRegistrationInviteStatus | 'NONE';

export type PreRegistrationAdminSort =
  | 'createdAt:desc'
  | 'createdAt:asc'
  | 'lastActivityAt:desc'
  | 'lastActivityAt:asc'
  | 'name:asc';

export interface PreRegistrationAdminListQueryDTO {
  page?: number;
  pageSize?: number;
  search?: string;
  statuses?: PreRegistrationAdminStatus[];
  inviteStatus?: PreRegistrationAdminInviteFilter;
  origin?: string;
  responsibleProfessorId?: string;
  createdFrom?: string;
  createdTo?: string;
  activityFrom?: string;
  activityTo?: string;
  pendingReview?: boolean;
  parqRequiresProfessionalReview?: boolean;
  sort?: PreRegistrationAdminSort;
}

export interface PreRegistrationAdminContactDTO {
  phone?: string;
  email?: string;
  cpf?: string;
  masked: boolean;
}

export interface PreRegistrationAdminProfessorDTO {
  id: string;
  name: string;
}

export interface PreRegistrationAdminProgressDTO {
  basicRegistration: StudentOnboardingModuleStatus;
  healthModuleStatus: StudentOnboardingModuleStatus;
  parqModuleStatus: StudentOnboardingModuleStatus;
  parqRequiresProfessionalReview: boolean;
  completedFields: number;
  totalFields: number;
  missingRequiredFields: string[];
  startedAt?: string;
  lastSavedAt?: string;
  completedAt?: string;
}

export const PRE_REGISTRATION_ADMIN_NEXT_ACTION_CODES = [
  'CREATE_INVITE',
  'WAIT_FOR_ACCESS',
  'FOLLOW_UP_REGISTRATION',
  'REVIEW_REGISTRATION',
  'REVIEW_PARQ',
  'WAIT_FOR_CONVERSION',
  'REOPEN',
  'OPEN_STUDENT_CENTRAL',
  'NONE',
] as const;
export type PreRegistrationAdminNextActionCode =
  (typeof PRE_REGISTRATION_ADMIN_NEXT_ACTION_CODES)[number];

export interface PreRegistrationAdminNextActionDTO {
  code: PreRegistrationAdminNextActionCode;
  label: string;
  description: string;
  enabled: boolean;
}

export interface PreRegistrationAdminAllowedActionsDTO {
  canEditCommercialData: boolean;
  canGenerateInvite: boolean;
  canRegenerateInvite: boolean;
  canRevokeInvite: boolean;
  canReview: boolean;
  canDiscard: boolean;
  canReopen: boolean;
  canConvert: boolean;
  canOpenStudentCentral: boolean;
}

export interface PreRegistrationAdminLeadSummaryDTO {
  id: string;
  name: string;
  contacts: PreRegistrationAdminContactDTO;
  origin: string;
  status: PreRegistrationAdminStatus;
  responsible?: PreRegistrationAdminProfessorDTO;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  inviteStatus?: PreRegistrationInviteStatus;
  inviteExpiresAt?: string;
  inviteAllowedActions: PreRegistrationInviteAllowedActions;
  progress: PreRegistrationAdminProgressDTO;
  nextAction: PreRegistrationAdminNextActionDTO;
  allowedActions: PreRegistrationAdminAllowedActionsDTO;
}

export interface PreRegistrationAdminListResultDTO {
  items: PreRegistrationAdminLeadSummaryDTO[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filterOptions: {
    origins: string[];
    responsibleProfessors: PreRegistrationAdminProfessorDTO[];
  };
}

export interface CreatePreRegistrationLeadDTO {
  name: string;
  phone?: string;
  email?: string;
  cpf?: string;
  origin: string;
  responsibleProfessorId?: string;
  commercialNotes?: string;
  unit?: string;
  confirmPossibleDuplicate?: boolean;
}

export interface UpdatePreRegistrationLeadCommercialDTO {
  name?: string;
  phone?: string;
  email?: string;
  cpf?: string;
  origin?: string;
  responsibleProfessorId?: string | null;
  commercialNotes?: string | null;
  unit?: string | null;
}

export interface PreRegistrationDuplicateCandidateDTO {
  alunoId?: string;
  name: string;
  status?: StudentLifecycleStatus;
  matchingFields: Array<'cpf' | 'email' | 'phone'>;
  createdAt?: string;
  accessible: boolean;
}

export interface PreRegistrationDuplicateCheckResultDTO extends Record<string, unknown> {
  candidates: PreRegistrationDuplicateCandidateDTO[];
  hasBlockingCpfConflict: boolean;
}

export interface PreRegistrationAdminPendingItemDTO {
  code: string;
  label: string;
  blocking: boolean;
}

export interface PreRegistrationAdminHistoryItemDTO {
  id: string;
  type: 'LIFECYCLE' | 'INVITE';
  eventType: StudentLifecycleEventType | string;
  title: string;
  description?: string;
  createdAt: string;
  actor?: string;
}

export interface PreRegistrationAdminLeadDetailDTO
  extends PreRegistrationAdminLeadSummaryDTO {
  commercial: {
    notes?: string;
    unit?: string;
  };
  lifecycleProgress: StudentLifecycleProgressSummary;
  invite?: PreRegistrationInviteSummaryDTO;
  pendencies: PreRegistrationAdminPendingItemDTO[];
  history: PreRegistrationAdminHistoryItemDTO[];
}

export interface PreRegistrationAdminReviewDTO {
  reviewReference: string;
  deduplicationReference: string;
}

export interface PreRegistrationAdminReasonDTO {
  reason: string;
}
