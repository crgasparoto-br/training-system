import type { CapacityPrescriptionDraft, ConsolidatedCapacityBlock } from '@corrida/types';
import { consolidatedPrescriptionService } from './consolidated-prescription.service.js';

const makeDraft = (overrides: Partial<CapacityPrescriptionDraft> = {}): CapacityPrescriptionDraft => ({
  alunoId: 'aluno-1',
  contractId: 'contract-1',
  responsibleProfessorId: 'professor-1',
  capacity: 'resisted',
  status: 'active',
  version: 1,
  sourceRefs: [
    {
      type: 'prontuario_goal',
      id: 'goal-1',
      label: 'Objetivo PRNT principal',
      assessedAt: '2026-06-12T00:00:00.000Z',
      origin: 'PRNT-001',
      version: 1,
      responsibleProfessorId: 'professor-1',
    },
  ],
  linkedProntuarioGoalIds: ['goal-1'],
  technicalJustification: 'Treino de membro inferior com atenção ao joelho.',
  professorSummary: 'Sessão de perna planejada com restrição monitorada.',
  studentMessage: 'Siga as orientações de segurança do professor.',
  alerts: [],
  parameters: null,
  createdAt: '2026-06-12T12:00:00.000Z',
  updatedAt: '2026-06-12T12:00:00.000Z',
  publishesTodayWorkout: false,
  ...overrides,
});

const makeBlock = (draft: CapacityPrescriptionDraft, validationStatus: ConsolidatedCapacityBlock['validationStatus'] = 'validated'): ConsolidatedCapacityBlock => ({
  capacity: draft.capacity,
  capacityVersion: draft.version,
  status: draft.status,
  validationStatus,
  draft,
});

describe('consolidatedPrescriptionService', () => {
  it('cria montagem versionada com rastreabilidade dos blocos ativos e validados', () => {
    const now = new Date('2026-06-15T10:00:00.000Z');
    const assembly = consolidatedPrescriptionService.createAssembly(
      {
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        responsibleProfessorId: 'professor-1',
        status: 'ready_for_review',
        capacityBlocks: [makeBlock(makeDraft())],
        professorJustification: 'Montagem pronta para revisão final.',
        studentInstruction: 'Aguarde a liberação do professor.',
      },
      now
    );

    expect(assembly).toMatchObject({
      alunoId: 'aluno-1',
      contractId: 'contract-1',
      responsibleProfessorId: 'professor-1',
      status: 'ready_for_review',
      version: 1,
      canReleaseOperationalWorkout: false,
      createsTodayWorkoutDirectly: false,
      createdAt: '2026-06-15T10:00:00.000Z',
    });
    expect(assembly.traceability).toEqual({
      capacityCount: 1,
      sourceRefIds: ['goal-1'],
      capacityVersions: [{ capacity: 'resisted', version: 1 }],
    });
  });

  it('bloqueia montagem com bloco pendente ou fora de status ativo', () => {
    expect(() =>
      consolidatedPrescriptionService.createAssembly({
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        responsibleProfessorId: 'professor-1',
        capacityBlocks: [makeBlock(makeDraft(), 'pending')],
        professorJustification: 'Tentativa sem validação.',
      })
    ).toThrow('Todos os blocos de capacidade precisam estar validados');

    expect(() =>
      consolidatedPrescriptionService.createAssembly({
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        responsibleProfessorId: 'professor-1',
        capacityBlocks: [makeBlock(makeDraft({ status: 'planned' }))],
        professorJustification: 'Tentativa com capacidade planejada.',
      })
    ).toThrow('Montagem consolidada recebe apenas capacidades ativas');
  });

  it('detecta conflito critico antes da liberacao operacional', () => {
    const resisted = makeDraft({
      capacity: 'resisted',
      technicalJustification: 'Treino intenso de perna com agachamento.',
      professorSummary: 'Membro inferior forte.',
      alerts: [{ code: 'knee-pain', message: 'Dor relevante no joelho direito.', severity: 'critical' }],
    });
    const cyclic = makeDraft({
      capacity: 'cyclic',
      version: 2,
      technicalJustification: 'Sessão intervalada forte.',
      professorSummary: 'Alta intensidade cíclica.',
      sourceRefs: [
        {
          type: 'physical_assessment',
          id: 'assessment-1',
          label: 'Avaliação física',
        },
      ],
    });

    const assembly = consolidatedPrescriptionService.createAssembly({
      alunoId: 'aluno-1',
      contractId: 'contract-1',
      responsibleProfessorId: 'professor-1',
      status: 'approved',
      validatedByProfessorId: 'professor-1',
      validatedAt: '2026-06-15T10:00:00.000Z',
      capacityBlocks: [makeBlock(resisted), makeBlock(cyclic)],
      professorJustification: 'Avaliar conflito antes de liberar.',
    });

    expect(assembly.conflicts).toHaveLength(1);
    expect(assembly.conflicts[0].code).toBe('lower-limb-intensity-knee-pain');
    expect(assembly.canReleaseOperationalWorkout).toBe(false);
  });

  it('exige validacao do professor antes de liberar saida operacional', () => {
    const draft = makeDraft({
      technicalJustification: 'Bloco sem conflito crítico.',
      professorSummary: 'Pronto para aprovação.',
      alerts: [],
    });

    const pending = consolidatedPrescriptionService.createAssembly({
      alunoId: 'aluno-1',
      contractId: 'contract-1',
      responsibleProfessorId: 'professor-1',
      status: 'ready_for_review',
      capacityBlocks: [makeBlock(draft)],
      professorJustification: 'Ainda em revisão.',
    });

    expect(() => consolidatedPrescriptionService.assertProfessorValidatedBeforeRelease(pending)).toThrow(
      'Montagem consolidada precisa de validação do professor antes da liberação operacional'
    );

    const approved = consolidatedPrescriptionService.createAssembly({
      alunoId: 'aluno-1',
      contractId: 'contract-1',
      responsibleProfessorId: 'professor-1',
      status: 'approved',
      validatedByProfessorId: 'professor-1',
      validatedAt: '2026-06-15T10:00:00.000Z',
      capacityBlocks: [makeBlock(draft)],
      professorJustification: 'Validado para preparação operacional.',
    });

    expect(approved.canReleaseOperationalWorkout).toBe(true);
    expect(() => consolidatedPrescriptionService.assertProfessorValidatedBeforeRelease(approved)).not.toThrow();
  });
});
