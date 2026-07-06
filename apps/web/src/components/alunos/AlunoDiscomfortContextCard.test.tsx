import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AlunoDiscomfortContextCard } from './AlunoDiscomfortContextCard';
import type { Aluno } from '../../services/aluno.service';

const baseAluno = {
  id: 'aluno-1',
  intakeForm: {
    formResponses: {},
  },
} as unknown as Aluno;

function renderCard(aluno: Aluno) {
  return render(
    <MemoryRouter>
      <AlunoDiscomfortContextCard aluno={aluno} />
    </MemoryRouter>
  );
}

describe('AlunoDiscomfortContextCard', () => {
  it('orienta registro quando nao ha desconforto ativo', () => {
    renderCard(baseAluno);

    expect(screen.getByText('Desconfortos e restrições')).toBeInTheDocument();
    expect(screen.getByText('Sem desconforto ativo')).toBeInTheDocument();
    expect(screen.getByText('Registrar desconforto')).toBeInTheDocument();
    expect(screen.getByText(/Manter acompanhamento/i)).toBeInTheDocument();
  });

  it('destaca desconfortos e orienta acompanhamento contextual', () => {
    renderCard({
      ...baseAluno,
      intakeForm: {
        formResponses: {},
        injuriesHistory: 'Dor no joelho direito em treinos longos',
        medicalHistory: 'Historico de tendinite',
        currentMedications: 'Anti-inflamatorio prescrito',
        observations: 'Evitar subida ate nova avaliacao',
      },
    } as unknown as Aluno);

    expect(screen.getByText('Acompanhamento necessário')).toBeInTheDocument();
    expect(screen.getByText('Registrar acompanhamento')).toBeInTheDocument();
    expect(screen.getByText('Dor no joelho direito em treinos longos')).toBeInTheDocument();
    expect(screen.getByText('Historico de tendinite')).toBeInTheDocument();
    expect(screen.getByText('Anti-inflamatorio prescrito')).toBeInTheDocument();
    expect(screen.getByText('Evitar subida ate nova avaliacao')).toBeInTheDocument();
  });
});
