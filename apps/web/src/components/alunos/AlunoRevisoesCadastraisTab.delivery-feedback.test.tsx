import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/aluno.service', () => ({
  alunoService: {
    getProfileReviewSettings: vi.fn(),
    listProfileReviews: vi.fn(),
    requestProfileReview: vi.fn(),
    updateProfileReviewSettings: vi.fn(),
    approveProfileReview: vi.fn(),
    rejectProfileReview: vi.fn(),
  },
}));

import { AlunoRevisoesCadastraisTab } from './AlunoRevisoesCadastraisTab';
import { alunoService } from '../../services/aluno.service';

const mockedAlunoService = vi.mocked(alunoService);

const settingsResponse = {
  alunoId: 'aluno-1',
  settings: null,
  policy: null,
  effective: {
    reviewPeriodMonths: 4,
    nextReviewAt: null,
    isReviewRequired: true,
    sectionsRequested: [],
  },
};

const acceptedRequestResult = {
  id: 'review-1',
  status: 'pending',
  requestedAt: '2026-08-16T03:00:00.000Z',
  dueAt: null,
  completedAt: null,
  changedFields: [],
  approval: {
    requiresApproval: false,
    hasPendingApproval: false,
  },
  reviewCreated: true,
  requestAction: 'created',
  notification: {
    persisted: true,
    deduplicated: false,
    delivery: {
      email: {
        channel: 'email',
        status: 'accepted',
        error: null,
        providerMessageId: 'sg-1',
        providerStatus: 'accepted',
      },
      whatsapp: {
        channel: 'whatsapp',
        status: 'skipped',
        error: null,
        providerMessageId: null,
        providerStatus: null,
      },
    },
    error: null,
  },
};

describe('AlunoRevisoesCadastraisTab feedback de entrega externa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAlunoService.getProfileReviewSettings.mockResolvedValue(settingsResponse as any);
    mockedAlunoService.listProfileReviews.mockResolvedValue([]);
    mockedAlunoService.requestProfileReview.mockResolvedValue(acceptedRequestResult as any);
  });

  it('informa que accepted aguarda confirmação e não afirma entrega', async () => {
    const onToast = vi.fn();

    render(
      <AlunoRevisoesCadastraisTab
        alunoId="aluno-1"
        canManageActions
        onToast={onToast}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Solicitar revisão agora' }));

    await waitFor(() => expect(onToast).toHaveBeenCalled());
    const [message, type] = onToast.mock.calls[onToast.mock.calls.length - 1] as [string, string];

    expect(type).toBe('success');
    expect(message).toContain(
      'O envio por e-mail foi aceito pelo provedor e aguarda confirmação de entrega.'
    );
    expect(message).not.toContain('Notificação enviada');
    expect(message).not.toContain('A notificação foi enviada');
  });
});
