import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProntuarioScreenWithDiscomfortFollowUps } from './ProntuarioScreenWithDiscomfortFollowUps';

vi.mock('./ProntuarioScreen', () => ({
  ProntuarioScreen: () => <div>Fluxo principal do PRNT</div>,
}));

describe('ProntuarioScreenWithDiscomfortFollowUps', () => {
  it('renderiza apenas o fluxo principal do prontuário', () => {
    render(<ProntuarioScreenWithDiscomfortFollowUps />);

    expect(
      screen.getByRole('region', {
        name: 'Prontuário de entrevista e acompanhamento',
      })
    ).toBeInTheDocument();
    expect(screen.getAllByText('Fluxo principal do PRNT')).toHaveLength(1);
    expect(screen.queryByText('Acompanhamento de desconfortos')).not.toBeInTheDocument();
  });
});
