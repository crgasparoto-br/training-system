import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PhysicalAssessmentProtocol from './PhysicalAssessmentProtocol';

const mocks = vi.hoisted(() => ({
  canAccessBlock: vi.fn(),
}));

vi.mock('../access/access-control', () => ({
  canAccessBlock: mocks.canAccessBlock,
}));

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: { user: object }) => unknown) => selector({ user: {} }),
}));

vi.mock('./PhysicalAssessment/CapacityPrescriptionScreen', () => ({
  CapacityPrescriptionScreen: () => <div>Área de prescrição carregada</div>,
}));

vi.mock('./PhysicalAssessment/AnthropometryScreen', () => ({
  AnthropometryScreen: () => <div>Antropometria</div>,
}));

vi.mock('./PhysicalAssessment/ProntuarioScreenWithDiscomfortFollowUps', () => ({
  ProntuarioScreenWithDiscomfortFollowUps: () => <div>Prontuário</div>,
}));

describe('PhysicalAssessmentProtocol - permissão de fontes de avaliação', () => {
  beforeEach(() => {
    mocks.canAccessBlock.mockReset();
  });

  function renderPrescriptionRoute() {
    return render(
      <MemoryRouter initialEntries={['/protocolo-avaliacao-fisica/prescricao-capacidades']}>
        <PhysicalAssessmentProtocol />
      </MemoryRouter>
    );
  }

  it('expõe estado explícito quando o perfil não pode consultar avaliações', () => {
    mocks.canAccessBlock.mockReturnValue(false);

    renderPrescriptionRoute();

    expect(screen.getByRole('status')).toHaveTextContent(
      'não possui permissão para consultar avaliações físicas'
    );
    expect(screen.getByText('Área de prescrição carregada')).toBeInTheDocument();
  });

  it('não mostra alerta quando a permissão de avaliações está disponível', () => {
    mocks.canAccessBlock.mockReturnValue(true);

    renderPrescriptionRoute();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Área de prescrição carregada')).toBeInTheDocument();
  });
});
