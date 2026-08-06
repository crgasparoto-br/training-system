import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AdipometryAssessmentDetail,
  AdipometryAssessmentSummary,
  AdipometryComparison,
} from '@corrida/types';
import { AlunoAdipometryEvolutionCard } from './AlunoAdipometryEvolutionCard';

type MockUser = {
  type: 'professor';
  accessControl: { isMaster: boolean; permissions: [] };
};

const authState = vi.hoisted(() => ({
  user: {
    type: 'professor',
    accessControl: { isMaster: true, permissions: [] },
  } as MockUser,
}));

vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: { user: MockUser }) => unknown) =>
    selector({ user: authState.user }),
}));

const adipometryServiceMock = vi.hoisted(() => ({
  listAssessments: vi.fn(),
  getAssessment: vi.fn(),
  listResponsibleProfessors: vi.fn(),
  compare: vi.fn(),
}));

vi.mock('../../services/adipometry.service', () => ({
  adipometryService: adipometryServiceMock,
}));

const listAssessmentsMock = adipometryServiceMock.listAssessments;
const getAssessmentMock = adipometryServiceMock.getAssessment;
const listResponsibleProfessorsMock = adipometryServiceMock.listResponsibleProfessors;
const compareMock = adipometryServiceMock.compare;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function completed(
  overrides: Partial<AdipometryAssessmentSummary> = {}
): AdipometryAssessmentSummary {
  return {
    id: 'adpt-2',
    contractId: 'contract-1',
    alunoId: 'aluno-1',
    professorId: 'professor-1',
    code: 'ADPT-002',
    sequenceNumber: 2,
    assessmentDate: '2026-07-10',
    status: 'COMPLETED',
    revisionStatus: 'FINALIZED',
    rootAssessmentId: 'adpt-2',
    revisionNumber: 1,
    protocolCode: 'GUEDES',
    protocolVersion: 2,
    bodyFatPercentage: 18.4,
    createdAt: '2026-07-10T12:00:00.000Z',
    updatedAt: '2026-07-10T12:00:00.000Z',
    ...overrides,
  };
}

function detail(
  summary: AdipometryAssessmentSummary
): AdipometryAssessmentDetail {
  return {
    ...summary,
    measurements: {
      weightKg: 70,
      tricepsMm: 10,
      subscapularMm: 11,
      suprailiacMm: 12,
      abdominalMm: 13,
      thighMm: 14,
    },
    results: {
      skinfoldTotalMm: 60,
      bodyFatPercentage: 18.4,
      fatMassKg: 12.88,
      leanMassKg: 57.12,
    },
  };
}

function comparison(
  previous: AdipometryAssessmentSummary,
  current: AdipometryAssessmentSummary
): AdipmetryComparison {
  return {
    previous: {
      assessment: previous,
      measurements: detail(previous).measurements,
      results: detail(previous).results!,
    },
    current: {
      assessment: current,
      measurements: detail(current).measurements,
      results: detail(current).results!,
    },
    deltas: { weightKg: 0, bodyFatPercentage: 0 },
  };
}

function renderCard() {
  return render(
    <MemoryRouter>
      <AlunoAdipometryEvolutionCard alunoId="aluno-1" assessments={[]} />
    </MemoryRouter>
  );
}

describe('AlunoAdipometryEvolutionCard async regressions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authState.user = {
      type: 'professor',
      accessControl: { isMaster: true, permissions: [] },
    };
    listResponsibleProfessorsMock.mockResolvedValue([
      { id: 'professor-1', name: 'Profa. Maria' },
    ]);
  });

  it('mantem a carga mais recente quando respostas do mesmo aluno chegam fora de ordem', async () => {
    const older = completed({
      id: 'adpt-old',
      code: 'ADPT-OLD',
      sequenceNumber: 1,
      assessmentDate: '2026-06-01',
      createdAt: '2026-06-01T12:00:00.000Z',
      updatedAt: '2026-06-01T12:00:00.000Z',
    });
    const newer = completed({
      id: 'adpt-new',
      code: 'ADPT-NEW',
      sequenceNumber: 2,
      assessmentDate: '2026-08-01',
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-01T12:00:00.000Z',
    });
    const firstResponse = deferred<AdipometryAssessmentSummary[]>();
    const secondResponse = deferred<AdipometryAssessmentSummary[]>();

    listAssessmentsMock
      .mockImplementationOnce(() => firstResponse.promise)
      .mockImplementationOnce(() => secondResponse.promise);
    getAssessmentMock.mockImplementation(async (assessmentId) => {
      if (assessmentId === newer.id) return detail(newer);
      if (assessmentId === older.id) return detail(older);
      throw new Error(`Avaliação inesperada: ${assessmentId}`);
    });

    renderCard();

    await waitFor(() => expect(listAssessmentsMock).toHaveBeenCalledTimes(1));
    fireEvent.focus(window);
    await waitFor(() => expect(listAssessmentsMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      secondResponse.resolve([newer]);
      await secondResponse.promise;
    });

    await waitFor(() =>
      expect(screen.getAllByText(/ADPT-NEW/).length).toBeGreaterThan(0)
    );

    await act(async () => {
      firstResponse.resolve([older]);
      await firstResponse.promise;
      await Promise.resolve();
    });

    expect(screen.queryAllByText(/ADPT-OLD/)).toHaveLength(0);
    expect(screen.getAllByText(/ADPT-NEW/).length).toBeGreaterThan(0);
    expect(getAssessmentMock).not.toHaveBeenCalledWith(older.id);
  });

  it('descarta comparacao pendente quando a selecao muda', async () => {
    const older = completed({
      id: 'adpt-1',
      code: 'ADPT-001',
      sequenceNumber: 1,
      assessmentDate: '2026-06-10',
      createdAt: '2026-06-10T12:00:00.000Z',
      updatedAt: '2026-06-10T12:00:00.000Z',
    });
    const newer = completed();
    const comparisonResponse = deferred<AdipometryComparison>();

    listAssessmentsMock.mockResolvedValue([newer, older]);
    getAssessmentMock.mockResolvedValue(detail(newer));
    compareMock.mockReturnValue(comparisonResponse.promise);

    renderCard();

    await waitFor(() => expect(screen.getByLabelText(/ADPT-002/i)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/ADPT-002/i));
    fireEvent.click(screen.getByLabelText(/ADPT-001/i));
    fireEvent.click(screen.getByRole('button', { name: 'Comparar avaliações selecionadas' }));

    await waitFor(() => expect(compareMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByLabelText(/ADPT-001/i));

    await act(async () => {
      comparisonResponse.resolve(comparison(older, newer));
      await comparisonResponse.promise;
      await Promise.resolve();
    });

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Comparar avaliações selecionadas' })
    ).toBeDisabled();
  });

  it('identifica explicitamente a revisao corrigida vigente no resumo e historico', async () => {
    const corrected = completed({
      id: 'adpt-corrected',
      code: 'ADPT-002R2',
      rootAssessmentId: 'adpt-root-2',
      revisionNumber: 2,
    });
    listAssessmentsMock.mockResolvedValue([corrected]);
    getAssessmentMock.mockResolvedValue(detail(corrected));

    renderCard();

    await waitFor(() =>
      expect(
        screen.getByText('Avaliação corrigida — revisão 2 vigente')
      ).toBeInTheDocument()
    );
    const historyItem = screen.getByText(/Adipometria.*ADPT-002R2/i).closest('article');
    expect(historyItem).toHaveTextContent('Avaliação corrigida — revisão 2 vigente');
  });
});
