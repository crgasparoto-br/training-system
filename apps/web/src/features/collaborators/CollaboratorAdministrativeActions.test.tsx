import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProfessorSummary } from '@corrida/types';
import { CollaboratorAdministrativeActions } from './CollaboratorAdministrativeActions';

const collaborator = {
  id: 'professor-1',
  role: 'professor',
  collaboratorFunction: { id: 'function-1', name: 'Professor', code: 'professor', isActive: true },
  responsibleManager: null,
  operationalRoleIds: ['function-1'],
  hourlyRates: null,
  hasSignedContract: false,
  user: {
    id: 'user-1',
    email: 'teste@example.com',
    isActive: true,
    profile: { name: 'Colaborador Teste' },
  },
  contract: { id: 'contract-1', type: 'academy', document: '123' },
  createdAt: '2026-01-01T00:00:00.000Z',
} as ProfessorSummary;

const callbacks = {
  onValidateLegal: vi.fn(),
  onResetPassword: vi.fn(),
  onActivate: vi.fn(),
  onDeactivate: vi.fn(),
};

describe('CollaboratorAdministrativeActions', () => {
  it('não renderiza seção vazia quando a única permissão não se aplica ao estado atual', () => {
    render(
      <CollaboratorAdministrativeActions
        collaborator={collaborator}
        canValidateLegal={false}
        canResetPassword={false}
        canActivate
        canDeactivate={false}
        loading={false}
        successMessage={null}
        temporaryPassword={null}
        {...callbacks}
      />
    );

    expect(screen.queryByText('Ações administrativas')).not.toBeInTheDocument();
  });

  it('mantém ações secundárias recolhidas até a expansão pelo usuário', () => {
    render(
      <CollaboratorAdministrativeActions
        collaborator={{
          ...collaborator,
          user: { ...collaborator.user, isActive: false },
        }}
        canValidateLegal={false}
        canResetPassword={false}
        canActivate
        canDeactivate={false}
        loading={false}
        successMessage={null}
        temporaryPassword={null}
        {...callbacks}
      />
    );

    const title = screen.getByText('Ações administrativas');
    const section = title.closest('details');
    expect(section).not.toHaveAttribute('open');

    fireEvent.click(title.closest('summary')!);

    expect(section).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: /reativar/i })).toBeInTheDocument();
  });

  it('abre a seção quando existe resultado administrativo para apresentar', () => {
    render(
      <CollaboratorAdministrativeActions
        collaborator={collaborator}
        canValidateLegal={false}
        canResetPassword={false}
        canActivate={false}
        canDeactivate={false}
        loading={false}
        successMessage="Ação concluída com sucesso."
        temporaryPassword={null}
        {...callbacks}
      />
    );

    expect(screen.getByText('Ações administrativas').closest('details')).toHaveAttribute('open');
    expect(screen.getByRole('status')).toHaveTextContent('Ação concluída com sucesso.');
  });
});
