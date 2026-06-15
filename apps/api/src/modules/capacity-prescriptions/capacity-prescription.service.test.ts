import { capacityPrescriptionService } from './capacity-prescription.service.js';

describe('capacityPrescriptionService', () => {
  const basePayload = {
    alunoId: 'aluno-1',
    contractId: 'contract-1',
    responsibleProfessorId: 'professor-1',
    capacity: 'resisted' as const,
    sourceRefs: [
      {
        type: 'prontuario_goal' as const,
        id: 'goal-1',
        label: 'Objetivo PRNT principal',
        assessedAt: '2026-06-12T00:00:00.000Z',
        origin: 'PRNT-001',
        version: 1,
        responsibleProfessorId: 'professor-1',
      },
    ],
    linkedProntuarioGoalIds: ['goal-1', 'goal-1'],
    technicalJustification: 'Força geral com restrição de joelho monitorada.',
    professorSummary: 'Iniciar bloco resistido planejado e revisar dor antes de ativar.',
    studentMessage: 'Vamos iniciar um bloco de força com cuidado nas restrições informadas.',
  };

  it('cria rascunho versionado por capacidade com origem, status e escopo', () => {
    const now = new Date('2026-06-12T12:00:00.000Z');
    const draft = capacityPrescriptionService.createDraft(basePayload, now);

    expect(draft).toMatchObject({
      alunoId: 'aluno-1',
      contractId: 'contract-1',
      responsibleProfessorId: 'professor-1',
      capacity: 'resisted',
      status: 'planned',
      version: 1,
      publishesTodayWorkout: false,
      createdAt: '2026-06-12T12:00:00.000Z',
      updatedAt: '2026-06-12T12:00:00.000Z',
    });
    expect(draft.sourceRefs).toHaveLength(1);
    expect(draft.linkedProntuarioGoalIds).toEqual(['goal-1']);
  });

  it('bloqueia rascunho sem origem tecnica rastreavel', () => {
    expect(() =>
      capacityPrescriptionService.createDraft({
        ...basePayload,
        sourceRefs: [],
      })
    ).toThrow('Ao menos uma origem técnica deve ser informada');
  });

  it('mantem a mensagem do aluno separada da justificativa tecnica do professor', () => {
    const draft = capacityPrescriptionService.createDraft({
      ...basePayload,
      technicalJustification: 'Detalhe técnico sensível: medicamento e conduta clínica.',
      studentMessage: 'Treino ajustado para respeitar seus limites de hoje.',
    });

    expect(draft.technicalJustification).toContain('Detalhe técnico sensível');
    expect(draft.studentMessage).toBe('Treino ajustado para respeitar seus limites de hoje.');
    expect(draft.studentMessage).not.toBe(draft.technicalJustification);
  });

  it('garante que capacidade nao publica Treino de hoje diretamente', () => {
    const draft = capacityPrescriptionService.createDraft(basePayload);

    expect(() => capacityPrescriptionService.assertDoesNotPublishWorkout(draft)).not.toThrow();
    expect(() =>
      capacityPrescriptionService.assertDoesNotPublishWorkout({ publishesTodayWorkout: true as false })
    ).toThrow('Capacidade física não pode publicar Treino de hoje diretamente');
  });
});
