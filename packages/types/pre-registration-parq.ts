export const PARQ_CATALOG_VERSION = 'parq-2026-01' as const;

export type ParqQuestionKey =
  | 'q1'
  | 'q2'
  | 'q3'
  | 'q4'
  | 'q5'
  | 'q6'
  | 'q7';

export type ParqFlowStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED_NO_ALERT'
  | 'COMPLETED_REVIEW_REQUIRED'
  | 'NEEDS_REPEAT';

export interface ParqCatalogQuestion {
  key: ParqQuestionKey;
  order: number;
  text: string;
  required: boolean;
  positiveWhen: true;
  status: 'ACTIVE' | 'DEPRECATED';
}

export interface ParqCatalog {
  version: typeof PARQ_CATALOG_VERSION;
  questions: readonly ParqCatalogQuestion[];
}

export const PARQ_CATALOG: ParqCatalog = {
  version: PARQ_CATALOG_VERSION,
  questions: [
    {
      key: 'q1',
      order: 1,
      text: 'Algum médico já disse que você possui algum problema cardíaco e recomendou atividade física somente sob supervisão médica?',
      required: true,
      positiveWhen: true,
      status: 'ACTIVE',
    },
    {
      key: 'q2',
      order: 2,
      text: 'Você sente dor no peito durante a prática de atividade física?',
      required: true,
      positiveWhen: true,
      status: 'ACTIVE',
    },
    {
      key: 'q3',
      order: 3,
      text: 'No último mês, você sentiu dor no peito quando não estava praticando atividade física?',
      required: true,
      positiveWhen: true,
      status: 'ACTIVE',
    },
    {
      key: 'q4',
      order: 4,
      text: 'Você perde o equilíbrio por tontura ou alguma vez perdeu a consciência?',
      required: true,
      positiveWhen: true,
      status: 'ACTIVE',
    },
    {
      key: 'q5',
      order: 5,
      text: 'Você possui algum problema ósseo ou articular que poderia piorar com uma mudança na sua atividade física?',
      required: true,
      positiveWhen: true,
      status: 'ACTIVE',
    },
    {
      key: 'q6',
      order: 6,
      text: 'Algum médico prescreveu atualmente medicamentos para pressão arterial ou problema cardíaco?',
      required: true,
      positiveWhen: true,
      status: 'ACTIVE',
    },
    {
      key: 'q7',
      order: 7,
      text: 'Você conhece alguma outra razão pela qual não deveria praticar atividade física?',
      required: true,
      positiveWhen: true,
      status: 'ACTIVE',
    },
  ],
};

export type ParqResponses = Partial<Record<ParqQuestionKey, boolean>>;

export interface ParqPositiveItem {
  key: ParqQuestionKey;
  label: string;
}

export interface ParqEvaluation {
  positiveItems: ParqPositiveItem[];
  positiveCount: number;
  status: Extract<ParqFlowStatus, 'COMPLETED_NO_ALERT' | 'COMPLETED_REVIEW_REQUIRED'>;
}

export interface SaveParqDraftDTO {
  catalogVersion: typeof PARQ_CATALOG_VERSION;
  expectedVersion: number;
  responses: ParqResponses;
  consent: {
    accepted: true;
    privacyNoticeVersion: string;
  };
}

export interface CompleteParqDTO extends SaveParqDraftDTO {
  declarationAccepted: true;
  idempotencyKey: string;
}

export type ParqErrorCode =
  | 'NOT_FOUND'
  | 'BASIC_PRE_REGISTRATION_REQUIRED'
  | 'CONSENT_REQUIRED'
  | 'CONSENT_VERSION_MISMATCH'
  | 'UNKNOWN_CATALOG_VERSION'
  | 'INVALID_QUESTION_SET'
  | 'INCOMPLETE_RESPONSES'
  | 'CONCURRENT_MODIFICATION'
  | 'PARQ_ALREADY_COMPLETED'
  | 'FORBIDDEN_FIELD';
