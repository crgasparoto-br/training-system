import { fireEvent, render, screen } from '@testing-library/react';
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
  it('delega a montagem da evolucao ADPT para a pagina sem disparar fetch pela navegacao', () => {
    renderTabs('avaliacoes-fisicas');
    fireEvent.click(screen.getByRole('menuitem', { name: /Fluxo técnico/i }));

    expect(screen.getByRole('menuitem', { name: /Avaliação Física/i })).toBeInTheDocument();
    expect(screen.queryByTestId('adpt-central-section')).not.toBeInTheDocument();
  });

  it('nao duplica a evolucao ADPT no Aluno 360', () => {
    renderTabs('resumo');

    expect(screen.queryByTestId('adpt-central-section')).not.toBeInTheDocument();
  });
});
