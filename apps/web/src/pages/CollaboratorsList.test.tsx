import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfessorSummary } from '@corrida/types';

const mocks = vi.hoisted(() => ({
  canRegister: false,
  scope: 'self' as 'self' | 'managed' | 'contract',
  list: vi.fn(),
  listFunctions: vi.fn(),
}));

vi.mock('../services/professor.service', () => ({
  professorService: { list: (...args: unknown[]) => mocks.list(...args) },
}));

vi.mock('../services/collaborator-function.service', () => ({
  collaboratorFunctionService: { list: (...args: unknown[]) => mocks.listFunctions(...args) },
}));

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: () => ({ user: { professor: { id: 'actor' } } }),
}));

vi.mock('../access/access-control', () => ({
  canAccessScreen: () => mocks.canRegister,
  getDataScopeForScreen: () => mocks.scope,
}));

import { CollaboratorsList } from './CollaboratorsList';

function collaborator(id: string, name: string, managerId?: string) {
  return {
    id,
    role: 'professor',
    collaboratorFunction: { id: 'function-1', name: 'Professor', code: 'professor', isActive: true },
    responsibleManager: managerId
      ? { id: managerId, user: { profile: { name: 'Gestor' } } }
      : null,
    operationalRoleIds: ['function-1'],
    hasSignedContract: false,
    user: { id: `user-${id}`, email: `${id}@example.com`, isActive: true, profile: { name } },
    contract: { id: 'contract-1', type: 'academy', document: '123' },
    createdAt: '2026-01-01T00:00:00.000Z',
  } as ProfessorSummary;
}

describe('CollaboratorsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canRegister = false;
    mocks.scope = 'self';
    mocks.list.mockResolvedValue([
      collaborator('actor', 'Próprio cadastro'),
      collaborator('managed', 'Colaborador gerenciado', 'actor'),
      collaborator('unrelated', 'Outro colaborador', 'other'),
    ]);
    mocks.listFunctions.mockResolvedValue([
      { id: 'function-1', name: 'Professor', code: 'professor', isActive: true },
    ]);
  });

  it('não exibe cadastro ou edição para perfil somente leitura', async () => {
    render(<MemoryRouter><CollaboratorsList /></MemoryRouter>);

    expect(await screen.findByText('Próprio cadastro')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /novo colaborador/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^editar$/i })).not.toBeInTheDocument();
  });

  it('mostra edição apenas para registros alcançados pelo escopo managed', async () => {
    mocks.canRegister = true;
    mocks.scope = 'managed';
    render(<MemoryRouter><CollaboratorsList /></MemoryRouter>);

    expect(await screen.findByText('Colaborador gerenciado')).toBeInTheDocument();
    const editLinks = screen.getAllByRole('link', { name: /^editar$/i });
    expect(editLinks).toHaveLength(2);
    expect(editLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/consultas/colaboradores/actor/edit',
      '/consultas/colaboradores/managed/edit',
    ]);
    expect(screen.queryByRole('link', { name: /novo colaborador/i })).not.toBeInTheDocument();
  });
});
