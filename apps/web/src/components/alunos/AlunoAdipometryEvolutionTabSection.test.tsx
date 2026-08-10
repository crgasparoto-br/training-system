import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alunoService, type Aluno } from '../../services/aluno.service';
import { assessmentService, type Assessment } from '../../services/assessment.service';
import { AlunoAdipometryEvolutionTabSection } from './AlunoAdipometryEvolutionTabSection';

vi.mock('../../services/aluno.service', () => ({
  alunoService: { getById: vi.fn() },
}));

vi.mock('../../services/assessment.service', () => ({
  assessmentService: { listByAluno: vi.fn() },
}));

vi.mock('./AlunoAdipometryEvolutionCard', () => ({
  AlunoAdipometryEvolutionCard: ({ alunoId }: { alunoId: string }) => (
    <div data-testid="adpt-card">ADPT {alunoId}</div>
  ),
}));

const getAlunoMock = vi.mocked(alunoService.getById);
const listAssessmentsMock = vi.mocked(assessmentService.listByAluno);

const aluno: Aluno = {
  id: 'aluno-1',
  userId: 'student-user-1',
  professorId: 'professor-1',
  schedulePlan: 'fixed',
  age: 30,
  user: {
    email: 'aluno@example.com',
    profile: { name: 'Aluno da Central' },
  },
  professor: {
    id: 'professor-1',
    user: { profile: { name: 'Professora Responsável' } },
  },
  createdAt: '2026-01-01T12:00:00.000Z',
  updatedAt: '2026-08-05T12:00:00.000Z',
};

function renderSection() {
  return render(
    <MemoryRouter>
      <AlunoAdipometryEvolutionTabSection alunoId="aluno-1" />
    </MemoryRouter>
  );
}

describe('AlunoAdipometryEvolutionTabSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAlunoMock.mockResolvedValue(aluno);
    listAssessmentsMock.mockResolvedValue([]);
  });

  it('mantem as acoes dedicadas de Antropometria e Adipometria no mesmo contexto', async () => {
    renderSection();

    await waitFor(() => expect(screen.getByRole('link', { name: 'Iniciar antropometria' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Iniciar antropometria' })).toHaveAttribute(
      'href',
      '/central-do-aluno/aluno-1/avaliacoes/nova-antropometria'
    );
    expect(screen.getByTestId('adpt-card')).toHaveTextContent('ADPT aluno-1');
  });

  it('oferece registrar nova antropometria quando ja existe historico desse tipo', async () => {
    const anthropometryAssessment = {
      id: 'assessment-1',
      alunoId: 'aluno-1',
      typeId: 'anthropometry-type',
      assessmentDate: '2026-07-10',
      createdAt: '2026-07-10T12:00:00.000Z',
      updatedAt: '2026-07-10T12:00:00.000Z',
      type: {
        id: 'anthropometry-type',
        name: 'Avaliação Antropométrica',
        code: 'ANTR',
      },
      professional: {
        user: { profile: { name: 'Professora Responsável' } },
      },
    } as Assessment;
    listAssessmentsMock.mockResolvedValue([anthropometryAssessment]);

    renderSection();

    await waitFor(() => expect(screen.getByRole('link', { name: 'Registrar nova antropometria' })).toBeInTheDocument());
    expect(screen.getByText(/Última antropometria em/i)).toBeInTheDocument();
  });

  it('preserva o card ADPT quando o cadastro do aluno falha isoladamente', async () => {
    getAlunoMock.mockRejectedValue(new Error('network'));

    renderSection();

    await waitFor(() => expect(screen.getByTestId('adpt-card')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /antropometria/i })).not.toBeInTheDocument();
  });
});
