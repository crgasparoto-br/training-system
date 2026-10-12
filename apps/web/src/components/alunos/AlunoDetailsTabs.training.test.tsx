import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AlunoDetailsTabs, getTabBlockKey } from './AlunoDetailsTabs';

vi.mock('./AlunoAdipometryEvolutionTabSection', () => ({
  AlunoAdipometryEvolutionTabSection: () => null,
}));

describe('Acesso ao treinamento na Central', () => {
  it('vincula a aba de treino à permissão por bloco e permite sua navegação', async () => {
    const onChange = vi.fn();
    expect(getTabBlockKey('treinos')).toBe('students.details.trainingPlans');
    render(
      <MemoryRouter>
        <AlunoDetailsTabs activeTab="resumo" onChange={onChange} visibleTabs={['resumo', 'treinos']} />
      </MemoryRouter>
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /Aluno 360/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Treinos \/ Planos/i }));
    expect(onChange).toHaveBeenCalledWith('treinos');
  });

  it('não exibe a aba caso ela não esteja nas permissões visíveis', async () => {
    render(
      <MemoryRouter>
        <AlunoDetailsTabs activeTab="resumo" onChange={vi.fn()} visibleTabs={['resumo']} />
      </MemoryRouter>
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /Aluno 360/i }));
    expect(screen.queryByRole('menuitem', { name: /Treinos \/ Planos/i })).not.toBeInTheDocument();
  });
});
