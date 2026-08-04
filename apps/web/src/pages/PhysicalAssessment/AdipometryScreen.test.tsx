import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setCapacityWarningConfirmed: vi.fn(),
  setMeasurement: vi.fn(),
  setSelectedAlunoId: vi.fn(),
  setError: vi.fn(),
  listResponsibleProfessors: vi.fn(),
}));

vi.mock('../../access/access-control', () => ({
  canAccessBlock: () => true,
}));

vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: {
      id: 'user-1',
      name: 'Ator autenticado',
      professor: { id: 'professor-1' },
    },
  }),
}));

vi.mock('../../services/adipometry.service', () => ({
  adipometryService: {
    listResponsibleProfessors: mocks.listResponsibleProfessors,
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
    alunos: [],
    selectedAlunoId: 'aluno-1',
    setSelectedAlunoId: mocks.setSelectedAlunoId,
    assessments: [],
    current: null,
    setCurrent: vi.fn(),
    protocols: [],
    support: null,
    form: {
      assessmentDate: '2026-08-04',
      protocolKey: '',
      protocolSex: '',
      protocolSexSource: '',
      protocolSexOverrideReason: '',
      anthropometryAssessmentId: '',
      notes: '',
      measurements: {
        weightKg: '',
        tricepsMm: '',
        subscapularMm: '',
        suprailiacMm: '',
        abdominalMm: '',
        thighMm: '',
      },
    },
    setForm: vi.fn(),
    preview: null,
    setPreview: vi.fn(),
    fieldErrors: {},
    setFieldErrors: vi.fn(),
    loading: false,
    setLoading: vi.fn(),
    dirty: false,
    setDirty: vi.fn(),
    conflict: false,
    setConflict: vi.fn(),
    error: null,
    setError: mocks.setError,
    success: null,
    setSuccess: vi.fn(),
    supportError: null,
    setRefreshToken: vi.fn(),
    capacityWarningConfirmed: true,
    setCapacityWarningConfirmed: mocks.setCapacityWarningConfirmed,
    resetMessages: vi.fn(),
    setFormField: vi.fn(),
    setMeasurement: mocks.setMeasurement,
  }),
}));

vi.mock('./AdipometryView', () => ({
  AdipometryView: (props: {
    onMeasurement: (field: 'tricepsMm', value: string) => void;
    onAluno: (id: string) => void;
  }) => (
    <>
      <button type="button" onClick={() => props.onMeasurement('tricepsMm', '15')}>Editar dobra</button>
      <button type="button" onClick={() => props.onAluno('aluno-2')}>Selecionar aluno</button>
    </>
  ),
}));

vi.mock('./AdipometryScreenOverlays', () => ({
  AdipometryScreenOverlays: () => null,
}));

import { AdipometryScreen } from './AdipometryScreen';

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

describe('AdipometryScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listResponsibleProfessors.mockResolvedValue([
      { id: 'professor-1', name: 'Prof. Ativo' },
    ]);
  });

  it('remove a confirmação clínica antes de aplicar nova medida', async () => {
    render(
      <MemoryRouter initialEntries={['/protocolo-avaliacao-fisica/adipometria']}>
        <AdipometryScreen />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Editar dobra' }));

    expect(mocks.setCapacityWarningConfirmed).toHaveBeenCalledWith(false);
    expect(mocks.setMeasurement).toHaveBeenCalledWith('tricepsMm', '15');
    expect(mocks.setCapacityWarningConfirmed.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.setMeasurement.mock.invocationCallOrder[0]);
    await waitFor(() => expect(mocks.listResponsibleProfessors).toHaveBeenCalledTimes(1));
  });

  it('na abertura direta não transforma a seleção em origem pela Central', () => {
    render(
      <MemoryRouter initialEntries={['/protocolo-avaliacao-fisica/adipometria']}>
        <AdipometryScreen />
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Selecionar aluno' }));

    expect(mocks.setSelectedAlunoId).toHaveBeenCalledWith('aluno-2');
    expect(screen.getByLabelText('location')).toHaveTextContent(
      '/protocolo-avaliacao-fisica/adipometria'
    );
    expect(screen.getByLabelText('location')).not.toHaveTextContent('alunoId=');
  });
});
