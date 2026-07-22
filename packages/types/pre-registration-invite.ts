// Contratos compartilhados dos convites de pre-cadastro (issue #269 / epico #267).
//
// Dominio proprio de convite: NAO reutiliza token, hash, endpoint, status ou
// tabela de contrato. Serve apenas para a entrada inicial de uma pessoa
// canonica (Aluno) em um tenant (CompanyContract). Estes tipos sao a UNICA
// fonte de estados/DTOs consumida por API e frontend.

export const PRE_REGISTRATION_INVITE_PURPOSES = ['PRE_REGISTRATION'] as const;
export type PreRegistrationInvitePurpose = (typeof PRE_REGISTRATION_INVITE_PURPOSES)[number];

export const PRE_REGISTRATION_INVITE_STATUSES = [
  'ACTIVE',
  'EXPIRED',
  'REVOKED',
  'SUPERSEDED',
  'COMPLETED',
] as const;
export type PreRegistrationInviteStatus = (typeof PRE_REGISTRATION_INVITE_STATUSES)[number];

export const PRE_REGISTRATION_INVITE_EVENT_TYPES = [
  'CREATED',
  'SUPERSEDED',
  'REVOKED',
  'FIRST_ACCESSED',
  'ACCESSED',
  'EXPIRED_ON_READ',
  'COMPLETED',
] as const;
export type PreRegistrationInviteEventType = (typeof PRE_REGISTRATION_INVITE_EVENT_TYPES)[number];

/** Erros de dominio do convite de pre-cadastro (uso administrativo/autenticado apenas). */
export type PreRegistrationInviteErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'PRECONDITION_FAILED'
  | 'ACTIVE_INVITE_EXISTS'
  | 'CONCURRENT_MODIFICATION'
  | 'MISSING_REQUIRED_FIELDS'
  | 'INVALID_REASON';

export interface PreRegistrationInviteActorDTO {
  userId?: string;
  professorId?: string;
}

/** Acoes administrativas atualmente permitidas para a pessoa/convite. */
export interface PreRegistrationInviteAllowedActions {
  canGenerateFirst: boolean;
  canRegenerate: boolean;
  canRevoke: boolean;
}

/**
 * Resumo administrativo do convite. NUNCA inclui o hash do token nem o
 * token bruto - o link atual, uma vez perdido, nao pode ser recuperado.
 */
export interface PreRegistrationInviteSummaryDTO {
  id: string;
  alunoId: string;
  purpose: PreRegistrationInvitePurpose;
  status: PreRegistrationInviteStatus;
  createdAt: string;
  expiresAt: string;
  firstAccessedAt?: string;
  lastAccessAt?: string;
  completedAt?: string;
  revokedAt?: string;
  revokedByProfessorId?: string;
  revocationReason?: string;
  supersededAt?: string;
  replacesInviteId?: string;
  replacedByInviteId?: string;
  createdByProfessorId?: string;
  createdByUserId?: string;
  linkRecoverable: false;
  allowedActions: PreRegistrationInviteAllowedActions;
}

/** Retorno de geracao/regeneracao: unica vez em que o token bruto e exposto. */
export interface PreRegistrationInviteCreationResultDTO {
  summary: PreRegistrationInviteSummaryDTO;
  token: string;
  url: string;
}

/** Resposta publica da abertura do convite - somente o minimo necessario. */
export interface PreRegistrationInvitePublicViewDTO {
  alunoId: string;
  contractId: string;
  purpose: PreRegistrationInvitePurpose;
  expiresAt: string;
}

export const PRE_REGISTRATION_INVITE_GENERIC_PUBLIC_ERROR =
  'Link inválido ou expirado.';
