import {
  CapacityPrescriptionDomainError,
  calculateCyclicHeartRateZones,
  createCapacityPrescriptionService,
} from './capacity-prescription.service.js';

function createPrismaMock(options?: {
  aluno?: Record<string, unknown> | null;
  existingPrescription?: Record<string, unknown> | null;
  updateCount?: number;
  parameterSets?: Array<Record<string, unknown>>;
}) {
  const aluno =
    options?.aluno === undefined
      ? {
          id: 'aluno-1',
          contractId: 'contract-1',
          maxHeartRate: 190,
          restingHeartRate: 60,
          vo2Max: 48,
          anaerobicThreshold: 172,
        }
      : options.aluno;
  const existingPrescription = options?.existingPrescription ?? null;
  const tx: any = {
    aluno: { findFirst: jest.fn().mockResolvedValue(aluno) },
    professor: { findFirst: jest.fn().mockResolvedValue({ id: 'professor-1' }) },
    prontuarioGoal: {
      findFirst: jest.fn().mockResolvedValue({ id: 'goal-1' }),
      findMany: jest.fn().mockResolvedValue([{ id: 'goal-1' }]),
    },
    prontuarioPainCase: { findFirst: jest.fn().mockResolvedValue(null) },
    prontuarioAnamnesisFollowUp: { findFirst: jest.fn().mockResolvedValue(null) },
    prontuarioMedicationProcedure: { findFirst: jest.fn().mockResolvedValue(null) },
    prontuarioDiscomfortSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
    anthropometryAssessment: { findFirst: jest.fn().mockResolvedValue(null) },
    studentAssessmentRecord: { findFirst: jest.fn().mockResolvedValue(null) },
    studentProfile: { findFirst: jest.fn().mockResolvedValue(null) },
    capacityPrescriptionParameterSet: {
      findMany: jest.fn().mockResolvedValue(options?.parameterSets ?? []),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      create: jest.fn(),
    },
    capacityPrescription: {
      findUnique: jest.fn().mockResolvedValue(existingPrescription),
      create: jest.fn().mockResolvedValue({
        id: 'prescription-1',
        contractId: 'contract-1',
        alunoId: 'aluno-1',
        capacity: 'resisted',
        status: 'planned',
        currentVersion: 1,
        publishesTodayWorkout: false,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: options?.updateCount ?? 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'prescription-1',
        contractId: 'contract-1',
        alunoId: 'aluno-1',
        capacity: 'resisted',
        status: 'planned',
        currentVersion: existingPrescription ? 2 : 1,
        publishesTodayWorkout: false,
      }),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    capacityPrescriptionVersion: {
      create: jest.fn().mockImplementation(({ data }) => ({
        id: 'version-1',
        ...data,
        sources: data.sources.create,
        alerts: data.alerts.create,
        goals: data.goals.create,
      })),
      findMany: jest.fn(),
    },
  };
  const client: any = {
    ...tx,
    $transaction: jest.fn((callback) => callback(tx)),
  };
  return { client, tx };
}

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
    const { client } = createPrismaMock();
    const service = createCapacityPrescriptionService(client);
    const now = new Date('2026-06-12T12:00:00.000Z');
    const draft = service.createDraft(basePayload, now);

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

  it('bloqueia parâmetros de uma capacidade diferente', () => {
    const { client } = createPrismaMock();
    const service = createCapacityPrescriptionService(client);
    expect(() =>
      service.createDraft({
        ...basePayload,
        parameters: { type: 'balance', balance: { expectedPse: 4 } },
      })
    ).toThrow('Os parâmetros técnicos não correspondem à capacidade informada');
  });

  it('calcula zonas de FC no backend usando reserva cardíaca', () => {
    expect(
      calculateCyclicHeartRateZones({
        maxHeartRate: 190,
        restingHeartRate: 60,
        basis: 'heart_rate_reserve',
        zones: [{ name: 'Z2', minPercent: 60, maxPercent: 70 }],
      })
    ).toEqual([expect.objectContaining({ name: 'Z2', targetHeartRate: '138-151 bpm' })]);
  });

  it('persiste a primeira versão com origem e bloqueio de publicação direta', async () => {
    const { client, tx } = createPrismaMock();
    const service = createCapacityPrescriptionService(client);

    const result = await service.saveVersion(
      {
        contractId: 'contract-1',
        actorProfessorId: 'professor-1',
        alunoId: 'aluno-1',
      },
      {
        capacity: 'resisted',
        sourceRefs: basePayload.sourceRefs,
        linkedProntuarioGoalIds: ['goal-1'],
        technicalJustification: basePayload.technicalJustification,
        professorSummary: basePayload.professorSummary,
        studentMessage: basePayload.studentMessage,
        parameters: {
          type: 'resisted',
          resisted: { sets: 3, repetitions: '8-12', expectedPse: 6 },
        },
      },
      new Date('2026-06-12T12:00:00.000Z')
    );

    expect(tx.capacityPrescription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contractId: 'contract-1',
          alunoId: 'aluno-1',
          currentVersion: 1,
          publishesTodayWorkout: false,
        }),
      })
    );
    expect(tx.capacityPrescriptionVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 1,
          publishesTodayWorkout: false,
        }),
      })
    );
    expect(result.latestVersion.version).toBe(1);
  });

  it('incrementa versão com concorrência otimista', async () => {
    const { client, tx } = createPrismaMock({
      existingPrescription: {
        id: 'prescription-1',
        contractId: 'contract-1',
        alunoId: 'aluno-1',
        capacity: 'resisted',
        status: 'planned',
        currentVersion: 1,
      },
    });
    const service = createCapacityPrescriptionService(client);

    await service.saveVersion(
      {
        contractId: 'contract-1',
        actorProfessorId: 'professor-1',
        alunoId: 'aluno-1',
      },
      {
        capacity: 'resisted',
        expectedCurrentVersion: 1,
        sourceRefs: basePayload.sourceRefs,
        linkedProntuarioGoalIds: ['goal-1'],
        technicalJustification: basePayload.technicalJustification,
        professorSummary: basePayload.professorSummary,
      }
    );

    expect(tx.capacityPrescription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prescription-1', currentVersion: 1 },
        data: expect.objectContaining({ currentVersion: { increment: 1 } }),
      })
    );
    expect(tx.capacityPrescriptionVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 2 }) })
    );
  });

  it('não revela nem grava aluno de outro contrato', async () => {
    const { client } = createPrismaMock({ aluno: null });
    const service = createCapacityPrescriptionService(client);

    await expect(
      service.saveVersion(
        {
          contractId: 'contract-1',
          actorProfessorId: 'professor-1',
          alunoId: 'aluno-do-outro-contrato',
        },
        {
          capacity: 'resisted',
          sourceRefs: basePayload.sourceRefs,
          technicalJustification: basePayload.technicalJustification,
          professorSummary: basePayload.professorSummary,
        }
      )
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Recurso não encontrado',
    });
  });

  it('mantém a mensagem do aluno separada da justificativa técnica do professor', () => {
    const { client } = createPrismaMock();
    const service = createCapacityPrescriptionService(client);
    const draft = service.createDraft({
      ...basePayload,
      technicalJustification: 'Detalhe técnico sensível: medicamento e conduta clínica.',
      studentMessage: 'Treino ajustado para respeitar seus limites de hoje.',
    });

    expect(draft.technicalJustification).toContain('Detalhe técnico sensível');
    expect(draft.studentMessage).toBe('Treino ajustado para respeitar seus limites de hoje.');
    expect(draft.studentMessage).not.toBe(draft.technicalJustification);
  });

  it('rejeita múltiplos conjuntos versionados também no serviço de domínio', async () => {
    const { client } = createPrismaMock();
    const service = createCapacityPrescriptionService(client);

    await expect(
      service.saveVersion(
        {
          contractId: 'contract-1',
          actorProfessorId: 'professor-1',
          alunoId: 'aluno-1',
        },
        {
          capacity: 'resisted',
          sourceRefs: basePayload.sourceRefs,
          technicalJustification: basePayload.technicalJustification,
          professorSummary: basePayload.professorSummary,
          parameterSetIds: ['set-1', 'set-2'],
        }
      )
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: 'Selecione no máximo um conjunto versionado por capacidade',
    });
  });

  it('rejeita configuração manual junto com conjunto versionado no serviço de domínio', async () => {
    const { client } = createPrismaMock({
      parameterSets: [
        {
          id: 'set-1',
          methodologyVersion: 'acesso-resisted-v1',
          parameters: {
            type: 'resisted',
            resisted: { sets: 3, repetitions: '8-12', expectedPse: 6 },
          },
        },
      ],
    });
    const service = createCapacityPrescriptionService(client);

    await expect(
      service.saveVersion(
        {
          contractId: 'contract-1',
          actorProfessorId: 'professor-1',
          alunoId: 'aluno-1',
        },
        {
          capacity: 'resisted',
          sourceRefs: basePayload.sourceRefs,
          technicalJustification: basePayload.technicalJustification,
          professorSummary: basePayload.professorSummary,
          parameterSetIds: ['set-1'],
          parameters: {
            type: 'resisted',
            resisted: { sets: 4, repetitions: '6-8', expectedPse: 8 },
          },
        }
      )
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: 'Conjunto versionado e parâmetros manuais não podem ser enviados na mesma versão',
    });
  });

  it('deriva a metodologia do conjunto canônico e rejeita versão forjada', async () => {
    const parameterSet = {
      id: 'set-1',
      methodologyVersion: 'acesso-resisted-v1',
      parameters: {
        type: 'resisted',
        resisted: { sets: 3, repetitions: '8-12', expectedPse: 6 },
      },
    };
    const { client, tx } = createPrismaMock({ parameterSets: [parameterSet] });
    const service = createCapacityPrescriptionService(client);

    await expect(
      service.saveVersion(
        {
          contractId: 'contract-1',
          actorProfessorId: 'professor-1',
          alunoId: 'aluno-1',
        },
        {
          capacity: 'resisted',
          sourceRefs: basePayload.sourceRefs,
          technicalJustification: basePayload.technicalJustification,
          professorSummary: basePayload.professorSummary,
          parameterSetIds: ['set-1'],
          methodologyVersion: 'forjada-v99',
        }
      )
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: 'Versão de metodologia divergente do conjunto versionado',
    });

    await service.saveVersion(
      {
        contractId: 'contract-1',
        actorProfessorId: 'professor-1',
        alunoId: 'aluno-1',
      },
      {
        capacity: 'resisted',
        sourceRefs: basePayload.sourceRefs,
        technicalJustification: basePayload.technicalJustification,
        professorSummary: basePayload.professorSummary,
        parameterSetIds: ['set-1'],
      }
    );

    expect(tx.capacityPrescriptionVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ methodologyVersion: 'acesso-resisted-v1' }),
      })
    );
  });

  it('garante que capacidade não publica Treino de hoje diretamente', () => {
    const { client } = createPrismaMock();
    const service = createCapacityPrescriptionService(client);
    const draft = service.createDraft(basePayload);

    expect(() => service.assertDoesNotPublishWorkout(draft)).not.toThrow();
    expect(() =>
      service.assertDoesNotPublishWorkout({ publishesTodayWorkout: true as false })
    ).toThrow('Capacidade física não pode publicar Treino de hoje diretamente');
  });
});
