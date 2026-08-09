import { createConsolidatedPrescriptionService } from './consolidated-prescription.service.js';

const now = new Date('2026-08-08T16:30:00.000Z');
const CAPACITIES = ['resisted', 'flexibility', 'cyclic', 'balance'] as const;

const assemblyRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'assembly-1',
  contractId: 'contract-1',
  alunoId: 'aluno-1',
  currentVersion: 1,
  currentStatus: 'draft',
  createdByProfessorId: 'professor-1',
  updatedByProfessorId: 'professor-1',
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const versionRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'assembly-version-1',
  assemblyId: 'assembly-1',
  contractId: 'contract-1',
  alunoId: 'aluno-1',
  version: 1,
  previousVersionId: null,
  status: 'draft',
  responsibleProfessorId: 'professor-1',
  technicalObservation: null,
  professorJustification: 'Montagem inicial.',
  studentInstruction: 'Aguarde a revisão do professor.',
  reviewedByProfessorId: null,
  reviewedAt: null,
  approvedByProfessorId: null,
  approvedAt: null,
  blockedByProfessorId: null,
  blockedAt: null,
  blockReason: null,
  createdByProfessorId: 'professor-1',
  conflicts: [],
  createdAt: now,
  ...overrides,
});

const capacityVersion = (index: number, overrides: Record<string, unknown> = {}) => {
  const capacity = CAPACITIES[index] ?? 'resisted';
  const id = `capacity-version-${index + 1}`;
  return {
    id,
    prescriptionId: `capacity-prescription-${index + 1}`,
    contractId: 'contract-1',
    alunoId: 'aluno-1',
    responsibleProfessorId: 'professor-1',
    capacity,
    status: 'active',
    version: 2,
    technicalJustification: `Treino ${capacity} compatível com a avaliação vigente.`,
    professorSummary: 'Bloco ativo e validado.',
    studentMessage: 'Siga as orientações do professor.',
    methodologyVersion: null,
    parameterSetIds: [],
    parameters: null,
    publishesTodayWorkout: false,
    createdAt: now,
    sources: [
      {
        id: `capacity-source-${index + 1}`,
        versionId: id,
        sourceType: 'prontuario_goal',
        sourceId: `goal-${index + 1}`,
        label: `Objetivo do PRNT ${index + 1}`,
        assessedAt: now,
        origin: 'PRNT-001',
        sourceVersion: '3',
        responsibleProfessorId: 'professor-1',
        createdAt: now,
      },
    ],
    alerts: [],
    ...overrides,
  };
};

const allCapacityVersions = () => CAPACITIES.map((_, index) => capacityVersion(index));
const allCapacityInputs = () =>
  CAPACITIES.map((_, index) => ({ capacityPrescriptionVersionId: `capacity-version-${index + 1}` }));

const persistedBlock = (index: number, overrides: Record<string, unknown> = {}) => ({
  id: `block-${index + 1}`,
  capacityPrescriptionVersionId: `capacity-version-${index + 1}`,
  capacity: CAPACITIES[index] ?? 'resisted',
  capacityVersion: 2,
  capacityStatus: 'active',
  position: index,
  ...overrides,
});

const persistedRef = (index: number, overrides: Record<string, unknown> = {}) => ({
  id: `ref-${index + 1}`,
  role: 'capacity_source',
  sourceType: 'prontuario_goal',
  sourceId: `goal-${index + 1}`,
  label: `Objetivo do PRNT ${index + 1}`,
  assessedAt: now,
  origin: 'PRNT-001',
  sourceVersion: '3',
  responsibleProfessorId: 'professor-1',
  context: null,
  ...overrides,
});

const persistedBlocks = () => CAPACITIES.map((_, index) => persistedBlock(index));
const persistedRefs = () => CAPACITIES.map((_, index) => persistedRef(index));

function harness(rawResponses: unknown[][], capacityVersions = allCapacityVersions()) {
  const queryRaw = jest.fn();
  for (const response of rawResponses) queryRaw.mockResolvedValueOnce(response);

  const tx = {
    aluno: {
      findFirst: jest.fn().mockResolvedValue({ id: 'aluno-1' }),
    },
    professor: {
      findFirst: jest.fn().mockResolvedValue({ id: 'professor-1' }),
    },
    capacityPrescriptionVersion: {
      findMany: jest.fn().mockResolvedValue(capacityVersions),
    },
    prontuarioGoal: {
      findFirst: jest.fn().mockResolvedValue({ id: 'goal-extra' }),
    },
    $queryRaw: queryRaw,
    $executeRaw: jest.fn().mockResolvedValue(1),
  };

  const client = {
    ...tx,
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };

  return {
    tx,
    client,
    service: createConsolidatedPrescriptionService(client as never),
  };
}

