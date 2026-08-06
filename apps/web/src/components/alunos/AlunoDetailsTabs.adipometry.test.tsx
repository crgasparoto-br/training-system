import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AlunoDetailsTabs } from './AlunoDetailsTabs';

vi.mock('./AlunoAdipometryEvolutionTabSection', () => ({
  AlunoAdipometryEvolutionTabSection: ({ alunoId }: { alunoId: string }) => (
    <div data-testid="adpt-central-section">ADPT {alunoId}</div>
  ),
}));

function renderTabs(activeTab: 'resumo' | 'avaliacoes-fisicas') {
  return render(
    <MemoryRouter initialEntries={['/alunos/aluno-1']}>
      <Routes>
        <Route
          path="/alunos/:id"
          element={(
            <AlunoDetailsTabs
              activeTab={activeTab}
              onChange={vi.fn()}
              visibleTabs={['resumo', 'avaliacoes-fisicas']}
            />
          )}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('AlunoDetailsTabs ADPT integration', () => {
  it('monta a evolucao ADPT somente na aba Avaliacao Fisica e preserva o aluno da rota', () => {
    renderTabs('avaliacoes-fisicas');

    expect(screen.getByTestId('adpt-central-section')).toHaveTextContent('ADPT aluno-1');
  });

  it('nao duplica a evolucao ADPT no Aluno 360', () => {
    renderTabs('resumo');

    expect(screen.queryByTestId('adpt-central-section')).not.toBeInTheDocument();
  });
});
