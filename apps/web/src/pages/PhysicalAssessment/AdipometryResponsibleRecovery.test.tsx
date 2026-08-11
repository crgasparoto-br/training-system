import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AdipometryAssessmentDetail } from '@corrida/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => {
  const current: AdipometryAssessmentDetail = {
    id: 'assessment-1',
    contractId: 'contract-1',
    alunoId: 'aluno-1',
    professorId: 'professor-revoked',
    code: 'ADPT-001',
    sequenceNumber: 1,
    assessmentDate: '2026-08-05',
    status: 'DRAFT',
    revisionStatus: 'DRAFT',
    rootAssessmentId: 'assessment-1',
    revisionNumber: 1,
    measurements: { tricepsMm: 15 },
    notes: 'valor local preservado',
    createdAt: '2026-08-05T10:00:00.000Z',
    updatedAt: '2026-08-05T11:00:00.000Z',
  };

  return {
    current,
    reassigned: {
      ...current,
      professorId: 'professor-replacement',
      updatedAt: '2026-08-05T12:00:00.000Z',
    } satisfies AdipometryAssessmentDetail,
  };
});

const mocks = vi.hoisted(() => ({
  listResponsibleProfessors: vi.fn(),
  reassignResponsible: vi.fn(),
  setCurrent: vi.fn(),
  setForm: vi.fn(),
  setPreview: vi.fn(),
  setCapacityWarningConfirmed: vi.fn(),
  setConflict: vi.fn(),
  setSuccess: vi.fn(),
  setError: vi.fn(),
  resetMessages: vi.fn(),
}));

vi.mock('../../access/access-control', () => ({
  canAccessBlock: () => true,
}));

vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: { id: 'actor-1', professor: { id: 'actor-professor' } },
  }),
}));

vi.mock('../../services/adipometry.service', () => ({
  adipometryService: {
    listResponsibleProfessors: mocks.listResponsibleProfessors,
    reassignResponsible: mocks.reassignResponsible,
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    calculate: vi.fn(),
    finalize: vi.fn(),
    startCorrection: vi.fn(),
    cancelCorrection: vi.fn(),
    getAssessment: vi.fn(),
  },
}));

vi.mock('./useAdipometryWorkspace', () => ({
  useAdipometryWorkspace: () => ({
    alunos: [{ id: 'aluno-1', user: { profile: { name: 'Aluno A' } } }],
    selectedAlunoId: 'aluno-1',
    selectAluno: vi.fn(),
    assessments: [],
    current: fixtures.current,
    setCurrent: mocks.setCurrent,
    protocols: [],
    support: null,
    form: {
      assessmentDate: '2026-08-05',
      protocolKey: '',
      protocolSex: '',
      protocolSexSource: '',
      protocolSexOverrideReason: '',
      anthropometryAssessmentId: '',
      notes: 'valor local preservado',
      measurements: {
        weightKg: '',
        tricepsMm: '15',
        subscapularMm: '',
        suprailiacMm: '',
        abdominalMm: '',
        thighMm: '',
      },
    },
    setForm: mocks.setForm,
    preview: null,
    setPreview: mocks.setPreview,
    fieldErrors: {},
    setFieldErrors: vi.fn(),
    loading: false,
    referencesLoading: false,
    setLoading: vi.fn(),
    dirty: true,
    setDirty: vi.fn(),
    conflict: false,
    setConflict: mocks.setConflict,
    error: null,
    setError: mocks.setError,
    success: null,
    setSuccess: mocks.setSuccess,
    supportError: null,
    setRefreshToken: vi.fn(),
    capacityWarningConfirmed: true,
    setCapacityWarningConfirmed: mocks.setCapacityWarningConfirmed,
    resetMessages: mocks.resetMessages,
    invalidateWorkspace: vi.fn(),
    setFormField: vi.fn(),
    setMeasurement: vi.fn(),
  }),
}));

vi.mock('./AdipometryView', () => ({
  AdipometryView: (props: { canMutate: boolean; mutationBlockMessage?: string }) => (
    <output aria-label="mutation-state">
      {props.canMutate ? 'enabled' : props.mutationBlockMessage ?? 'disabled'}
    </output>
  ),
}));

vi.mock('./AdipometryScreenOverlays', () => ({
  AdipometryScreenOverlays: () => null,
}));

import { AdipometryScreen } from './AdipometryScreen';

describe('ADPT responsible recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listResponsibleProfessors.mockResolvedValue([
      { id: 'professor-replacement', name: 'Prof. Substituto' },
    ]);
    mocks.reassignResponsible.mockResolvedValue(fixtures.reassigned);
  });

  it('bloqueia operações e reassocia sem substituir os valores locais do formulário', async () => {
    render(
      <MemoryRouter initialEntries={['/protocolo-avaliacao-fisica/adipometria?assessmentId=assessment-1']}>
        <AdipometryScreen />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', {
      name: 'Selecione um novo responsável para retomar este rascunho',
    })).toBeInTheDocument();
    expect(screen.getByLabelText('mutation-state')).toHaveTextContent(
      'Atualize o responsável acima para editar, calcular ou concluir este rascunho.'
    );

    const responsibleSelect = screen.getByLabelText('Novo responsável elegível');
    const updateResponsibleButton = screen.getByRole('button', { name: 'Atualizar responsável' });

    await waitFor(() => {
      expect(responsibleSelect).toHaveValue('');
      expect(updateResponsibleButton).toBeDisabled();
    });

    fireEvent.change(responsibleSelect, {
      target: { value: 'professor-replacement' },
    });
    await waitFor(() => expect(updateResponsibleButton).toBeEnabled());
    fireEvent.click(updateResponsibleButton);

    await waitFor(() => expect(mocks.reassignResponsible).toHaveBeenCalledWith(
      'assessment-1',
      {
        responsibleProfessorId: 'professor-replacement',
        expectedUpdatedAt: '2026-08-05T11:00:00.000Z',
      }
    ));
    expect(mocks.setCurrent).toHaveBeenCalledWith(fixtures.reassigned);
    expect(mocks.setForm).not.toHaveBeenCalled();
    expect(mocks.setPreview).toHaveBeenCalledWith(null);
    expect(mocks.setCapacityWarningConfirmed).toHaveBeenCalledWith(false);
    expect(mocks.setSuccess).toHaveBeenCalledWith(
      'Responsável atualizado. O rascunho pode ser retomado sem perda dos dados locais.'
    );
  });
});