import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AlunoAssessmentSummaryCard } from './AlunoAssessmentSummaryCard';
import type { Assessment, AssessmentSummary } from '../../services/assessment.service';
import type { Aluno } from '../../services/aluno.service';

const baseAluno = {
  id: 'aluno-1',
} as unknown as Aluno;

function renderCard(assessments: Assessment[] = [], assessmentSummary: AssessmentSummary[] = []) {
  return render(
    <MemoryRouter>
      <AlunoAssessmentSummaryCard
        aluno={baseAluno}
        assessments={assessments}
        assessmentSummary={assessmentSummary}
      />
    </MemoryRouter>
  );
}

describe('AlunoAssessmentSummaryCard', () => {
  it('orienta iniciar avaliacao quando nao ha historico', () => {
    renderCard();

    expect(screen.getByText('Avaliações')).toBeInTheDocument();
    expect(screen.getByText('Avaliação pendente')).toBeInTheDocument();
    expect(screen.getByText('Iniciar avaliação')).toBeInTheDocument();
    expect(screen.getByText('Não encontrada')).toBeInTheDocument();
    expect(screen.getByText('Sem previsão')).toBeInTheDocument();
  });

  it('mostra ultima avaliacao e proxima reavaliacao', () => {
    renderCard(
      [
        {
          id: 'assessment-1',
          assessmentDate: '2026-03-10T12:00:00.000Z',
          type: { name: 'Antropometria' },
          professional: {
            user: {
              profile: {
                name: 'Prof. Ana',
              },
            },
          },
        } as unknown as Assessment,
      ],
      [
        {
          nextDueDate: '2026-05-10T12:00:00.000Z',
        } as unknown as AssessmentSummary,
      ]
    );

    expect(screen.getByText('Avaliação registrada')).toBeInTheDocument();
    expect(screen.getAllByText('10/03/2026').length).toBeGreaterThan(0);
    expect(screen.getByText(/Antropometria em 10\/03\/2026/i)).toBeInTheDocument();
    expect(screen.getByText(/Prof. Ana/i)).toBeInTheDocument();
    expect(screen.getByText('10/05/2026')).toBeInTheDocument();
    expect(screen.getByText('Abrir histórico de avaliações')).toBeInTheDocument();
  });
});
