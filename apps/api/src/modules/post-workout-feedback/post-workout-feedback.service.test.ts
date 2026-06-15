import { postWorkoutFeedbackService } from './post-workout-feedback.service.js';

const basePayload = {
  workoutDayId: 'workout-day-1',
  workoutExecutionIds: ['execution-1', 'execution-1'],
  consolidatedPrescriptionId: 'assembly-1',
  alunoId: 'aluno-1',
  contractId: 'contract-1',
  responsibleProfessorId: 'professor-1',
  sessionStatus: 'completed' as const,
  readiness: 8,
  generalWellBeing: 8,
  finalClassFeedback: 'Aluno concluiu bem a sessao.',
  studentPracticalSummary: 'Treino registrado para revisao do professor.',
  professorTechnicalNotes: 'Boa aderencia, sem queixas relevantes.',
  executionMetrics: {
    plannedExercises: 10,
    completedExercises: 10,
    plannedSessions: 1,
    completedSessions: 1,
    plannedHomework: 2,
    completedHomework: 2,
  },
  capacityFeedback: [
    {
      capacity: 'resisted' as const,
      actor: 'student' as const,
      pse: 5,
      psr: 8,
      difficulty: 4,
      painLevel: 1,
      fatigue: 3,
      loadUsed: 'Carga planejada',
      repsExecuted: 'Todas as repeticoes',
      observations: 'Sem dor relevante.',
    },
  ],
};

describe('postWorkoutFeedbackService', () => {
  it('cria feedback vinculado ao treino executado com aderencia e decisao sugerida', () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    const session = postWorkoutFeedbackService.createSession(basePayload, now);

    expect(session).toMatchObject({
      workoutDayId: 'workout-day-1',
      workoutExecutionIds: ['execution-1'],
      consolidatedPrescriptionId: 'assembly-1',
      alunoId: 'aluno-1',
      contractId: 'contract-1',
      responsibleProfessorId: 'professor-1',
      feedbackAt: '2026-06-15T12:00:00.000Z',
      updatesProntuarioFollowUp: false,
    });
    expect(session.executionMetrics.adherenceRate).toBe(1);
    expect(session.suggestedDecision).toMatchObject({
      action: 'progress',
      status: 'suggested',
      changesPrescriptionAutomatically: false,
    });
    expect(session.timelineSummary).toContain('decisão sugerida: progress');
  });

  it('sugere reavaliar quando houver dor relevante ou queixa de seguranca', () => {
    const session = postWorkoutFeedbackService.createSession({
      ...basePayload,
      capacityFeedback: [
        {
          capacity: 'cyclic',
          actor: 'student',
          pse: 9,
          difficulty: 8,
          painLevel: 8,
          dizziness: true,
          fatigue: 9,
          discomfortNotes: 'Dor no joelho e tontura no final.',
        },
      ],
    });

    expect(session.suggestedDecision.action).toBe('reassess');
    expect(session.updatesProntuarioFollowUp).toBe(true);
    expect(session.suggestedDecision.changesPrescriptionAutomatically).toBe(false);
  });

  it('bloqueia aplicacao de decisao sem aprovacao do professor', () => {
    const session = postWorkoutFeedbackService.createSession(basePayload);

    expect(() => postWorkoutFeedbackService.applyApprovedDecision(session.suggestedDecision)).toThrow(
      'Decisão sugerida só pode ser aplicada após aprovação do professor'
    );
  });

  it('permite aplicar somente decisao aprovada pelo professor sem alterar prescricao automaticamente', () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    const session = postWorkoutFeedbackService.createSession(basePayload, now);
    const approved = postWorkoutFeedbackService.approveDecision(session.suggestedDecision, 'professor-1', now);
    const applied = postWorkoutFeedbackService.applyApprovedDecision(approved, now);

    expect(approved).toMatchObject({
      status: 'approved',
      approvedByProfessorId: 'professor-1',
      approvedAt: '2026-06-15T12:00:00.000Z',
      changesPrescriptionAutomatically: false,
    });
    expect(applied).toMatchObject({
      status: 'applied',
      appliedAt: '2026-06-15T12:00:00.000Z',
      changesPrescriptionAutomatically: false,
    });
  });
});
