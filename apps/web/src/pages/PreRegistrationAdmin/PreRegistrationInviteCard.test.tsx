// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PreRegistrationAdminLeadDetailDTO } from '@corrida/types';
import { PreRegistrationInviteCard } from './PreRegistrationInviteCard';

const baseLead: PreRegistrationAdminLeadDetailDTO = {
  id: 'lead-1',
  name: 'Maria da Silva',
  contacts: {
    phone: '(15) 99999-9999',
    email: 'maria@example.com',
    cpf: '000.000.000-00',
    masked: false,
  },
  origin: 'Indicação',
  status: 'INVITED',
  responsible: { id: 'professor-1', name: 'Professor Responsável' },
  createdAt: '2026-07-22T12:00:00.000Z',
  updatedAt: '2026-07-22T12:00:00.000Z',
  lastActivityAt: '2026-07-22T12:00:00.000Z',
  inviteStatus: 'ACTIVE',
  inviteExpiresAt: '2099-07-23T12:00:00.000Z',
  inviteAllowedActions: {
    canGenerateFirst: false,
    canRegenerate: true,
    canRevoke: true,
  },
  progress: {
    basicRegistration: 'NOT_STARTED',
    healthModuleStatus: 'NOT_STARTED',
    parqModuleStatus: 'NOT_STARTED',
    parqRequiresProfessionalReview: false,
    completedFields: 1,
    totalFields: 5,
    missingRequiredFields: ['birthDate'],
  },
  nextAction: {
    code: 'WAIT_FOR_ACCESS',
    label: 'Aguardar primeiro acesso',
    description: 'O convite está ativo.',
    enabled: true,
  },
  allowedActions: {
    canEditCommercialData: true,
    canGenerateInvite: false,
    canRegenerateInvite: true,
    canRevokeInvite: true,
    canReview: false,
    canDiscard: true,
    canReopen: false,
    canConvert: false,
    canOpenStudentCentral: false,
  },
  commercial: {},
  lifecycleProgress: {
    alunoId: 'lead-1',
    status: 'INVITED',
    healthModuleStatus: 'NOT_STARTED',
    parqModuleStatus: 'NOT_STARTED',
    missingRequiredFields: ['birthDate'],
  },
  invite: {
    id: 'invite-1',
    alunoId: 'lead-1',
    status: 'ACTIVE',
    purpose: 'PRE_REGISTRATION',
    expiresAt: '2099-07-23T12:00:00.000Z',
    createdAt: '2026-07-22T12:00:00.000Z',
    linkRecoverable: false,
    allowedActions: {
      canGenerateFirst: false,
      canRegenerate: true,
      canRevoke: true,
    },
  },
  pendencies: [],
  history: [],
};

describe('PreRegistrationInviteCard', () => {
  it('requires explicit confirmation before replacing an active invite', () => {
    const onGenerate = vi.fn();

    render(
      <PreRegistrationInviteCard
        lead={baseLead}
        actionLoading={false}
        generatedUrl={null}
        copyState="idle"
        onGenerate={onGenerate}
        onCopy={vi.fn()}
        onRevoke={vi.fn()}
      />
    );

    const replaceButton = screen.getByRole('button', { name: /gerar novo link/i });
    expect(replaceButton).toBeDisabled();

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /confirmo que o link atual deixará de funcionar/i,
      })
    );
    expect(replaceButton).toBeEnabled();

    fireEvent.click(replaceButton);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['EXPIRED', 'Expirado'],
    ['REVOKED', 'Revogado'],
    ['SUPERSEDED', 'Substituído'],
    ['COMPLETED', 'Concluído'],
  ] as const)(
    'allows a new invite after %s without requiring replacement confirmation',
    (status, label) => {
      const onGenerate = vi.fn();
      const lead: PreRegistrationAdminLeadDetailDTO = {
        ...baseLead,
        inviteStatus: status,
        allowedActions: {
          ...baseLead.allowedActions,
          canGenerateInvite: false,
          canRegenerateInvite: false,
          canRevokeInvite: false,
        },
        invite: {
          ...baseLead.invite!,
          status,
          allowedActions: {
            canGenerateFirst: true,
            canRegenerate: false,
            canRevoke: false,
          },
        },
      };

      render(
        <PreRegistrationInviteCard
          lead={lead}
          actionLoading={false}
          generatedUrl={null}
          copyState="idle"
          onGenerate={onGenerate}
          onCopy={vi.fn()}
          onRevoke={vi.fn()}
        />
      );

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.queryByText(status)).not.toBeInTheDocument();
      expect(
        screen.getByText(/o convite anterior não está mais disponível/i)
      ).toBeInTheDocument();

      const generateButton = screen.getByRole('button', { name: /gerar novo link/i });
      expect(generateButton).toBeEnabled();
      expect(
        screen.queryByRole('checkbox', {
          name: /confirmo que o link atual deixará de funcionar/i,
        })
      ).not.toBeInTheDocument();

      fireEvent.click(generateButton);
      expect(onGenerate).toHaveBeenCalledTimes(1);
    }
  );

  it('requires a reason and confirmation before revocation', () => {
    const onRevoke = vi.fn().mockResolvedValue(undefined);

    render(
      <PreRegistrationInviteCard
        lead={baseLead}
        actionLoading={false}
        generatedUrl={null}
        copyState="idle"
        onGenerate={vi.fn()}
        onCopy={vi.fn()}
        onRevoke={onRevoke}
      />
    );

    const revokeButton = screen.getByRole('button', { name: /revogar convite/i });
    expect(revokeButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/explique por que o link será invalidado/i), {
      target: { value: 'Contato solicitou novo link' },
    });
    expect(revokeButton).toBeDisabled();

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /confirmo que a pessoa não poderá mais acessar/i,
      })
    );
    expect(revokeButton).toBeEnabled();

    fireEvent.click(revokeButton);
    expect(onRevoke).toHaveBeenCalledWith('Contato solicitou novo link');
  });

  it('keeps the generated URL visible and offers manual copy after clipboard failure', () => {
    render(
      <PreRegistrationInviteCard
        lead={baseLead}
        actionLoading={false}
        generatedUrl="https://app.example.com/pre-cadastro/token-unico"
        copyState="failed"
        onGenerate={vi.fn()}
        onCopy={vi.fn()}
        onRevoke={vi.fn()}
      />
    );

    expect(
      screen.getByText('https://app.example.com/pre-cadastro/token-unico')
    ).toBeInTheDocument();
    expect(screen.getByText(/a cópia automática não funcionou/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copiar link/i })).toBeEnabled();
  });
});
