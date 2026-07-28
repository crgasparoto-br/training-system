import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapacityPrescriptionSourceRef, CapacityPrescriptionView, ProntuarioOverview } from '@corrida/types';
import { CapacityPrescriptionScreen } from './CapacityPrescriptionScreen';

const mocks = vi.hoisted(() => ({
  listStudents: vi.fn(),
  getProfile: vi.fn(),
  overview: vi.fn(),
  listByAluno: vi.fn(),
  listParameterSets: vi.fn(),
  listCatalog: vi.fn(),
  listPlanning: vi.fn(),
  listGoalClassifications: vi.fn(),
  listAssessmentSources: vi.fn(),
  save: vi.fn(),
  savePlanning: vi.fn(),
  saveGoalClassification: vi.fn(),
}));

vi.mock('../../access/access-control', () => ({ canAccessBlock: () => true }));
vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: { user: object }) => unknown) => selector({ user: {} }),
}));
vi.mock('../../services/aluno.service', () => ({
  alunoService: {
    list: mocks.listStudents,
    getSegmentedProfile: mocks.getProfile,
  },
}));
vi.mock('../../services/prontuario.service', () => ({
  prontuarioService: { overview: mocks.overview },
}));
vi.mock('../../services/capacity-prescription.service', () => ({
  capacityPrescriptionService: {
    listByAluno: mocks.listByAluno,
    listParameterSets: mocks.listParameterSets,
    listCatalog: mocks.listCatalog,
    listPlanning: mocks.listPlanning,
    listGoalClassifications: mocks.listGoalClassifications,
    listAssessmentSources: mocks.listAssessmentSources,
    save: mocks.save,
    savePlanning: mocks.savePlanning,
    saveGoalClassification: mocks.saveGoalClassification,
  },
}));

const studentA = { id: 'aluno-a', user: { profile: { name: 'Aluno A' } } };
const studentB = { id: 'aluno-b', user: { profile: { name: 'Aluno B' } } };

const overview = {
  currentRecord: {
    goals: [],
    painCases: [
      {
        id: 'pain-1',
        status: 'active',
        title: 'Dor no joelho',
        region: 'Joelho direito',
        followUps: [],
      },
    ],
    anamnesisFollowUps: [],
    medicationsProcedures: [],
    discomfortSnapshots: [],
    activityHistory: [],
  },
} as unknown as ProntuarioOverview;

function prescription(
  capacity: 'resisted' | 'cyclic',
  sourceRef: CapacityPrescriptionSourceRef
): CapacityPrescriptionView {
  return {
    id: `prescription-${capacity}`,
    contractId: 'contract-a',
    alunoId: 'aluno-a',
    capacity,
    status: 'active',
    currentVersion: 2,
    createdByProfessorId: 'professor-a',
    updatedByProfessorId: 'professor-a',
    createdAt: '2026-07-27T10:00:00.000Z',
    updatedAt: '2026-07-27T11:00:00.000Z',
    publishesTodayWorkout: false,
    latestVersion: {
      id: `version-${capacity}`,
      prescriptionId: `prescription-${capacity}`,
      contractId: 'contract-a',
      alunoId: 'aluno-a',
      capacity,
      status: 'active',
      version: 2,
      responsibleProfessorId: 'professor-a',
      technicalJustification: `Justificativa ${capacity}`,
      professorSummary: `Resumo ${capacity}`,
      parameterSetIds: [],
      parameters:
        capacity === 'resisted'
          ? { type: 'resisted', resisted: { sets: 4 } }
          : { type: 'cyclic', cyclic: { zones: [{ name: 'Z2', volume: '20 min' }] } },
      sourceRefs: [sourceRef],
      linkedProntuarioGoalIds: [],
      alerts: [],
      createdAt: '2026-07-27T11:00:00.000Z',
      publishesTodayWorkout: false,
    },
  };
}

const resistedPrescription = prescription('resisted', {
  type: 'prontuario_alert',
  id: 'pain-1',
  label: 'Dor no joelho',
  origin: 'PRNT - casos de dor',
});
const cyclicPrescription = prescription('cyclic', {
  type: 'physical_assessment',
  id: 'assessment-1',
  label: 'Ventilometria 2026',
  origin: 'VENT-001',
  responsibleProfessorId: 'professor-a',
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listStudents.mockResolvedValue({ alunos: [studentA, studentB] });
  mocks.getProfile.mockResolvedValue(null);
  mocks.overview.mockResolvedValue(overview);
  mocks.listByAluno.mockImplementation((alunoId: string) =>
    Promise.resolve(alunoId === 'aluno-a' ? [resistedPrescription, cyclicPrescription] : [])
  );
  mocks.listParameterSets.mockResolvedValue([]);
  mocks.listCatalog.mockResolvedValue([
    {
      id: 'cyclic-1',
      contractId: 'contract-a',
      category: 'cyclic_stimulus',
      code: 'CONTINUO',
      name: 'Contínuo',
      metadata: {},
      version: 1,
      isCurrent: true,
      createdByProfessorId: 'professor-a',
      createdAt: '2026-07-27T10:00:00.000Z',
      updatedAt: '2026-07-27T10:00:00.000Z',
    },
  ]);
  mocks.listPlanning.mockResolvedValue([]);
  mocks.listGoalClassifications.mockResolvedValue([]);
  mocks.listAssessmentSources.mockResolvedValue([
    {
      ref: {
        type: 'physical_assessment',
        id: 'assessment-1',
        label: 'Ventilometria 2026',
        origin: 'VENT-001',
        responsibleProfessorId: 'professor-a',
      },
      category: 'ventilometry',
      status: 'completed',
      details: [{ label: 'LAn', value: 168, unit: 'bpm' }],
    },
  ]);
  mocks.save.mockResolvedValue({});
});

