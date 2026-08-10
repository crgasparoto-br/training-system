import { createProntuarioOverviewReadService } from './prontuario-overview-read.service.js';

function createClient(record: Record<string, unknown>) {
  return {
    aluno: {
      findFirst: jest.fn().mockResolvedValue({ id: 'aluno-1' }),
    },
    prontuarioRecord: {
      findMany: jest.fn().mockResolvedValue([record]),
    },
  } as any;
}

const loadParqOverview = jest.fn().mockResolvedValue({
  latestSubmission: null,
  submissions: [],
  state: 'NOT_STARTED',
  legacy: null,
});

const deniedClinicalPermissions = {
  goals: true,
  anamnesisFollowUp: false,
  activityHistory: false,
  medicationsProcedures: false,
  painCases: false,
  discomforts: false,
};

describe('prontuarioOverviewReadService', () => {
  beforeEach(() => {
    loadParqOverview.mockClear();
  });

  it('does not query or expose clinical relations without their specific blocks', async () => {
    const client = createClient({
      id: 'record-1',
      professorId: 'professor-1',
      goals: [{ id: 'goal-1', title: 'Retomar corrida' }],
      anamnesisFollowUps: [{ id: 'follow-up-1', itemLabel: 'Cirurgia anterior' }],
      activityHistory: [{ id: 'activity-1', description: 'Corrida' }],
      medicationsProcedures: [{ id: 'medication-1', name: 'Medicamento sensível' }],
      painCases: [{ id: 'pain-1', title: 'Dor no joelho' }],
      discomfortSnapshots: [{ id: 'snapshot-1', entries: [{ regionId: 'knee' }] }],
    });
    const service = createProntuarioOverviewReadService(client, loadParqOverview as any);

    const result = await service.overview(
      'contract-1',
      'aluno-1',
      deniedClinicalPermissions
    );

    expect(client.prontuarioRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contractId: 'contract-1', alunoId: 'aluno-1' },
        include: {
          goals: { orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] },
        },
      })
    );
    expect(result.currentRecord).toMatchObject({
      goals: [{ id: 'goal-1', title: 'Retomar corrida' }],
      anamnesisFollowUps: [],
      activityHistory: [],
      medicationsProcedures: [],
      painCases: [],
      discomfortSnapshots: [],
    });
    expect(JSON.stringify(result)).not.toContain('Medicamento sensível');
    expect(JSON.stringify(result)).not.toContain('Dor no joelho');
  });

  it('includes only the relations whose blocks are granted', async () => {
    const client = createClient({
      id: 'record-1',
      professorId: 'professor-1',
      goals: [],
      painCases: [{ id: 'pain-1', title: 'Dor no joelho' }],
      discomfortSnapshots: [{ id: 'snapshot-1', professorId: null, entries: [] }],
    });
    const service = createProntuarioOverviewReadService(client, loadParqOverview as any);

    const result = await service.overview('contract-1', 'aluno-1', {
      goals: false,
      anamnesisFollowUp: false,
      activityHistory: false,
      medicationsProcedures: false,
      painCases: true,
      discomforts: true,
    });

    expect(client.prontuarioRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          painCases: expect.any(Object),
          discomfortSnapshots: expect.any(Object),
        }),
      })
    );
    expect(result.currentRecord).toMatchObject({
      goals: [],
      painCases: [{ id: 'pain-1', title: 'Dor no joelho' }],
      discomfortSnapshots: [
        expect.objectContaining({ id: 'snapshot-1', professorId: 'professor-1' }),
      ],
    });
  });
});
