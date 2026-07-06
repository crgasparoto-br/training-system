import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AlunoAnthropometryFlowEntry } from './AlunoAnthropometryFlowEntry';
import type { Assessment } from '../../services/assessment.service';
import type { Aluno } from '../../services/aluno.service';

const baseAluno = {
  id: 'aluno-1',
  user: {
    profile: {
      name: 'Maria Atleta',
    },
  },
} as unknown as Aluno;

function renderEntry(assessments: Assessment[] = []) {
  return render(
    <MemoryRouter>
      <AlunoAnthropometryFlowEntry aluno={baseAluno} assessments={assessments} />
    </MemoryRouter>
  );
}

describe('AlunoAnthropometryFlowEntry', () => {
  it('orienta primeira antropometria quando nao ha historico', () => {
    renderEntry();

    expect(screen.getByText('Nova antropometria')).toBeInTheDocument();
    expect(screen.getByText('Fluxo guiado inicial')).toBeInTheDocument();
    expect(screen.getByText('Iniciar antropometria')).toBeInTheDocument();
    expect(screen.getByText(/primeira linha de base/i)).toBeInTheDocument();
    expect(screen.getByText(/Maria Atleta/i)).toBeInTheDocument();
  });

  it('usa ultima antropometria como contexto de comparacao', () => {
    renderEntry([
      {
        assessmentDate: '2026-04-15T12:00:00.000Z',
        type: { name: 'Antropometria' },
        professional: {
          user: {
            profile: {
              name: 'Prof. Bruno',
            },
          },
        },
      } as unknown as Assessment,
    ]);

    expect(screen.getByText('Fluxo guiado com histórico')).toBeInTheDocument();
    expect(screen.getByText(/15\/04\/2026/i)).toBeInTheDocument();
    expect(screen.getByText(/Prof. Bruno/i)).toBeInTheDocument();
    expect(screen.getByText('Registrar nova antropometria')).toBeInTheDocument();
    expect(screen.getByText(/Comparar com a última antropometria/i)).toBeInTheDocument();
  });
});
