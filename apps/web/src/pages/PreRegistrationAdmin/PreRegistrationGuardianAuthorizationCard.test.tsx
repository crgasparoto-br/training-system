// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getGuardianAuthorization: vi.fn(),
  approveGuardianAuthorization: vi.fn(),
  revokeGuardianAuthorization: vi.fn(),
}));

vi.mock('../../services/pre-registration-admin.service', () => ({
  preRegistrationAdminService: mocks,
}));

import { PreRegistrationGuardianAuthorizationCard } from './PreRegistrationGuardianAuthorizationCard';

const pendingAuthorization = {
  id: 'authorization-1',
  alunoId: 'lead-1',
  contractId: 'contract-1',
  status: 'PENDING' as const,
  relationship: 'Mãe',
  requestedAt: '2026-07-24T12:00:00.000Z',
  guardian: {
    userId: 'guardian-1',
    name: 'Responsável Declarado',
    email: 'responsavel@example.com',
    phone: '15999990000',
  },
};

describe('PreRegistrationGuardianAuthorizationCard', () => {
  beforeEach(() => {
    mocks.getGuardianAuthorization.mockReset();
    mocks.approveGuardianAuthorization.mockReset();
    mocks.revokeGuardianAuthorization.mockReset();
    mocks.getGuardianAuthorization.mockResolvedValue(pendingAuthorization);
  });

  it('requires an explicit independent-validation confirmation before approval', async () => {
    mocks.approveGuardianAuthorization.mockResolvedValue({
      ...pendingAuthorization,
      status: 'ACTIVE',
      validatedAt: '2026-07-24T13:00:00.000Z',
      validatedBy: { userId: 'admin-1', name: 'Gestor Validador' },
    });

    render(<PreRegistrationGuardianAuthorizationCard leadId="lead-1" />);

    expect(await screen.findByText('Responsável Declarado')).toBeInTheDocument();
    const approveButton = screen.getByRole('button', { name: /Validar vínculo/i });
    expect(approveButton).toBeDisabled();

    fireEvent.click(
      screen.getByRole('checkbox', { name: /fonte independente da declaração/i })
    );
    expect(approveButton).toBeEnabled();
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(mocks.approveGuardianAuthorization).toHaveBeenCalledWith('lead-1');
    });
    expect(await screen.findByText(/Vínculo validado por Gestor Validador/i)).toBeInTheDocument();
  });

  it('requires a reason and confirmation before revoking active access', async () => {
    mocks.getGuardianAuthorization.mockResolvedValue({
      ...pendingAuthorization,
      status: 'ACTIVE',
      validatedAt: '2026-07-24T13:00:00.000Z',
      validatedBy: { userId: 'admin-1', name: 'Gestor Validador' },
    });
    mocks.revokeGuardianAuthorization.mockResolvedValue({
      ...pendingAuthorization,
      status: 'REVOKED',
      revokedAt: '2026-07-24T14:00:00.000Z',
      revokedBy: { userId: 'admin-1', name: 'Gestor Validador' },
    });

    render(<PreRegistrationGuardianAuthorizationCard leadId="lead-1" />);

    const revokeButton = await screen.findByRole('button', { name: /Revogar vínculo/i });
    expect(revokeButton).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Explique por que o acesso será removido/i), {
      target: { value: 'Documento inválido' },
    });
    fireEvent.click(
      screen.getByRole('checkbox', { name: /revogação imediata do acesso/i })
    );
    fireEvent.click(revokeButton);

    await waitFor(() => {
      expect(mocks.revokeGuardianAuthorization).toHaveBeenCalledWith(
        'lead-1',
        'Documento inválido'
      );
    });
    expect(await screen.findByText(/não concede acesso aos dados do menor/i)).toBeInTheDocument();
  });
});