describe('CapacityPrescriptionScreen', () => {
  it('restaura fontes por capacidade sem marcar automaticamente fontes novas', async () => {
    const user = userEvent.setup();
    render(<CapacityPrescriptionScreen />);

    await user.selectOptions(await screen.findByLabelText('Aluno'), 'aluno-a');
    expect(await screen.findByText('Fontes para Resistido')).toBeInTheDocument();

    const painCheckbox = screen.getByRole('checkbox', { name: /Dor no joelho/i });
    const assessmentCheckbox = screen.getByRole('checkbox', { name: /Ventilometria 2026/i });
    expect(painCheckbox).toBeChecked();
    expect(assessmentCheckbox).not.toBeChecked();

    await user.click(screen.getByRole('tab', { name: /Cíclico/i }));
    expect(await screen.findByText('Fontes para Cíclico')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Dor no joelho/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Ventilometria 2026/i })).toBeChecked();
  });

  it('permite editar zona cíclica completa e envia volume, pace e FC', async () => {
    const user = userEvent.setup();
    render(<CapacityPrescriptionScreen />);

    await user.selectOptions(await screen.findByLabelText('Aluno'), 'aluno-b');
    await user.click(await screen.findByRole('tab', { name: /Cíclico/i }));
    await user.type(screen.getByLabelText('Justificativa técnica do professor'), 'Base aeróbica');
    await user.type(screen.getByLabelText('Resumo técnico para outro profissional'), 'Controle por zona');
    await user.click(screen.getByRole('button', { name: /Adicionar zona/i }));

    fireEvent.change(screen.getByLabelText('Nome da zona'), { target: { value: 'Z2' } });
    fireEvent.change(screen.getByLabelText('Percentual mínimo'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Percentual máximo'), { target: { value: '70' } });
    fireEvent.change(screen.getByLabelText('Volume da zona'), { target: { value: '30 min' } });
    fireEvent.change(screen.getByLabelText('Pace alvo'), { target: { value: '5:40/km' } });
    fireEvent.change(screen.getByLabelText('FC alvo'), { target: { value: '138-151 bpm' } });
    await user.click(screen.getByRole('button', { name: /Versionar Cíclico/i }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][1]).toMatchObject({
      capacity: 'cyclic',
      parameters: {
        type: 'cyclic',
        cyclic: {
          zones: [
            {
              name: 'Z2',
              minPercent: 60,
              maxPercent: 70,
              volume: '30 min',
              pace: '5:40/km',
              targetHeartRate: '138-151 bpm',
            },
          ],
        },
      },
    });
  });

  it('persiste classificações antes de versionar a capacidade', async () => {
    const user = userEvent.setup();
    const overviewWithGoal = {
      currentRecord: {
        ...(overview.currentRecord as NonNullable<ProntuarioOverview['currentRecord']>),
        goals: [
          {
            id: 'goal-1',
            title: 'Fortalecer joelho',
            description: null,
          },
        ],
      },
    } as unknown as ProntuarioOverview;
    mocks.overview.mockResolvedValueOnce(overviewWithGoal);
    mocks.listGoalClassifications.mockResolvedValueOnce([]);
    mocks.saveGoalClassification.mockResolvedValueOnce({});

    render(<CapacityPrescriptionScreen />);
    await user.selectOptions(await screen.findByLabelText('Aluno'), 'aluno-b');
    await user.click(await screen.findByRole('checkbox', { name: /Resistido/i }));
    await user.type(
      screen.getByLabelText('Justificativa técnica do professor'),
      'Fortalecimento progressivo',
    );
    await user.type(
      screen.getByLabelText('Resumo técnico para outro profissional'),
      'Objetivo validado',
    );
    await user.click(screen.getByRole('button', { name: /Versionar Resistido/i }));

    await waitFor(() => expect(mocks.saveGoalClassification).toHaveBeenCalledTimes(1));
    expect(mocks.saveGoalClassification).toHaveBeenCalledWith(
      'aluno-b',
      'goal-1',
      expect.objectContaining({ capacities: ['resisted'] }),
    );
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.saveGoalClassification.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.save.mock.invocationCallOrder[0],
    );
  });


  it('exibe ângulo derivado para revisão ao selecionar a avaliação', async () => {
    const user = userEvent.setup();
    mocks.listAssessmentSources.mockResolvedValueOnce([
      {
        ref: {
          type: 'flexibility_assessment',
          id: 'flex-assessment-1',
          label: 'Flexibilidade de ombro',
          origin: 'FLEX-001',
          responsibleProfessorId: 'professor-a',
        },
        category: 'flexibility',
        status: 'completed',
        details: [{ label: 'Flexão de ombro', value: 142, unit: 'graus' }],
      },
    ]);

    render(<CapacityPrescriptionScreen />);
    await user.selectOptions(await screen.findByLabelText('Aluno'), 'aluno-b');
    await user.click(await screen.findByRole('tab', { name: /Flexibilidade/i }));
    await user.click(
      await screen.findByRole('checkbox', { name: /Flexibilidade de ombro/i }),
    );

    expect(await screen.findByText('Ombro')).toBeInTheDocument();
    expect(screen.getByLabelText('Ângulo avaliado')).toHaveValue(142);
  });

});
