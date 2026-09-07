import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContractSettings from './Contract';

const { mockApiPost, mockGetMe, mockLoadUser, mockUser } = vi.hoisted(() => {
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

  return {
    mockApiPost: vi.fn(),
    mockGetMe: vi.fn(),
    mockLoadUser: vi.fn(),
    mockUser: {
      id: 'user-master',
      email: 'master@example.com',
      name: 'Master',
      type: 'professor' as const,
      professor: {
        id: 'professor-master',
        role: 'master' as const,
        collaboratorFunction: {
          id: 'function-master',
          name: 'Master',
          code: 'manager',
          isActive: true,
        },
        contract,
      },
    },
  };
});

const contract = mockUser.professor.contract;
const installData = {
  trainingParameters: {
    installed: 2,
    skipped: 1,
  },
  exercises: {
    installed: 3,
    skipped: 4,
  },
  assessmentTypes: {
    installed: 5,
    skipped: 6,
  },
};
const installResponse = { data: { data: installData } };

vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: () => ({
    user: mockUser,
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

describe('ContractSettings install product defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMe.mockResolvedValue(contract);
    mockLoadUser.mockResolvedValue(undefined);
    mockApiPost.mockResolvedValue(installResponse);
  });

  it('instala os padrões imediatamente ao clicar no botão e mostra o resultado no próprio card', async () => {
    const user = userEvent.setup();
    render(<ContractSettings />);

    const installButton = await screen.findByRole('button', {
      name: 'Instalar padrões do sistema',
    });
    await user.click(installButton);

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledTimes(1);
    });
    expect(mockApiPost).toHaveBeenCalledWith('/contracts/install-defaults');
    expect(
      await screen.findByText(
        'Parâmetros: +2 (já existentes 1) | Exercícios: +3 (já existentes 4) | Avaliações: +5 (já existentes 6)'
      )
    ).toBeInTheDocument();
  });

  it('impede um segundo acionamento enquanto a instalação ainda está pendente', async () => {
    let resolveInstall!: (value: typeof installResponse) => void;
    mockApiPost.mockImplementationOnce(
      () =>
        new Promise<typeof installResponse>((resolve) => {
          resolveInstall = resolve;
        })
    );

    const user = userEvent.setup();
    render(<ContractSettings />);

    const installButton = await screen.findByRole('button', {
      name: 'Instalar padrões do sistema',
    });
    await user.click(installButton);

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledTimes(1);
      expect(installButton).toBeDisabled();
    });

    await user.click(installButton);
    expect(mockApiPost).toHaveBeenCalledTimes(1);

    resolveInstall(installResponse);
    await waitFor(() => {
      expect(installButton).not.toBeDisabled();
    });
  });

  it('mostra a falha da instalação junto ao botão em vez de exigir que o usuário procure o erro no topo da tela', async () => {
    mockApiPost.mockRejectedValueOnce({
      response: {
        data: {
          error: 'Falha ao instalar padrões do sistema',
        },
      },
    });

    const user = userEvent.setup();
    render(<ContractSettings />);

    const installButton = await screen.findByRole('button', {
      name: 'Instalar padrões do sistema',
    });
    await user.click(installButton);

    expect(await screen.findByText('Falha ao instalar padrões do sistema')).toBeInTheDocument();
  });

  it('mostra erro no card quando a API resolve sem os dados da instalação', async () => {
    mockApiPost.mockResolvedValueOnce({ data: {} });

    const user = userEvent.setup();
    render(<ContractSettings />);

    const installButton = await screen.findByRole('button', {
      name: 'Instalar padrões do sistema',
    });
    await user.click(installButton);

    expect(await screen.findByText('Erro ao instalar padrões do sistema')).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Parâmetros: +2 (já existentes 1) | Exercícios: +3 (já existentes 4) | Avaliações: +5 (já existentes 6)'
      )
    ).not.toBeInTheDocument();
  });
});
