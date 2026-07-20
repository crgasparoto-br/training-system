import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfessorSummary } from '@corrida/types';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  listFunctions: vi.fn(),
  canEdit: false,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useParams: () => ({ id: 'professor-1' }) };
});

vi.mock('../services/professor.service', () => ({
  professorService: {
    get: (...args: unknown[]) => mocks.get(...args),
    validateLegalFinancial: vi.fn(),
    resetPassword: vi.fn(),
    activate: vi.fn(),
    deactivate: vi.fn(),
  },
}));

vi.mock('../services/collaborator-function.service', () => ({
  collaboratorFunctionService: { list: (...args: unknown[]) => mocks.listFunctions(...args) },
}));

vi.mock('../stores/useAuthStore', () => ({ useAuthStore: () => ({ user: { professor: { id: 'viewer' } } }) }));
vi.mock('../access/access-control', () => ({
  canAccessScreen: () => mocks.canEdit,
  canAccessBlock: () => false,
  getDataScopeForScreen: () => 'self',
}));

import { CollaboratorDetails } from './CollaboratorDetails';

const collaborator = {
  id: 'professor-1',
  role: 'professor',
  collaboratorFunction: { id: 'function-1', name: 'Professor', code: 'professor', isActive: true },
  responsibleManager: null,
  operationalRoleIds: ['function-1'],
  hourlyRates: null,
  hasSignedContract: false,
  user: { id: 'user-1', email: 'teste@example.com', isActive: true, profile: { name: 'Colaborador Teste' } },
  contract: { id: 'contract-1', type: 'academy', document: '123' },
  createdAt: '2026-01-01T00:00:00.000Z',
} as ProfessorSummary;

describe('CollaboratorDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canEdit = false;
    mocks.get.mockResolvedValue(collaborator);
    mocks.listFunctions.mockResolvedValue([{ id: 'function-1', name: 'Professor', code: 'professor', isActive: true }]);
  });

  it('carrega o registro individual e renderiza a consulta em modo estritamente somente leitura', async () => {
    render(<MemoryRouter><CollaboratorDetails /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Colaborador Teste' })).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('professor-1');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /salvar/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Editar colaborador')).not.toBeInTheDocument();
  });

  it('mostra resposta uniforme para id inexistente ou fora do escopo', async () => {
    mocks.get.mockRejectedValue(new Error('Not found'));
    render(<MemoryRouter><CollaboratorDetails /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Colaborador não encontrado')).toBeInTheDocument());
    expect(screen.getByText(/não existe ou não está disponível/i)).toBeInTheDocument();
  });
});
