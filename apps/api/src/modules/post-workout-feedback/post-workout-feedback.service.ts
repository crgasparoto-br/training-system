import {
  SUGGESTED_DECISION_ACTIONS,
  type CreatePostWorkoutFeedbackSessionPayload,
  type PostWorkoutCapacityFeedback,
  type PostWorkoutFeedbackSession,
  type SuggestedDecisionAction,
  type SuggestedPostWorkoutDecision,
} from '@corrida/types';

const decisionActionSet = new Set<string>(SUGGESTED_DECISION_ACTIONS);

function assertNonEmpty(value: string | undefined | null, field: string) {
  if (!value?.trim()) {
    throw new Error(`${field} é obrigatório`);
  }
}

function clampRate(value: number) {
  return Math.max(0, Math.min(1, value));
}

function calculateRatio(completed?: number | null, planned?: number | null) {
  if (!planned || planned <= 0 || completed == null) return null;
  return clampRate(completed / planned);
}

function inferAdherenceRate(payload: CreatePostWorkoutFeedbackSessionPayload) {
  const metrics = payload.executionMetrics ?? {};
  if (metrics.adherenceRate != null) return clampRate(metrics.adherenceRate);

  const ratios = [
    calculateRatio(metrics.completedExercises, metrics.plannedExercises),
    calculateRatio(metrics.completedSessions, metrics.plannedSessions),
    calculateRatio(metrics.completedHomework, metrics.plannedHomework),
    calculateRatio(metrics.completedVolume, metrics.plannedVolume),
  ].filter((value): value is number => value != null);

  if (!ratios.length) return null;
  return ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
}

function maxNumeric(feedback: PostWorkoutCapacityFeedback[], field: keyof Pick<PostWorkoutCapacityFeedback, 'painLevel' | 'difficulty' | 'fatigue' | 'pse'>) {
  const values = feedback
    .map((item) => item[field])
    .filter((value): value is number => typeof value === 'number');
  return values.length ? Math.max(...values) : null;
}

function hasSafetyComplaint(feedback: PostWorkoutCapacityFeedback[]) {
  return feedback.some((item) => item.dizziness === true || (item.painLevel ?? 0) >= 7 || (item.fatigue ?? 0) >= 8);
}

function createSuggestedDecision(payload: CreatePostWorkoutFeedbackSessionPayload, adherenceRate: number | null): SuggestedPostWorkoutDecision {
  const maxPain = maxNumeric(payload.capacityFeedback, 'painLevel') ?? 0;
  const maxDifficulty = maxNumeric(payload.capacityFeedback, 'difficulty') ?? 0;
  const maxPse = maxNumeric(payload.capacityFeedback, 'pse') ?? 0;
  let action: SuggestedDecisionAction = 'maintain';
  let rationale = 'Feedback dentro do esperado; manter prescrição até revisão do professor.';

  if (hasSafetyComplaint(payload.capacityFeedback)) {
    action = 'reassess';
    rationale = 'Queixa de segurança, dor relevante, tontura ou fadiga alta exige reavaliação antes de progressão.';
  } else if (payload.sessionStatus === 'missed') {
    action = 'reassess';
    rationale = 'Sessão não realizada; revisar aderência e contexto antes de alterar a prescrição.';
  } else if ((adherenceRate != null && adherenceRate < 0.65) || maxDifficulty >= 8 || maxPse >= 9) {
    action = 'reduce';
    rationale = 'Aderência baixa ou esforço percebido muito alto sugere redução ou ajuste, sem aplicação automática.';
  } else if (adherenceRate != null && adherenceRate >= 0.9 && maxPain <= 2 && maxDifficulty <= 5) {
    action = 'progress';
    rationale = 'Boa aderência e baixa queixa sugerem progressão para avaliação do professor.';
  }

  return {
    action,
    status: 'suggested',
    rationale,
    technicalMessage: rationale,
    studentMessage: 'Seu feedback foi registrado e será revisado pelo professor antes de qualquer ajuste.',
    createdBy: 'system',
    approvedByProfessorId: null,
    approvedAt: null,
    appliedAt: null,
    changesPrescriptionAutomatically: false,
  };
}

function buildTimelineSummary(payload: CreatePostWorkoutFeedbackSessionPayload, decision: SuggestedPostWorkoutDecision, adherenceRate: number | null) {
  const adherenceLabel = adherenceRate == null ? 'aderência sem cálculo suficiente' : `aderência ${(adherenceRate * 100).toFixed(0)}%`;
  return `Feedback pós-treino registrado com status ${payload.sessionStatus}, ${adherenceLabel} e decisão sugerida: ${decision.action}.`;
}

export const postWorkoutFeedbackService = {
  createSession(payload: CreatePostWorkoutFeedbackSessionPayload, now = new Date()): PostWorkoutFeedbackSession {
    assertNonEmpty(payload.workoutDayId, 'Treino executado');
    assertNonEmpty(payload.alunoId, 'Aluno');
    assertNonEmpty(payload.contractId, 'Contrato');

    if (!payload.capacityFeedback.length) {
      throw new Error('Feedback por capacidade é obrigatório');
    }

    const adherenceRate = inferAdherenceRate(payload);
    const suggestedDecision = createSuggestedDecision(payload, adherenceRate);

    return {
      workoutDayId: payload.workoutDayId,
      workoutExecutionIds: Array.from(new Set(payload.workoutExecutionIds ?? [])),
      consolidatedPrescriptionId: payload.consolidatedPrescriptionId ?? null,
      alunoId: payload.alunoId,
      contractId: payload.contractId,
      responsibleProfessorId: payload.responsibleProfessorId ?? null,
      feedbackAt: now.toISOString(),
      sessionStatus: payload.sessionStatus,
      readiness: payload.readiness ?? null,
      generalWellBeing: payload.generalWellBeing ?? null,
      finalClassFeedback: payload.finalClassFeedback?.trim() || null,
      studentPracticalSummary: payload.studentPracticalSummary?.trim() || null,
      professorTechnicalNotes: payload.professorTechnicalNotes?.trim() || null,
      executionMetrics: {
        ...(payload.executionMetrics ?? {}),
        adherenceRate,
      },
      capacityFeedback: payload.capacityFeedback,
      suggestedDecision,
      timelineSummary: buildTimelineSummary(payload, suggestedDecision, adherenceRate),
      updatesProntuarioFollowUp: hasSafetyComplaint(payload.capacityFeedback) || payload.sessionStatus === 'missed',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  },

  approveDecision(decision: SuggestedPostWorkoutDecision, professorId: string, now = new Date()): SuggestedPostWorkoutDecision {
    assertNonEmpty(professorId, 'Professor aprovador');
    return {
      ...decision,
      status: 'approved',
      approvedByProfessorId: professorId,
      approvedAt: now.toISOString(),
      changesPrescriptionAutomatically: false,
    };
  },

  applyApprovedDecision(decision: SuggestedPostWorkoutDecision, now = new Date()): SuggestedPostWorkoutDecision {
    if (decision.status !== 'approved' || !decision.approvedByProfessorId || !decision.approvedAt) {
      throw new Error('Decisão sugerida só pode ser aplicada após aprovação do professor');
    }

    if (!decisionActionSet.has(decision.action)) {
      throw new Error('Ação de decisão sugerida inválida');
    }

    return {
      ...decision,
      status: 'applied',
      appliedAt: now.toISOString(),
      changesPrescriptionAutomatically: false,
    };
  },
};
