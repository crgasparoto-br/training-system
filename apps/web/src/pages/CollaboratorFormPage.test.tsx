import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { UseFormRegister } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfessorSummary } from '@corrida/types';
import type { CollaboratorFormValues } from '../features/collaborators/collaborator-model';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  validateLegalFinancial: vi.fn(),
  resetPassword: vi.fn(),
  activate: vi.fn(),
  deactivate: vi.fn(),
  listFunctions: vi.fn(),
  listBanks: vi.fn(),
  listRateLevels: vi.fn(),
  loadUser: vi.fn(),
  actorId: 'manager-1',
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useParams: () => ({ id: 'professor-1' }),
  };
});

vi.mock('../services/professor.service', () => ({
  professorService: {
    get: (...args: unknown[]) => mocks.get(...args),
    list: (...args: unknown[]) => mocks.list(...args),
    update: (...args: unknown[]) => mocks.update(...args),
    validateLegalFinancial: (...args: unknown[]) => mocks.validateLegalFinancial(...args),
    resetPassword: (...args: unknown[]) => mocks.resetPassword(...args),
    activate: (...args: unknown[]) => mocks.activate(...args),
    deactivate: (...args: unknown[]) => mocks.deactivate(...args),
    create: vi.fn(),
    uploadAvatar: vi.fn(),
    uploadSignedContract: vi.fn(),
  },
}));

vi.mock('../services/collaborator-function.service', () => ({
  collaboratorFunctionService: {
    list: (...args: unknown[]) => mocks.listFunctions(...args),
  },
}));

vi.mock('../services/bank.service', () => ({
  bankService: { list: (...args: unknown[]) => mocks.listBanks(...args) },
}));

vi.mock('../services/hourly-rate-level.service', () => ({
  hourlyRateLevelService: { list: (...args: unknown[]) => mocks.listRateLevels(...args) },
}));

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: () => ({
    user: { professor: { id: mocks.actorId } },
    loadUser: mocks.loadUser,
  }),
}));

vi.mock('../access/access-control', () => ({
  getDataScopeForScreen: () => 'contract',
  canAccessBlock: () => true,
}));

vi.mock('../features/collaborators/CollaboratorForm', () => ({
  CollaboratorForm: ({
    register,
    onCancel,
    submitting,
  }: {
    register: UseFormRegister<CollaboratorFormValues>;
    onCancel: () => void;
    submitting: boolean;
  }) => (
    <div>
      <label>
        Nome
        <input aria-label="Nome" {...register('name')} />
      </label>
      <button type="submit" disabled={submitting}>Salvar alterações</button>
      <button type="button" onClick={onCancel}>Cancelar</button>
    </div>
  ),
}));

import { CollaboratorFormPage } from './CollaboratorFormPage';

const collaborator = {
  id: 'professor-1',
  role: 'professor',
  collaboratorFunction: { id: 'function-1', name: 'Professor', code: 'professor', isActive: true },
  responsibleManager: null,
  operationalRoleIds: ['function-1'],
  hourlyRates: { personal: 100, consulting: 80, evaluation: 120 },
  hasSignedContract: false,
  signedContractDocumentUrl: null,
  user: {
    id: 'user-1',
    email: 'teste@example.com',
    isActive: true,
    profile: {
      name: 'Colaborador Teste',
      companyDocument: '12.345.678/0001-90',
    },
  },
  contract: { id: 'contract-1', type: 'academy', document: '123' },
  createdAt: '2026-01-01T00:00:00.000Z',
} as ProfessorSummary;