describe('consolidatedPrescriptionService persistence contract', () => {
  it('cria rascunho com as quatro capacidades, valida origem adicional e ignora autoridade forjada pelo cliente', async () => {
    const createdAssembly = assemblyRow();
    const createdVersion = versionRow();
    const { service, tx } = harness([
      [],
      [createdAssembly],
      [createdVersion],
      persistedBlocks(),
      persistedRefs(),
    ]);

    const result = await service.createDraft(
      {
        contractId: 'contract-1',
        alunoId: 'aluno-1',
        actorProfessorId: 'professor-1',
      },
      {
        capacityBlocks: allCapacityInputs(),
        dataRefs: [
          {
            role: 'assessment',
            sourceType: 'prontuario_goal',
            sourceId: 'goal-extra',
            label: 'Objetivo complementar do prontuário',
          },
        ],
        professorJustification: 'Montagem inicial.',
        studentInstruction: 'Aguarde a revisão do professor.',
        status: 'approved',
        validatedByProfessorId: 'attacker-professor',
        validatedAt: '2026-08-08T00:00:00.000Z',
        contractId: 'contract-other',
      } as never,
      now
    );

    expect(result.currentStatus).toBe('draft');
    expect(result.latestVersion.status).toBe('draft');
    expect(result.latestVersion.approvedByProfessorId).toBeNull();
    expect(result.latestVersion.capacityBlocks).toHaveLength(4);
    expect(result.latestVersion.capacityBlocks.map((block) => block.capacity)).toEqual(CAPACITIES);
    expect(tx.capacityPrescriptionVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: allCapacityInputs().map((entry) => entry.capacityPrescriptionVersionId) },
          contractId: 'contract-1',
          alunoId: 'aluno-1',
        },
      })
    );
    expect(tx.prontuarioGoal.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'goal-extra',
        record: { contractId: 'contract-1', alunoId: 'aluno-1' },
      },
      select: { id: true },
    });
  });

  it('rejeita composição incompleta mesmo quando todas as versões informadas são válidas', async () => {
    const versions = allCapacityVersions().slice(0, 3);
    const { service, tx } = harness([[]], versions);

    await expect(
      service.createDraft(
        {
          contractId: 'contract-1',
          alunoId: 'aluno-1',
          actorProfessorId: 'professor-1',
        },
        {
          capacityBlocks: allCapacityInputs().slice(0, 3),
          professorJustification: 'Não deve aceitar montagem incompleta.',
        },
        now
      )
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      details: { missingCapacities: ['balance'] },
    });

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejeita referência de capacidade que não pertence ao contrato/aluno', async () => {
    const { service, tx } = harness([[]], []);

    await expect(
      service.createDraft(
        {
          contractId: 'contract-1',
          alunoId: 'aluno-1',
          actorProfessorId: 'professor-1',
        },
        {
          capacityBlocks: [{ capacityPrescriptionVersionId: 'capacity-version-other-tenant' }],
          professorJustification: 'Não deve persistir.',
        },
        now
      )
    ).rejects.toMatchObject({ code: 'INVALID_CAPACITY_VERSION' });

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejeita dataRef adicional de prontuário fora do contrato/aluno antes da persistência', async () => {
    const { service, tx } = harness([[]]);
    tx.prontuarioGoal.findFirst.mockResolvedValue(null);

    await expect(
      service.createDraft(
        {
          contractId: 'contract-1',
          alunoId: 'aluno-1',
          actorProfessorId: 'professor-1',
        },
        {
          capacityBlocks: allCapacityInputs(),
          dataRefs: [
            {
              role: 'assessment',
              sourceType: 'prontuario_goal',
              sourceId: 'goal-from-other-student',
            },
          ],
          professorJustification: 'Não deve aceitar origem fora do escopo.',
        },
        now
      )
    ).rejects.toMatchObject({ code: 'INVALID_DATA_REFERENCE' });

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejeita a segunda escrita quando a atualização otimista perde a corrida', async () => {
    const currentAssembly = assemblyRow();
    const currentVersion = versionRow();
    const { service, tx } = harness([
      [currentAssembly],
      [currentVersion],
      persistedBlocks(),
      persistedRefs(),
      [],
    ]);

    await expect(
      service.updateComposition(
        {
          contractId: 'contract-1',
          alunoId: 'aluno-1',
          actorProfessorId: 'professor-1',
        },
        {
          expectedCurrentVersion: 1,
          capacityBlocks: allCapacityInputs(),
          professorJustification: 'Nova revisão concorrente.',
        },
        now
      )
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { expectedCurrentVersion: 1 },
    });

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('aprova por comando próprio, cria nova versão e preserva a anterior', async () => {
    const currentAssembly = assemblyRow({ currentVersion: 2, currentStatus: 'ready_for_review' });
    const reviewVersion = versionRow({
      id: 'assembly-version-2',
      version: 2,
      status: 'ready_for_review',
      previousVersionId: 'assembly-version-1',
      reviewedByProfessorId: 'professor-1',
      reviewedAt: new Date('2026-08-08T15:00:00.000Z'),
    });
    const approvedAssembly = assemblyRow({
      currentVersion: 3,
      currentStatus: 'approved',
      updatedAt: now,
    });
    const approvedVersion = versionRow({
      id: 'assembly-version-3',
      version: 3,
      previousVersionId: 'assembly-version-2',
      status: 'approved',
      reviewedByProfessorId: 'professor-1',
      reviewedAt: new Date('2026-08-08T15:00:00.000Z'),
      approvedByProfessorId: 'professor-1',
      approvedAt: now,
    });

    const { service } = harness([
      [currentAssembly],
      [reviewVersion],
      persistedBlocks(),
      persistedRefs(),
      [approvedAssembly],
      [approvedVersion],
      persistedBlocks().map((block, index) => ({ ...block, id: `approved-block-${index + 1}` })),
      persistedRefs().map((ref, index) => ({ ...ref, id: `approved-ref-${index + 1}` })),
    ]);

    const result = await service.approve(
      {
        contractId: 'contract-1',
        alunoId: 'aluno-1',
        actorProfessorId: 'professor-1',
      },
      { expectedCurrentVersion: 2 },
      now
    );

    expect(result.currentVersion).toBe(3);
    expect(result.currentStatus).toBe('approved');
    expect(result.latestVersion).toMatchObject({
      version: 3,
      previousVersionId: 'assembly-version-2',
      status: 'approved',
      approvedByProfessorId: 'professor-1',
      approvedAt: now.toISOString(),
    });
    expect(result.latestVersion.capacityBlocks).toHaveLength(4);
    expect(result.latestVersion.canReleaseOperationalWorkout).toBe(true);
  });
});
