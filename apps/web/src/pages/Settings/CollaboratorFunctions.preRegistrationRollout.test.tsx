import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsCollaboratorFunctions from './CollaboratorFunctions';

const listMock = vi.fn();
const updateMock = vi.fn();
const createMock = vi.fn();

vi.mock('../../config/pre-registration-rollout', () => ({
  PRE_REGISTRATION_UI_ENABLED: false,
  isPreRegistrationUiEnabled: vi.fn(() => false),
}));

vi.mock('../../services/collaborator-function.service', () => ({
  collaboratorFunctionService: {
    list: (...args: unknown[]) => listMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    create: (...args: unknown[]) => createMock(...args),
  },
}));

const functionWithPersistedPreRegistrationAccess = {
  id: 'fn-pre-registration',
  contractId: 'c-1',
  name: 'Professor',
  code: 'professor',
  isActive: true,
  isSystem: true,
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
    {
      screenKey: 'students.preRegistration',
      blockKey: 'students.preRegistration.review',
      canView: true,
      dataScope: null,
    },
  ],
};

describe('SettingsCollaboratorFunctions com rollout de pre-matricula desabilitado', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    listMock.mockResolvedValue([functionWithPersistedPreRegistrationAccess]);
    updateMock.mockImplementation(async (_id, payload) => ({
      ...functionWithPersistedPreRegistrationAccess,
      name: payload.name,
      isActive: payload.isActive,
    }));
    createMock.mockResolvedValue(functionWithPersistedPreRegistrationAccess);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('oculta a feature sem revogar permissoes persistidas ao salvar alteracao nao relacionada', async () => {
    const user = userEvent.setup();
    render(<SettingsCollaboratorFunctions />);

    await user.click(await screen.findByRole('button', { name: 'Abrir função: Professor' }));
    await user.click(screen.getByRole('tab', { name: 'Acessos' }));

    expect(document.getElementById('screen-students.preRegistration')).toBeNull();
    expect(screen.queryByText('Leads e pré-matrículas')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Dados gerais' }));
    const nameInput = screen.getByRole('textbox');
    await user.clear(nameInput);
    await user.type(nameInput, 'Professor atualizado');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));

    const [, payload] = updateMock.mock.calls[0] as [
      string,
      {
        permissions: {
          screens: string[];
          blocks: string[];
          dataScopes: Record<string, string>;
        };
      },
    ];

    expect(payload.permissions.screens).toContain('students.preRegistration');
    expect(payload.permissions.blocks).toContain('students.preRegistration.review');
    expect(payload.permissions.dataScopes['students.preRegistration']).toBe('managed');
  });
});
