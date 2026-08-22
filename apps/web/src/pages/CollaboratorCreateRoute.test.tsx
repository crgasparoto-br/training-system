import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  contractType: 'academy' as 'academy' | 'personal',
}));

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: () => ({
    user: {
      professor: {
        contract: {
          type: mocks.contractType,
        },
      },
    },
  }),
}));

vi.mock('./CollaboratorFormPage', () => ({
  CollaboratorFormPage: ({ mode }: { mode: 'create' | 'edit' }) => (
    <div>FORM-{mode}</div>
  ),
}));

import { CollaboratorCreateRoute } from './CollaboratorCreateRoute';

describe('CollaboratorCreateRoute', () => {
  beforeEach(() => {
    mocks.contractType = 'academy';
  });

  it('abre o formulário de criação para pessoa jurídica', () => {
    render(
      <MemoryRouter>
        <CollaboratorCreateRoute />
      </MemoryRouter>
    );

    expect(screen.getByText('FORM-create')).toBeInTheDocument();
  });

  it('orienta alterar o contrato quando estiver como pessoa física', () => {
    mocks.contractType = 'personal';

    render(
      <MemoryRouter>
        <CollaboratorCreateRoute />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: 'Cadastro de colaboradores requer pessoa jurídica' })
    ).toBeInTheDocument();
    expect(screen.queryByText('FORM-create')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alterar para pessoa jurídica' })).toHaveAttribute(
      'href',
      '/settings/contract'
    );
  });
});