describe('CollaboratorFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actorId = 'manager-1';
    mocks.get.mockResolvedValue(collaborator);
    mocks.list.mockResolvedValue([collaborator]);
    mocks.listFunctions.mockResolvedValue([
      { id: 'function-1', name: 'Professor', code: 'professor', isActive: true },
    ]);
    mocks.listBanks.mockResolvedValue([]);
    mocks.listRateLevels.mockResolvedValue([]);
    mocks.loadUser.mockResolvedValue(undefined);
    mocks.validateLegalFinancial.mockResolvedValue(collaborator);
    mocks.resetPassword.mockResolvedValue({ tempPassword: 'Senha123' });
    mocks.activate.mockResolvedValue(undefined);
    mocks.deactivate.mockResolvedValue(undefined);
    mocks.update.mockImplementation(async (_id: string, payload: { name?: string }) => ({
      ...collaborator,
      user: {
        ...collaborator.user,
        profile: { ...collaborator.user.profile, name: payload.name ?? collaborator.user.profile.name },
      },
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recarrega a edição diretamente pelo id da URL', async () => {
    render(<MemoryRouter><CollaboratorFormPage mode="edit" /></MemoryRouter>);

    expect(await screen.findByDisplayValue('Colaborador Teste')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('professor-1');
    expect(mocks.listRateLevels).toHaveBeenCalled();
  });

  it('disponibiliza as ações administrativas somente no contexto de edição', async () => {
    render(<MemoryRouter><CollaboratorFormPage mode="edit" /></MemoryRouter>);

    const validateButton = await screen.findByRole('button', { name: /validar dados financeiros/i });
    expect(screen.getByRole('button', { name: /redefinir senha/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /desativar/i })).toBeInTheDocument();

    fireEvent.click(validateButton);

    await waitFor(() => expect(mocks.validateLegalFinancial).toHaveBeenCalledWith('professor-1'));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Dados jurídicos e financeiros validados com sucesso.')).toBeInTheDocument();
  });

  it('preserva a senha temporária quando apenas a recarga posterior falha', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.get.mockReset()
      .mockResolvedValueOnce(collaborator)
      .mockRejectedValueOnce(new Error('Falha de recarga'));

    render(<MemoryRouter><CollaboratorFormPage mode="edit" /></MemoryRouter>);
    const resetButton = await screen.findByRole('button', { name: /redefinir senha/i });
    fireEvent.click(resetButton);

    await waitFor(() => expect(mocks.resetPassword).toHaveBeenCalledWith('professor-1'));
    const temporaryPassword = await screen.findByText('Senha123');
    expect(temporaryPassword.closest('[role="status"]')).toHaveTextContent('Senha temporária: Senha123');
    expect(screen.getByRole('alert')).toHaveTextContent(/ação foi concluída.*recarregue a página/i);
  });

  it('salva e permanece no contexto do mesmo colaborador', async () => {
    render(<MemoryRouter><CollaboratorFormPage mode="edit" /></MemoryRouter>);
    const nameInput = await screen.findByLabelText('Nome');

    fireEvent.change(nameInput, { target: { value: 'Colaborador Atualizado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(
      'professor-1',
      expect.objectContaining({ name: 'Colaborador Atualizado' })
    ));
    expect(mocks.navigate).toHaveBeenCalledWith(
      '/consultas/colaboradores/professor-1',
      expect.objectContaining({ replace: true, state: { success: 'Alterações salvas com sucesso.' } })
    );
  });

  it('atualiza o usuário autenticado após editar o próprio cadastro', async () => {
    mocks.actorId = 'professor-1';
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(<MemoryRouter><CollaboratorFormPage mode="edit" /></MemoryRouter>);
    const nameInput = await screen.findByLabelText('Nome');

    fireEvent.change(nameInput, { target: { value: 'Meu nome atualizado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(mocks.loadUser).toHaveBeenCalled());
    expect(setItem).toHaveBeenCalledWith('auth-permissions-updated-at', expect.any(String));
  });

  it('confirma e descarta alterações ao cancelar', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryRouter><CollaboratorFormPage mode="edit" /></MemoryRouter>);
    const nameInput = await screen.findByLabelText('Nome');

    fireEvent.change(nameInput, { target: { value: 'Alteração local' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(confirm).toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith('/consultas/colaboradores/professor-1');
  });

  it('permanece na edição quando o descarte é recusado', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<MemoryRouter><CollaboratorFormPage mode="edit" /></MemoryRouter>);
    const nameInput = await screen.findByLabelText('Nome');

    fireEvent.change(nameInput, { target: { value: 'Alteração local' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
