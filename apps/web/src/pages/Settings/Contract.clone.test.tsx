import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContractSettings from './Contract';

const { mockApiPost, mockGetMe, mockLoadUser } = vi.hoisted(() => ({
  mockApiPost: vi.fn(),
  mockGetMe: vi.fn(),
  mockLoadUser: vi.fn(),
}));

const contract = {
  id: 'contract-target',
  type: 'academy' as const,
  document: '12345678000199',
  name: 'Academia Teste',
  tradeName: 'Teste',
  cref: null,
  addressStreet: null,
  addressNumber: null,
  addressNeighborhood: null,
  addressCity: null,
  addressState: null,
  addressComplement: null,
  addressZipCode: null,
  logoUrl: null,
};

vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: () => ({
    user: {
      id: 'user-master',
      email: 'master@example.com',
      name: 'Master',
      type: 'professor',
      professor: {
        id: 'professor-master',
        role: 'master',
        collaboratorFunction: {
          id: 'function-master',
          name: 'Master',
          code: 'manager',
          isActive: true,
        },
        contract,
      },
    },
    loadUser: mockLoadUser,
  }),
}));

vi.mock('../../services/contract.service', () => ({
  contractService: {
    getMe: mockGetMe,
    updateMe: vi.fn(),
    uploadLogo: vi.fn(),
  },
}));

vi.mock('../../services/api', () => ({
  default: {
    post: mockApiPost,
  },
}));

vi.mock('./components/AdipometryTechnicalResponsibilityCard', () => ({
  AdipometryTechnicalResponsibilityCard: () => null,
}));

describe('ContractSettings clone data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMe.mockResolvedValue(contract);
    mockLoadUser.mockResolvedValue(undefined);
    mockApiPost.mockResolvedValue({
      data: {
        data: {
          parametersCreated: 2,
          parametersSkipped: 1,
          exercisesCreated: 3,
          exercisesSkipped: 4,
          assessmentTypesCreated: 5,
          assessmentTypesSkipped: 6,
        },
      },
    });
  });

  it('dispara a clonagem imediatamente ao clicar no botão e mostra o resultado no próprio card', async () => {
    const user = userEvent.setup();
    render(<ContractSettings />);

    const cloneButton = await screen.findByRole('button', { name: 'Clonar dados' });
    await user.click(cloneButton);

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledTimes(1);
    });
    expect(mockApiPost).toHaveBeenCalledWith('/contracts/clone-data', {
      copyParameters: true,
      copyExercises: true,
      copyAssessmentTypes: true,
    });
    expect(
      await screen.findByText(
        'Parâmetros: +2 (ignorado 1) | Exercícios: +3 (ignorado 4) | Avaliações: +5 (ignorado 6)'
      )
    ).toBeInTheDocument();
  });

  it('mostra a falha da clonagem junto ao botão em vez de exigir que o usuário procure o erro no topo da tela', async () => {
    mockApiPost.mockRejectedValueOnce({
      response: {
        data: {
          error: 'Nenhum contrato de origem com dados clonáveis foi encontrado',
        },
      },
    });

    const user = userEvent.setup();
    render(<ContractSettings />);

    const cloneButton = await screen.findByRole('button', { name: 'Clonar dados' });
    await user.click(cloneButton);

    expect(
      await screen.findByText('Nenhum contrato de origem com dados clonáveis foi encontrado')
    ).toBeInTheDocument();
  });
});
