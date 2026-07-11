import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AlunoSaudeAnamneseTab } from './AlunoSaudeAnamneseTab';
import type { Aluno } from '../../services/aluno.service';

const baseAluno = {
  id: 'aluno-1',
  updatedAt: '2026-01-10T12:00:00.000Z',
  intakeForm: {
    assessmentDate: null,
    mainGoal: null,
    parqResponses: {},
    formResponses: {},
  },
} as unknown as Aluno;

function renderTab(aluno: Aluno, parqPositiveCount = 0) {
  return render(
    <MemoryRouter>
      <AlunoSaudeAnamneseTab
        aluno={aluno}
        parqPositiveCount={parqPositiveCount}
        segmentedIntake={null}
      />
    </MemoryRouter>
  );
}

describe('AlunoSaudeAnamneseTab objetivo contextual', () => {
  it('orienta criacao quando o aluno ainda nao possui objetivo principal', () => {
    renderTab(baseAluno);

    expect(screen.getByText('Objetivo do aluno')).toBeInTheDocument();
    expect(screen.getAllByText('Objetivo pendente').length).toBeGreaterThan(0);
    expect(screen.getByText(/Crie o objetivo principal/i)).toBeInTheDocument();
    expect(screen.getByText('Criar objetivo')).toBeInTheDocument();
  });

  it('mostra objetivo ativo e acao de observacao quando objetivo existe', () => {
    renderTab({
      ...baseAluno,
      intakeForm: {
        assessmentDate: '2026-02-01T12:00:00.000Z',
        mainGoal: 'Correr 10 km sem dor',
        parqResponses: {},
        formResponses: {},
      },
    } as unknown as Aluno);

    expect(screen.getAllByText('Objetivo ativo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Correr 10 km sem dor').length).toBeGreaterThan(0);
    expect(screen.getByText('Atualizar objetivo')).toBeInTheDocument();
    expect(screen.getByText('Registrar observação')).toBeInTheDocument();
  });

  it('destaca pontos tecnicos antes de alterar objetivo', () => {
    renderTab({
      ...baseAluno,
      intakeForm: {
        assessmentDate: '2026-02-01T12:00:00.000Z',
        mainGoal: 'Voltar a correr com seguranca',
        medicalHistory: 'Hipertensao controlada',
        parqResponses: {},
        formResponses: {},
      },
    } as unknown as Aluno, 1);

    expect(screen.getByText('Atenções técnicas')).toBeInTheDocument();
    expect(screen.getByText('2 ponto(s)')).toBeInTheDocument();
    expect(screen.getByText(/Antes de alterar o objetivo/i)).toBeInTheDocument();
  });
});
