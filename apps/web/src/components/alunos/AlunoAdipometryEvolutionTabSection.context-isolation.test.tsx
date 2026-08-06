import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AdipometryAssessmentDetail,
  AdipometryAssessmentSummary,
} from '@corrida/types';
import { adipometryService } from '../../services/adipometry.service';
import { alunoService } from '../../services/aluno.service';
import { assessmentService } from '../../services/assessment.service';
import { AlunoAdipometryEvolutionTabSection } from './AlunoAdipometryEvolutionTabSection';

type Permission = { screenKey: string; blockKey: string | null; canView: boolean };
type MockUser = {
  type: 'professor';
  accessControl: { isMaster: boolean; permissions: Permission[] };
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

vi.mock('../../services/adipometry.service', () => ({
  adipometryService: {
    listAssessments: vi.fn(),
    getAssessment: vi.fn(),
    listResponsibleProfessors: vi.fn(),
    compare: vi.fn(),
  },
}));

vi.mock('../../services/aluno.service', () => ({
  alunoService: { getById: vi.fn() },
}));

vi.mock('../../services/assessment.service', () => ({
  assessmentService: { listByAluno: vi.fn() },
}));

vi.mock('./AlunoAnthropometryFlowEntry', () => ({
  AlunoAnthropometryFlowEntry: () => null,
}));

const listAdipometryMock = vi.mocked(adipometryService.listAssessments);
const getAssessmentMock = vi.mocked(adipometryService.getAssessment);
const listResponsibleProfessorsMock = vi.mocked(
  adipometryService.listResponsibleProfessors
);
const getAlunoMock = vi.mocked(alunoService.getById);
const listGeneralAssessmentsMock = vi.mocked(assessmentService.listByAluno);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function completedAssessment(input: {
  id: string;
  alunoId: string;
  code: string;
  assessmentDate: string;
}): AdipometryAssessmentSummary {
  return {
    id: input.id,
    contractId: 'contract-1',
    alunoId: input.alunoId,
    professorId: 'professor-1',
    code: input.code,
    sequenceNumber: 1,
    assessmentDate: input.assessmentDate,
    status: 'COMPLETED',
    revisionStatus: 'FINALIZED',
    rootAssessmentId: input.id,
    revisionNumber: 1,
    protocolCode: 'GUEDES',
    protocolVersion: 1,
    bodyFatPercentage: 18,
    createdAt: `${input.assessmentDate}T12:00:00.000Z`,
    updatedAt: `${input.assessmentDate}T12:00:00.000Z`,
  };
}

function assessmentDetail(
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
      bodyFatPercentage: 18,
      fatMassKg: 12.6,
      leanMassKg: 57.4,
    },
  };
}

describe('AlunoAdipometryEvolutionTabSection context isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = {
      type: 'professor',
      accessControl: { isMaster: true, permissions: [] },
    };
    listResponsibleProfessorsMock.mockResolvedValue([]);
    listGeneralAssessmentsMock.mockResolvedValue([]);
    getAlunoMock.mockImplementation(async (alunoId) => ({ id: alunoId }) as never);
  });

  it('ignora a resposta ADPT atrasada do aluno anterior depois da troca de contexto', async () => {
    const alunoA = completedAssessment({
      id: 'assessment-a',
      alunoId: 'aluno-a',
      code: 'ADPT-A',
      assessmentDate: '2026-07-01',
    });
    const alunoB = completedAssessment({
      id: 'assessment-b',
      alunoId: 'aluno-b',
      code: 'ADPT-B',
      assessmentDate: '2026-08-01',
    });
    const alunoAResponse = deferred<AdipometryAssessmentSummary[]>();
    const alunoBResponse = deferred<AdipometryAssessmentSummary[]>();

    listAdipometryMock.mockImplementation((alunoId) => {
      if (alunoId === 'aluno-a') return alunoAResponse.promise;
      if (alunoId === 'aluno-b') return alunoBResponse.promise;
      return Promise.resolve([]);
    });
    getAssessmentMock.mockImplementation(async (assessmentId) => {
      if (assessmentId === alunoA.id) return assessmentDetail(alunoA);
      if (assessmentId === alunoB.id) return assessmentDetail(alunoB);
      throw new Error(`Avaliação inesperada: ${assessmentId}`);
    });

    const view = render(
      <MemoryRouter>
        <AlunoAdipometryEvolutionTabSection alunoId="aluno-a" />
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(listAdipometryMock).toHaveBeenCalledWith('aluno-a')
    );

    view.rerender(
      <MemoryRouter>
        <AlunoAdipometryEvolutionTabSection alunoId="aluno-b" />
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(listAdipometryMock).toHaveBeenCalledWith('aluno-b')
    );

    await act(async () => {
      alunoBResponse.resolve([alunoB]);
      await alunoBResponse.promise;
    });

    await waitFor(() =>
      expect(screen.getAllByText(/ADPT-B/).length).toBeGreaterThan(0)
    );
    expect(screen.getByRole('link', { name: 'Abrir detalhe' })).toHaveAttribute(
      'href',
      '/protocolo-avaliacao-fisica/adipometria?alunoId=aluno-b&assessmentId=assessment-b'
    );

    await act(async () => {
      alunoAResponse.resolve([alunoA]);
      await alunoAResponse.promise;
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(getAssessmentMock).toHaveBeenCalledWith('assessment-a')
    );
    expect(screen.queryAllByText(/ADPT-A/)).toHaveLength(0);
    expect(screen.getAllByText(/ADPT-B/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Abrir detalhe' })).toHaveAttribute(
      'href',
      '/protocolo-avaliacao-fisica/adipometria?alunoId=aluno-b&assessmentId=assessment-b'
    );
  });
});
