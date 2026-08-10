import { canProfessorAccessBlock } from '../access-control/access-control.service.js';
import { filterCapacityPrescriptionReadData } from './capacity-prescription-read-permission.service.js';

jest.mock('../access-control/access-control.service.js', () => ({
  canProfessorAccessBlock: jest.fn(),
}));

const canAccess = canProfessorAccessBlock as jest.MockedFunction<
  typeof canProfessorAccessBlock
>;

const professor = {
  id: 'professor-1',
  role: 'professor',
  collaboratorFunction: { id: 'function-1', code: 'professor' },
} as never;

function client() {
  return {
    prontuarioPainCase: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.id === 'pain-1' ? { id: 'pain-1' } : null
      ),
    },
    prontuarioAnamnesisFollowUp: { findFirst: jest.fn().mockResolvedValue(null) },
    prontuarioMedicationProcedure: { findFirst: jest.fn().mockResolvedValue(null) },
    prontuarioDiscomfortSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
    prontuarioActivityHistory: { findFirst: jest.fn().mockResolvedValue(null) },
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('capacity prescription read permission filtering', () => {
  it('remove fontes, alertas derivados e objetivos sem os blocos atuais', async () => {
    canAccess.mockImplementation(async (_subject, blockKey) =>
      blockKey === 'plans.capacityPrescriptions.view'
    );

    const result = (await filterCapacityPrescriptionReadData({
      client: client(),
      professor,
      contractId: 'contract-1',
      value: {
        id: 'prescription-1',
        alunoId: 'aluno-1',
        currentVersion: 1,
        latestVersion: {
          id: 'version-1',
          alunoId: 'aluno-1',
          sourceRefs: [
            { type: 'prontuario_alert', id: 'pain-1', label: 'Dor no joelho' },
            { type: 'physical_assessment', id: 'assessment-1', label: 'Ventilometria' },
            { type: 'prontuario_goal', id: 'goal-1', label: 'Retomar corrida' },
            {
              type: 'professor_note',
              id: 'manual-note',
              label: 'Decisão técnica manual',
              origin: 'Anotação técnica do professor',
            },
          ],
          linkedProntuarioGoalIds: ['goal-1'],
          alerts: [
            {
              code: 'PRNT_CONDITION',
              message: 'Dor no joelho',
              severity: 'warning',
              sourceRefId: 'pain-1',
            },
            {
              code: 'ASSESSMENT_CONTEXT',
              message: 'Ventilometria',
              severity: 'info',
              sourceRefId: 'assessment-1',
            },
            {
              code: 'MANUAL_NOTE',
              message: 'Reavaliar em quatro semanas',
              severity: 'info',
              sourceRefId: 'manual-note',
            },
            {
              code: 'PRNT_CONDITION',
              message: 'Alerta sem proveniência não pode vazar',
              severity: 'warning',
              sourceRefId: null,
            },
          ],
        },
      },
    })) as any;

    expect(result.latestVersion.sourceRefs).toEqual([
      expect.objectContaining({ id: 'manual-note', type: 'professor_note' }),
    ]);
    expect(result.latestVersion.linkedProntuarioGoalIds).toEqual([]);
    expect(result.latestVersion.alerts).toEqual([
      expect.objectContaining({ code: 'MANUAL_NOTE', sourceRefId: 'manual-note' }),
    ]);
    expect(canAccess).toHaveBeenCalledWith(
      professor,
      'physicalAssessment.prnt.painCases'
    );
    expect(canAccess).toHaveBeenCalledWith(professor, 'students.details.assessments');
    expect(canAccess).toHaveBeenCalledWith(professor, 'physicalAssessment.prnt.goals');
  });

  it('filtra também versões históricas no formato bruto do Prisma', async () => {
    canAccess.mockImplementation(async (_subject, blockKey) =>
      blockKey !== 'students.details.profile'
    );

    const result = (await filterCapacityPrescriptionReadData({
      client: client(),
      professor,
      contractId: 'contract-1',
      value: [
        {
          id: 'version-1',
          alunoId: 'aluno-1',
          sources: [
            {
              sourceType: 'student_preference',
              sourceId: 'profile-1',
              label: 'Preferências do aluno',
            },
            {
              sourceType: 'physical_assessment',
              sourceId: 'assessment-1',
              label: 'Avaliação física',
            },
          ],
          goals: [{ goalId: 'goal-1' }],
          alerts: [
            {
              code: 'STUDENT_PREFERENCE',
              message: 'Evitar progressão abrupta',
              sourceRefId: 'profile-1',
            },
            {
              code: 'ASSESSMENT_CONTEXT',
              message: 'Avaliação física',
              sourceRefId: 'assessment-1',
            },
          ],
        },
      ],
    })) as any[];

    expect(result[0].sources).toEqual([
      expect.objectContaining({ sourceId: 'assessment-1' }),
    ]);
    expect(result[0].goals).toEqual([{ goalId: 'goal-1' }]);
    expect(result[0].alerts).toEqual([
      expect.objectContaining({ sourceRefId: 'assessment-1' }),
    ]);
  });

  it('oculta alerta histórico cuja origem PRNT já não pode ser resolvida', async () => {
    canAccess.mockResolvedValue(true);

    const result = (await filterCapacityPrescriptionReadData({
      client: client(),
      professor,
      contractId: 'contract-1',
      value: {
        id: 'version-1',
        alunoId: 'aluno-1',
        sourceRefs: [
          { type: 'prontuario_alert', id: 'removed-alert', label: 'Origem removida' },
        ],
        alerts: [
          {
            code: 'PRNT_CONDITION',
            message: 'Conteúdo histórico sensível',
            sourceRefId: 'removed-alert',
          },
        ],
      },
    })) as any;

    expect(result.sourceRefs).toEqual([]);
    expect(result.alerts).toEqual([]);
  });

  it('distingue nota manual de histórico de atividade removido', async () => {
    canAccess.mockResolvedValue(true);

    const result = (await filterCapacityPrescriptionReadData({
      client: client(),
      professor,
      contractId: 'contract-1',
      value: {
        id: 'version-1',
        alunoId: 'aluno-1',
        sourceRefs: [
          {
            type: 'professor_note',
            id: 'removed-activity',
            label: 'Corrida recreativa',
            origin: 'PRNT - histórico de atividade física',
          },
          {
            type: 'professor_note',
            id: 'manual-note',
            label: 'Decisão técnica manual',
            origin: 'Anotação técnica do professor',
          },
        ],
        alerts: [],
      },
    })) as any;

    expect(result.sourceRefs).toEqual([
      expect.objectContaining({ id: 'manual-note' }),
    ]);
  });
});
