import {
  createConsolidatedPrescriptionService,
  deriveStructuredConflicts,
} from './consolidated-prescription.service.js';

const now = new Date('2026-08-09T14:30:00.000Z');
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

  const capacityRoots = capacityVersions.map((version) => ({
    id: version.prescriptionId,
    currentVersion: version.version,
    status: 'active',
  }));

  const tx = {
    aluno: { findFirst: jest.fn().mockResolvedValue({ id: 'aluno-1' }) },
    professor: { findFirst: jest.fn().mockResolvedValue({ id: 'professor-1' }) },
    capacityPrescriptionVersion: { findMany: jest.fn().mockResolvedValue(capacityVersions) },
    capacityPrescription: { findMany: jest.fn().mockResolvedValue(capacityRoots) },
    prontuarioGoal: { findFirst: jest.fn().mockResolvedValue({ id: 'goal-extra' }) },
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

describe('deriveStructuredConflicts', () => {
  it('não cria conflito a partir de texto livre mesmo quando o texto parece clínico', () => {
    const blocks = CAPACITIES.map((capacity) => ({
      capacity,
      alerts: [],
      technicalJustification: 'dor intensa no joelho e alta intensidade',
      professorSummary: 'agachamento forte',
    })) as never;

    expect(deriveStructuredConflicts(blocks, 'Justificativa objetiva.')).toEqual([]);
  });

  it('propaga severidade estruturada sem transformar warning em bloqueio', () => {
    const blocks = CAPACITIES.map((capacity, index) => ({
      capacity,
      alerts:
        index === 0
          ? [{ code: 'load-review', message: 'Revisar carga.', severity: 'warning', sourceRefId: null }]
          : [],
    }));

    const conflicts = deriveStructuredConflicts(blocks, 'Justificativa válida.');
    expect(conflicts).toEqual([
      expect.objectContaining({ code: 'capacity-alert:resisted:load-review', severity: 'warning' }),
    ]);
    expect(conflicts.some((item) => item.severity === 'critical')).toBe(false);
  });

  it('preserva alerta critical estruturado como bloqueador e marca versão defasada como critical', () => {
    const blocks = CAPACITIES.map((capacity, index) => ({
      capacity,
      alerts:
        index === 1
          ? [{ code: 'restriction', message: 'Restrição ativa.', severity: 'critical', sourceRefId: 'src-1' }]
          : [],
      ...(index === 2 ? { isCurrent: false, rootStatus: 'active' } : {}),
    }));

    const conflicts = deriveStructuredConflicts(blocks, 'Justificativa válida.');
    expect(conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'capacity-alert:flexibility:restriction', severity: 'critical' }),
        expect.objectContaining({ code: 'capacity-version-ineligible:cyclic', severity: 'critical' }),
      ])
    );
  });
});

describe('consolidatedPrescriptionService persistence contract', () => {
  it('cria rascunho com quatro capacidades e ignora autoridade forjada pelo cliente', async () => {
    const { service, tx } = harness([
      [],
      [assemblyRow()],
      [versionRow()],
      persistedBlocks(),
      persistedRefs(),
    ]);

    const result = await service.createDraft(
      { contractId: 'contract-1', alunoId: 'aluno-1', actorProfessorId: 'professor-1' },
      {
        capacityBlocks: allCapacityInputs(),
        professorJustification: 'Montagem inicial.',
        status: 'approved',
        approvedByProfessorId: 'attacker-professor',
        contractId: 'contract-other',
      } as never,
      now
    );

    expect(result.currentStatus).toBe('draft');
    expect(result.latestVersion.status).toBe('draft');
    expect(result.latestVersion.approvedByProfessorId).toBeNull();
    expect(tx.capacityPrescriptionVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: allCapacityInputs().map((entry) => entry.capacityPrescriptionVersionId) },
          contractId: 'contract-1',
          alunoId: 'aluno-1',
        },
      })
    );
  });

  it('rejeita composição incompleta', async () => {
    const versions = allCapacityVersions().slice(0, 3);
    const { service, tx } = harness([[]], versions);
    await expect(
      service.createDraft(
        { contractId: 'contract-1', alunoId: 'aluno-1', actorProfessorId: 'professor-1' },
        {
          capacityBlocks: allCapacityInputs().slice(0, 3),
          professorJustification: 'Não deve aceitar montagem incompleta.',
        },
        now
      )
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', details: { missingCapacities: ['balance'] } });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejeita versão de capacidade que não pertence ao contrato/aluno', async () => {
    const { service, tx } = harness([[]], []);
    await expect(
      service.createDraft(
        { contractId: 'contract-1', alunoId: 'aluno-1', actorProfessorId: 'professor-1' },
        {
          capacityBlocks: [{ capacityPrescriptionVersionId: 'capacity-version-other-tenant' }],
          professorJustification: 'Não deve persistir.',
        },
        now
      )
    ).rejects.toMatchObject({ code: 'INVALID_CAPACITY_VERSION' });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('falha a transação quando o registro de auditoria falha', async () => {
    const { service, tx } = harness([
      [],
      [assemblyRow()],
      [versionRow()],
      persistedBlocks(),
      persistedRefs(),
    ]);
    tx.$executeRaw.mockImplementationOnce(async () => 1);
    for (let index = 0; index < 7; index += 1) tx.$executeRaw.mockImplementationOnce(async () => 1);
    tx.$executeRaw.mockImplementationOnce(async () => {
      throw new Error('audit unavailable');
    });

    await expect(
      service.createDraft(
        { contractId: 'contract-1', alunoId: 'aluno-1', actorProfessorId: 'professor-1' },
        { capacityBlocks: allCapacityInputs(), professorJustification: 'Montagem inicial.' },
        now
      )
    ).rejects.toThrow('audit unavailable');
  });

  it('aprova por comando próprio e deriva ator/data no backend', async () => {
    const currentAssembly = assemblyRow({ currentVersion: 2, currentStatus: 'ready_for_review' });
    const reviewVersion = versionRow({
      id: 'assembly-version-2',
      version: 2,
      status: 'ready_for_review',
      previousVersionId: 'assembly-version-1',
      reviewedByProfessorId: 'professor-1',
      reviewedAt: new Date('2026-08-09T14:00:00.000Z'),
    });
    const approvedAssembly = assemblyRow({ currentVersion: 3, currentStatus: 'approved', updatedAt: now });
    const approvedVersion = versionRow({
      id: 'assembly-version-3',
      version: 3,
      previousVersionId: 'assembly-version-2',
      status: 'approved',
      reviewedByProfessorId: 'professor-1',
      reviewedAt: new Date('2026-08-09T14:00:00.000Z'),
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
      persistedBlocks(),
      persistedRefs(),
    ]);

    const result = await service.approve(
      { contractId: 'contract-1', alunoId: 'aluno-1', actorProfessorId: 'professor-1' },
      { expectedCurrentVersion: 2 },
      now
    );

    expect(result.currentStatus).toBe('approved');
    expect(result.latestVersion).toMatchObject({
      status: 'approved',
      approvedByProfessorId: 'professor-1',
      approvedAt: now.toISOString(),
    });
    expect(result.latestVersion.canReleaseOperationalWorkout).toBe(true);
  });
});
