// Contratos compartilhados do ciclo unico lead -> aluno (issue #268 / epico #267).
//
// Estes tipos sao a UNICA fonte de estados/transicoes/DTOs consumida por API e
// frontend. Nao duplicar este enum ou os DTOs abaixo em outro lugar do
// repositorio: a API e a autoridade de obrigatoriedade e transicao, e o
// frontend deve importar estes tipos em vez de recria-los.

/** Estados do ciclo unico de uma pessoa no dominio de alunos. */
export const STUDENT_LIFECYCLE_STATUSES = [
  'LEAD',
  'INVITED',
  'PRE_REGISTRATION_IN_PROGRESS',
  'PRE_REGISTRATION_COMPLETED',
  'READY_FOR_ENROLLMENT',
  'ACTIVE_STUDENT',
  'DISCARDED',
] as const;

export type StudentLifecycleStatus = (typeof STUDENT_LIFECYCLE_STATUSES)[number];

/** Estados que representam um aluno ativo (para filtros de listagem/queries). */
export const ACTIVE_STUDENT_STATUSES: readonly StudentLifecycleStatus[] = ['ACTIVE_STUDENT'];

/** Estados que ainda nao concluiram a ativacao (nao devem aparecer como aluno ativo). */
export const NON_ACTIVE_STUDENT_STATUSES: readonly StudentLifecycleStatus[] =
  STUDENT_LIFECYCLE_STATUSES.filter(
    (status) => !ACTIVE_STUDENT_STATUSES.includes(status)
  ) as StudentLifecycleStatus[];

/**
 * Transicoes permitidas do ciclo. A chave e o estado de origem; o valor e a
 * lista de estados de destino permitidos a partir dele. Qualquer transicao
 * fora deste mapa deve ser rejeitada pelo service de dominio.
 */
export const STUDENT_LIFECYCLE_TRANSITIONS: Readonly<
  Record<StudentLifecycleStatus, readonly StudentLifecycleStatus[]>
> = {
  LEAD: ['INVITED', 'DISCARDED'],
  INVITED: ['PRE_REGISTRATION_IN_PROGRESS', 'DISCARDED'],
  PRE_REGISTRATION_IN_PROGRESS: ['PRE_REGISTRATION_COMPLETED', 'DISCARDED'],
  PRE_REGISTRATION_COMPLETED: ['READY_FOR_ENROLLMENT', 'DISCARDED'],
  READY_FOR_ENROLLMENT: ['ACTIVE_STUDENT', 'DISCARDED'],
  ACTIVE_STUDENT: [],
  DISCARDED: ['LEAD'],
};

export function isValidStudentLifecycleTransition(
  from: StudentLifecycleStatus,
  to: StudentLifecycleStatus
): boolean {
  return STUDENT_LIFECYCLE_TRANSITIONS[from].includes(to);
}

/** Modulo opcional de onboarding (Anamnese/PAR-Q) — apenas estado resumido. */
export const STUDENT_ONBOARDING_MODULE_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
] as const;

export type StudentOnboardingModuleStatus = (typeof STUDENT_ONBOARDING_MODULE_STATUSES)[number];

/** Eventos criticos que devem ser auditados (StudentLifecycleEvent.eventType). */
export const STUDENT_LIFECYCLE_EVENT_TYPES = [
  'LEAD_CREATED',
  'IDENTIFIER_NORMALIZED_CHANGED',
  'STATUS_CHANGED',
  'ACCOUNT_LINKED',
  'ACCOUNT_UNLINKED',
  'PRE_REGISTRATION_COMPLETED',
  'PRIVACY_CONSENT_RECORDED',
  'ADMIN_REVIEWED',
  'DISCARDED',
  'REOPENED',
  'CONVERTED_TO_ACTIVE_STUDENT',
] as const;

export type StudentLifecycleEventType = (typeof STUDENT_LIFECYCLE_EVENT_TYPES)[number];

/** DTO de criacao de lead. Somente nome + (telefone OU e-mail) sao obrigatorios. */
export interface CreateStudentLeadDTO {
  contractId: string;
  name: string;
  phone?: string;
  email?: string;
  origin: string;
  createdByProfessorId?: string;
}

/** DTO de atualizacao cadastral durante o pre-cadastro (etapas incrementais). */
export interface UpdateStudentPreRegistrationDTO {
  name?: string;
  phone?: string;
  email?: string;
  cpf?: string;
  birthDate?: string;
  addressStreet?: string;
  addressNumber?: string;
  addressComplement?: string;
  addressNeighborhood?: string;
  addressCity?: string;
  addressState?: string;
  addressZipCode?: string;
  guardianName?: string;
  guardianCpf?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  privacyNoticeVersion?: string;
  privacyAcceptedAt?: string;
}

/** Campos minimos exigidos para concluir o pre-cadastro. */
export const PRE_REGISTRATION_REQUIRED_FIELDS = [
  'name',
  'birthDate',
  'phone',
  'privacyNoticeVersion',
  'privacyAcceptedAt',
] as const;

export interface StudentLifecycleProgressSummary {
  alunoId: string;
  status: StudentLifecycleStatus;
  formVersion?: string;
  privacyNoticeVersion?: string;
  privacyAcceptedAt?: string;
  startedAt?: string;
  lastSavedAt?: string;
  completedAt?: string;
  healthModuleStatus: StudentOnboardingModuleStatus;
  parqModuleStatus: StudentOnboardingModuleStatus;
  missingRequiredFields: string[];
}

/** Resposta padronizada para tentativas de duplicidade/conflito (sem vazar dado cross-tenant). */
export interface StudentIdentifierConflictResponse {
  code: 'IDENTIFIER_CONFLICT';
  field: 'email' | 'phone' | 'cpf';
  message: string;
}



export type StudentLifecycleErrorCode =
  | 'INVALID_TRANSITION'
  | 'MISSING_REQUIRED_FIELDS'
  | 'IDENTIFIER_CONFLICT'
  | 'NOT_FOUND'
  | 'ACCOUNT_ALREADY_LINKED'
  | 'ACCOUNT_DATA_MISMATCH'
  | 'ACCOUNT_CONTRACT_CONFLICT'
  | 'CONCURRENT_MODIFICATION'
  | 'PRECONDITION_FAILED';

export interface ClaimStudentAccountConflictResponse {
  code: 'ACCOUNT_DATA_MISMATCH';
  fields: string[];
  message: string;
}

export interface StudentLifecycleActorDTO {
  userId?: string;
  professorId?: string;
}

export interface StudentInvitationTransitionDTO {
  invitationId: string;
  actor: StudentLifecycleActorDTO;
}

export interface StudentAdministrativeReviewTransitionDTO {
  reviewReference: string;
  deduplicationReference: string;
  actor: StudentLifecycleActorDTO & { professorId: string };
}

export interface StudentActivationTransitionDTO {
  activationReference: string;
  actor: StudentLifecycleActorDTO & { professorId: string };
}

export interface StudentLifecycleAuditEventDTO {
  alunoId: string;
  contractId: string;
  eventType: StudentLifecycleEventType;
  actorUserId?: string;
  actorProfessorId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}