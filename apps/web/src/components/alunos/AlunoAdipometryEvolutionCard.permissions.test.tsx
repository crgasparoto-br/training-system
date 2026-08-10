import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdipometryAssessmentSummary } from '@corrida/types';
import { adipometryService } from '../../services/adipometry.service';
import type { Assessment } from '../../services/assessment.service';
import { AlunoAdipometryEvolutionCard } from './AlunoAdipometryEvolutionCard';

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
  useAuthStore: (selector: (state: { user: MockUser }) => unknown) => selector({ user: authState.user }),
}));

vi.mock('../../services/adipometry.service', () => ({
  adipometryService: {
    listAssessments: vi.fn(),
    getAssessment: vi.fn(),
    listResponsibleProfessors: vi.fn(),
    compare: vi.fn(),
  },
}));

const listAssessmentsMock = vi.mocked(adipometryService.listAssessments);
const getAssessmentMock = vi.mocked(adipometryService.getAssessment);
const listResponsibleProfessorsMock = vi.mocked(adipometryService.listResponsibleProfessors);

const genericAssessment: Assessment = {
  id: 'upload-generic-1',
  alunoId: 'aluno-1',
  typeId: 'type-bioimpedance',
  assessmentDate: '2026-07-15',
  filePath: '/uploads/bioimpedancia.pdf',
  originalFileName: 'bioimpedancia.pdf',
  mimeType: 'application/pdf',
  fileSize: 1024,
  createdAt: '2026-07-15T12:00:00.000Z',
  updatedAt: '2026-07-15T12:00:00.000Z',
  type: { id: 'type-bioimpedance', name: 'Bioimpedância', code: 'BIO' },
  professional: { user: { profile: { name: 'Prof. João' } } },
};

function renderCard() {
  return render(
    <MemoryRouter>
      <AlunoAdipometryEvolutionCard alunoId="aluno-1" assessments={[genericAssessment]} />
    </MemoryRouter>
  );
}

function userWithoutAdipometryView(): MockUser {
  return {
    type: 'professor',
    accessControl: {
      isMaster: false,
      permissions: [
        { screenKey: 'students.details', blockKey: null, canView: true },
        { screenKey: 'students.details', blockKey: 'students.details.assessments', canView: true },
        { screenKey: 'physicalAssessment.protocol', blockKey: null, canView: true },
        { screenKey: 'physicalAssessment.protocol', blockKey: 'physicalAssessment.adpt.view', canView: false },
      ],
    },
  };
}

describe('AlunoAdipometryEvolutionCard - isolamento do histórico geral', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = {
      type: 'professor',
      accessControl: { isMaster: true, permissions: [] },
    };
    listResponsibleProfessorsMock.mockResolvedValue([]);
    listAssessmentsMock.mockResolvedValue([]);
  });

  it('mantem outras avaliacoes visiveis sem permissao ADPT e nao consulta o dominio', () => {
    authState.user = userWithoutAdipometryView();

    renderCard();

    expect(screen.getByText('Avaliações físicas')).toBeInTheDocument();
    expect(screen.getByText(/Bioimpedância.*BIO/i)).toBeInTheDocument();
    expect(screen.getByText(/Origem: Upload genérico/i)).toBeInTheDocument();
    expect(screen.queryByText('Adipometria e evolução ADPT')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Adipometria estruturada' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nova adipometria' })).not.toBeInTheDocument();
    expect(listAssessmentsMock).not.toHaveBeenCalled();
    expect(getAssessmentMock).not.toHaveBeenCalled();
    expect(listResponsibleProfessorsMock).not.toHaveBeenCalled();
  });

  it('mantem outras avaliacoes visiveis durante carregamento e falha ADPT, com nova tentativa localizada', async () => {
    let rejectAssessments: (reason?: unknown) => void = () => undefined;
    listAssessmentsMock
      .mockImplementationOnce(() => new Promise<AdipometryAssessmentSummary[]>((_, reject) => {
        rejectAssessments = reject;
      }))
      .mockResolvedValueOnce([]);

    renderCard();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Carregando adipometria/i));
    expect(screen.getByText(/Bioimpedância.*BIO/i)).toBeInTheDocument();

    await act(async () => {
      rejectAssessments(new Error('network'));
    });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/demais áreas da Central continuam disponíveis/i));
    expect(screen.getByText(/Bioimpedância.*BIO/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(screen.getByText('Nenhuma adipometria concluída')).toBeInTheDocument());
    expect(screen.getByText(/Bioimpedância.*BIO/i)).toBeInTheDocument();
    expect(listAssessmentsMock).toHaveBeenCalledTimes(2);
  });
});
