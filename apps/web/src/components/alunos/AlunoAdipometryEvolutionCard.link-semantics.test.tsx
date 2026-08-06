import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdipometryAssessmentDetail, AdipometryAssessmentSummary } from '@corrida/types';
import { adipometryService } from '../../services/adipometry.service';
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

function completed(
  overrides: Partial<AdipometryAssessmentSummary> = {}
): AdipometryAssessmentSummary {
  return {
    id: 'adpt-completed',
    contractId: 'contract-1',
    alunoId: 'aluno-1',
    professorId: 'professor-1',
    code: 'ADPT-002',
    sequenceNumber: 2,
    assessmentDate: '2026-08-01',
    status: 'COMPLETED',
    revisionStatus: 'FINALIZED',
    rootAssessmentId: 'adpt-completed',
    revisionNumber: 1,
    protocolCode: 'GUEDES',
    protocolVersion: 2,
    bodyFatPercentage: 18.4,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

function detail(summary: AdipometryAssessmentSummary): AdipometryAssessmentDetail {
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

describe('AlunoAdipometryEvolutionCard - semântica dos links de ação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = {
      type: 'professor',
      accessControl: { isMaster: true, permissions: [] },
    };

    const latest = completed();
    const draft = completed({
      id: 'adpt-draft',
      code: 'ADPT-003',
      sequenceNumber: 3,
      status: 'DRAFT',
      revisionStatus: 'DRAFT',
      rootAssessmentId: 'adpt-draft',
      protocolCode: undefined,
      protocolVersion: undefined,
      createdAt: '2026-08-05T12:00:00.000Z',
      updatedAt: '2026-08-05T12:00:00.000Z',
    });

    listAssessmentsMock.mockResolvedValue([draft, latest]);
    getAssessmentMock.mockResolvedValue(detail(latest));
    listResponsibleProfessorsMock.mockResolvedValue([
      { id: 'professor-1', name: 'Profa. Maria' },
    ]);
  });

  it('renderiza cada navegação como um único link estilizado, sem botão aninhado', async () => {
    render(
      <MemoryRouter>
        <AlunoAdipometryEvolutionCard alunoId="aluno-1" assessments={[]} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Última adipometria concluída')).toBeInTheDocument();
    });

    const links = [
      screen.getByRole('link', { name: 'Nova adipometria' }),
      screen.getByRole('link', { name: 'Abrir detalhe' }),
      screen.getByRole('link', { name: 'Retomar rascunho' }),
      screen.getByRole('link', { name: 'Abrir avaliação' }),
    ];

    for (const link of links) {
      expect(link.tagName).toBe('A');
      expect(link.querySelector('button')).toBeNull();
      expect(link).toHaveClass('inline-flex');
      expect(link).toHaveClass('focus-visible:ring-2');
    }
  });
});
