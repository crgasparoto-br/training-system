import {
  PARQ_CATALOG,
  PARQ_CATALOG_VERSION,
  type ParqEvaluation,
  type ParqQuestionKey,
  type ParqResponses,
} from '@corrida/types';

export class ParqDomainError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'UNKNOWN_CATALOG_VERSION'
      | 'INVALID_QUESTION_SET'
      | 'INCOMPLETE_RESPONSES'
  ) {
    super(message);
    this.name = 'ParqDomainError';
  }
}

const activeQuestions = PARQ_CATALOG.questions.filter((question) => question.status === 'ACTIVE');
const activeKeys = new Set<ParqQuestionKey>(activeQuestions.map((question) => question.key));

export function validateParqCatalogVersion(version: string): asserts version is typeof PARQ_CATALOG_VERSION {
  if (version !== PARQ_CATALOG_VERSION) {
    throw new ParqDomainError(
      'A versão do PAR-Q não é mais reconhecida. Recarregue o questionário atual.',
      'UNKNOWN_CATALOG_VERSION'
    );
  }
}

export function validateParqResponses(responses: ParqResponses, requireComplete: boolean): void {
  const keys = Object.keys(responses);
  if (keys.some((key) => !activeKeys.has(key as ParqQuestionKey))) {
    throw new ParqDomainError('O conjunto de perguntas do PAR-Q é inválido.', 'INVALID_QUESTION_SET');
  }

  if (Object.values(responses).some((value) => typeof value !== 'boolean')) {
    throw new ParqDomainError('As respostas do PAR-Q devem ser sim ou não.', 'INVALID_QUESTION_SET');
  }

  if (
    requireComplete &&
    activeQuestions.some((question) => question.required && typeof responses[question.key] !== 'boolean')
  ) {
    throw new ParqDomainError(
      'Responda todas as perguntas obrigatórias antes de concluir o PAR-Q.',
      'INCOMPLETE_RESPONSES'
    );
  }
}

export function evaluateParqResponses(responses: ParqResponses): ParqEvaluation {
  validateParqResponses(responses, true);
  const positiveItems = activeQuestions
    .filter((question) => responses[question.key] === question.positiveWhen)
    .map((question) => ({ key: question.key, label: question.text }));

  return {
    positiveItems,
    positiveCount: positiveItems.length,
    status: positiveItems.length > 0 ? 'COMPLETED_REVIEW_REQUIRED' : 'COMPLETED_NO_ALERT',
  };
}

export function getCanonicalParqCatalog() {
  return PARQ_CATALOG;
}
