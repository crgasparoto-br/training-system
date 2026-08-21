import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsCollaboratorFunctions from './CollaboratorFunctions';

const listMock = vi.fn();
const updateMock = vi.fn();
const createMock = vi.fn();

vi.mock('../../services/collaborator-function.service', () => ({
  collaboratorFunctionService: {
    list: (...args: unknown[]) => listMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    create: (...args: unknown[]) => createMock(...args),
  },
}));

const preRegistrationFunction = {
  id: 'fn-pre-registration-enabled',
  contractId: 'c-1',
  name: 'Comercial',
  code: 'administrative',
  isActive: true,
  isSystem: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  accessPermissions: [
    { screenKey: 'students.registration', blockKey: null, canView: true, dataScope: null },
    {
      screenKey: 'students.preRegistration',
      blockKey: null,
      canView: true,
      dataScope: 'managed',
    },
    ...[
      'students.preRegistration.create',
      'students.preRegistration.editCommercial',
      'students.preRegistration.generateInvite',
      'students.preRegistration.revokeInvite',
      'students.preRegistration.review',
      'students.preRegistration.discardReopen',
      'students.preRegistration.convert',
    ].map((blockKey) => ({
      screenKey: 'students.preRegistration',
      blockKey,
      canView: true,
      dataScope: null,
    })),
  ],
};

describe('SettingsCollaboratorFunctions com pre-matricula habilitada', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    listMock.mockResolvedValue([preRegistrationFunction]);
    updateMock.mockResolvedValue(preRegistrationFunction);
    createMock.mockResolvedValue(preRegistrationFunction);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('exibe, busca e detalha leads e pre-matriculas no grupo de Alunos', async () => {
    const user = userEvent.setup();
    render(<SettingsCollaboratorFunctions />);

    await user.click(await screen.findByRole('button', { name: 'Abrir função: Comercial' }));
    await user.click(screen.getByRole('tab', { name: 'Acessos' }));

    expect(await screen.findByText('Leads e pré-matrículas')).toBeInTheDocument();
    const preRegistrationCheckbox = document.getElementById('screen-students.preRegistration');
    expect(preRegistrationCheckbox).not.toBeNull();
    const permissionGroup = preRegistrationCheckbox?.closest('article');
    expect(permissionGroup).toHaveTextContent('Alunos');
    expect(permissionGroup).not.toHaveTextContent('Permissões internas');

    const searchInput = screen.getByPlaceholderText('Buscar tela ou aba...');
    await user.type(searchInput, 'Revisar pré-matrícula');
    expect(await screen.findByText('Leads e pré-matrículas')).toBeInTheDocument();

    await user.clear(searchInput);
    await user.type(searchInput, 'lead');
    expect(await screen.findByText('Leads e pré-matrículas')).toBeInTheDocument();

    await user.clear(searchInput);
    await user.click(screen.getByRole('button', { name: /Leads e pré-matrículas/ }));

    expect(screen.getByText('Ação: Criar lead')).toBeInTheDocument();
    expect(screen.getByText('Ação: Editar dados comerciais do lead')).toBeInTheDocument();
    expect(screen.getByText('Ação: Gerar ou substituir convite')).toBeInTheDocument();
    expect(screen.getByText('Ação: Revogar convite')).toBeInTheDocument();
    expect(screen.getByText('Ação: Revisar pré-matrícula')).toBeInTheDocument();
    expect(screen.getByText('Ação: Descartar ou reabrir lead')).toBeInTheDocument();
    expect(screen.getByText('Ação: Converter em aluno ativo')).toBeInTheDocument();

    const scopeSelect = document.getElementById('scope-students.preRegistration') as HTMLSelectElement;
    expect(scopeSelect).not.toBeNull();
    expect(scopeSelect.value).toBe('managed');
  });
});
