import { render, screen, waitFor } from '@testing-library/react';
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

const baseFunction = {
  id: 'fn-1',
  contractId: 'c-1',
  name: 'Professor',
  code: 'professor',
  isActive: true,
  isSystem: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  accessPermissions: [
    { screenKey: 'students.registration', blockKey: null, canView: true, dataScope: null },
    { screenKey: 'students.consultation', blockKey: null, canView: true, dataScope: null },
    { screenKey: 'students.details', blockKey: null, canView: true, dataScope: null },
    { screenKey: 'students.details', blockKey: 'students.details.summary', canView: true, dataScope: null },
    { screenKey: 'students.details', blockKey: 'students.details.assessments', canView: true, dataScope: null },
  ],
};

describe('SettingsCollaboratorFunctions', () => {
  beforeEach(() => {
    listMock.mockResolvedValue([
      baseFunction,
      {
        ...baseFunction,
        id: 'fn-2',
        name: 'Recepcao',
        code: 'administrative',
        isSystem: false,
      },
    ]);
    updateMock.mockResolvedValue(baseFunction);
    createMock.mockResolvedValue(baseFunction);
  });

  it('lista funcoes carregadas', async () => {
    render(<SettingsCollaboratorFunctions />);

    expect(await screen.findByText('Professor')).toBeInTheDocument();
    expect(screen.getByText('Recepcao')).toBeInTheDocument();
  });

  it('mostra permissoes agrupadas e busca por permissao funciona', async () => {
    const user = userEvent.setup();
    render(<SettingsCollaboratorFunctions />);

    await user.click((await screen.findAllByText('Professor'))[0]);

    expect((await screen.findAllByText(/alunos/i)).length).toBeGreaterThan(0);

    const searchInput = screen.getByPlaceholderText('Buscar tela ou aba...');
    await user.type(searchInput, 'termo inexistente');
    expect(screen.getByText('Nenhuma permissão encontrada.')).toBeInTheDocument();

    await user.clear(searchInput);
    await user.type(searchInput, 'Central do Aluno');
    expect(await screen.findByText('Central do Aluno')).toBeInTheDocument();
  });

  it('marcar e desmarcar grupo funciona', async () => {
    const user = userEvent.setup();
    render(<SettingsCollaboratorFunctions />);

    await user.click((await screen.findAllByText('Professor'))[0]);

    const detailsCheckbox = document.getElementById('screen-students.details') as HTMLInputElement;
    expect(detailsCheckbox.checked).toBe(true);

    await user.click(screen.getAllByText('Bloquear grupo')[0]);
    expect((document.getElementById('screen-students.details') as HTMLInputElement).checked).toBe(false);

    await user.click(screen.getAllByText('Liberar grupo')[0]);
    expect((document.getElementById('screen-students.details') as HTMLInputElement).checked).toBe(true);
  });

  it('salvar envia screens e blocks corretamente', async () => {
    const user = userEvent.setup();
    render(<SettingsCollaboratorFunctions />);

    await user.click((await screen.findAllByText('Professor'))[0]);
    await user.click(document.getElementById('screen-students.details') as HTMLInputElement);
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));

    const [, payload] = updateMock.mock.calls[0] as [string, { permissions: { screens: string[]; blocks: string[] } }];

    expect(payload.permissions.screens).not.toContain('students.details');
    expect(Array.isArray(payload.permissions.blocks)).toBe(true);
  });
});
