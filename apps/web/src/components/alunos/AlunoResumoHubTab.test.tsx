import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AlunoResumoHubTab } from './AlunoResumoHubTab';
import type { Aluno } from '../../services/aluno.service';

const baseAluno = {
  id: 'aluno-1',
  age: 35,
  updatedAt: '2026-01-10T12:00:00.000Z',
  user: {
    email: 'aluno@test.com',
    profile: {
      name: 'Aluno Teste',
      phone: '(15) 99999-0000',
    },
  },
  service: null,
  intakeForm: {
    assessmentDate: null,
    mainGoal: null,
    parqResponses: {},
  },
} as unknown as Aluno;

function renderResumo(aluno: Aluno) {
  return render(
    <MemoryRouter>
      <AlunoResumoHubTab
        aluno={aluno}
        assessments={[]}
        assessmentSummary={[]}
        plans={[]}
        activeStudentContract={null}
        segmentedSummary={null}
      />
    </MemoryRouter>
  );
}

describe('AlunoResumoHubTab PRNT card', () => {
  it('mostra PRNT pendente quando nao ha anamnese nem objetivo', () => {
    renderResumo(baseAluno);

    expect(screen.getAllByText('PRNT pendente').length).toBeGreaterThan(0);
    expect(screen.getByText(/Completar anamnese e objetivo principal/i)).toBeInTheDocument();
    expect(screen.getByText('Iniciar PRNT')).toBeInTheDocument();
  });

  it('destaca alerta tecnico quando PAR-Q possui respostas positivas', () => {
    renderResumo({
      ...baseAluno,
      intakeForm: {
        assessmentDate: '2026-02-01T12:00:00.000Z',
        mainGoal: 'Correr 10 km sem dor',
        parqResponses: {
          chestPain: true,
          dizziness: false,
        },
      },
    } as unknown as Aluno);

    expect(screen.getByText('PRNT parcial')).toBeInTheDocument();
    expect(screen.getAllByText(/1 alerta\(s\)/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Atualizar PRNT')).toBeInTheDocument();
  });
});
