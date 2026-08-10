import { canProfessorAccessBlock } from '../access-control/access-control.service.js';
import {
  assertCapacitySourcePermissions,
  CapacitySourcePermissionError,
} from './capacity-prescription-source-permission.service.js';

jest.mock('../access-control/access-control.service.js', () => ({
  canProfessorAccessBlock: jest.fn(),
}));

const canAccess = canProfessorAccessBlock as jest.MockedFunction<
  typeof canProfessorAccessBlock
>;

function client(overrides: Record<string, unknown> = {}) {
  const missing = { findFirst: jest.fn().mockResolvedValue(null) };
  return {
    prontuarioPainCase: missing,
    prontuarioAnamnesisFollowUp: { findFirst: jest.fn().mockResolvedValue(null) },
    prontuarioMedicationProcedure: { findFirst: jest.fn().mockResolvedValue(null) },
    prontuarioDiscomfortSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
    prontuarioActivityHistory: { findFirst: jest.fn().mockResolvedValue(null) },
    ...overrides,
  } as never;
}

const professor = {
  id: 'professor-1',
  role: 'professor',
  collaboratorFunction: { id: 'function-1' },
} as never;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('capacity prescription source permission policy', () => {
  it('rejeita avaliação quando manage está permitido e assessments está negado', async () => {
    canAccess.mockImplementation(async (_subject, blockKey) =>
      blockKey === 'plans.capacityPrescriptions.manage'
    );

    await expect(
      assertCapacitySourcePermissions({
        client: client(),
        professor,
        contractId: 'contract-1',
        alunoId: 'aluno-1',
        sourceRefs: [
          { type: 'physical_assessment', id: 'assessment-1', label: 'Ventilometria' },
        ],
        linkedGoalIds: [],
      })
    ).rejects.toBeInstanceOf(CapacitySourcePermissionError);

    expect(canAccess).toHaveBeenCalledWith(professor, 'students.details.assessments');
  });

  it('protege linkedProntuarioGoalIds mesmo sem fonte prontuario_goal', async () => {
    canAccess.mockImplementation(async (_subject, blockKey) =>
      blockKey === 'plans.capacityPrescriptions.manage'
    );

    await expect(
      assertCapacitySourcePermissions({
        client: client(),
        professor,
        contractId: 'contract-1',
        alunoId: 'aluno-1',
        sourceRefs: [
          {
            type: 'professor_note',
            id: 'manual-note',
            label: 'Nota técnica',
            origin: 'Manual',
          },
        ],
        linkedGoalIds: ['goal-1'],
      })
    ).rejects.toBeInstanceOf(CapacitySourcePermissionError);

    expect(canAccess).toHaveBeenCalledWith(professor, 'physicalAssessment.prnt.goals');
  });

  it('resolve a origem real do alerta e exige o bloco específico de dor', async () => {
    canAccess.mockResolvedValue(true);
    const painFindFirst = jest.fn().mockResolvedValue({ id: 'pain-1' });

    await assertCapacitySourcePermissions({
      client: client({ prontuarioPainCase: { findFirst: painFindFirst } }),
      professor,
      contractId: 'contract-1',
      alunoId: 'aluno-1',
      sourceRefs: [
        { type: 'prontuario_alert', id: 'pain-1', label: 'Dor no joelho' },
      ],
      linkedGoalIds: [],
    });

    expect(painFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'pain-1',
          record: { contractId: 'contract-1', alunoId: 'aluno-1' },
        },
      })
    );
    expect(canAccess).toHaveBeenCalledWith(
      professor,
      'physicalAssessment.prnt.painCases'
    );
  });

  it('reutiliza a decisão do bloco para fontes da mesma família', async () => {
    canAccess.mockResolvedValue(true);

    await assertCapacitySourcePermissions({
      client: client(),
      professor,
      contractId: 'contract-1',
      alunoId: 'aluno-1',
      sourceRefs: [
        { type: 'adipometry', id: 'assessment-1', label: 'Adipometria' },
        { type: 'ventilometry', id: 'assessment-2', label: 'Ventilometria' },
      ],
      linkedGoalIds: [],
    });

    expect(
      canAccess.mock.calls.filter(([, blockKey]) => blockKey === 'students.details.assessments')
    ).toHaveLength(1);
  });
});
