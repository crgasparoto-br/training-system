import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSummary: vi.fn(),
  getNotifications: vi.fn(),
  getProfileReview: vi.fn(),
}));

vi.mock('../../services/student-self.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/student-self.service')>(
    '../../services/student-self.service'
  );
  return {
    ...actual,
    studentSelfService: {
      ...actual.studentSelfService,
      getSummary: mocks.getSummary,
      getNotifications: mocks.getNotifications,
      getProfileReview: mocks.getProfileReview,
    },
  };
});

import { StudentProfileReviewEntry } from './StudentProfileReviewEntry';

const review = {
  id: 'review-1',
  alunoId: 'aluno-1',
  requestedAt: '2026-08-10T12:00:00.000Z',
  dueAt: '2026-08-20T12:00:00.000Z',
  status: 'pending',
};

function renderEntry(contractId?: string) {
  return render(
    <MemoryRouter>
      <StudentProfileReviewEntry contractId={contractId} />
    </MemoryRouter>
  );
}

describe('StudentProfileReviewEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exibe somente a pendência real e preserva contractId no CTA', async () => {
    mocks.getSummary.mockResolvedValue({
      name: 'Aluno',
      nextProfileReviewAt: '2026-08-20T12:00:00.000Z',
      hasPendingProfileReview: true,
      recentNotifications: [],
    });
    mocks.getProfileReview.mockResolvedValue(review);
    mocks.getNotifications.mockResolvedValue([]);

    renderEntry('contract-1');

    expect(await screen.findByText('Revisão cadastral pendente')).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Abrir revisão' });
    expect(cta).toHaveAttribute('href', '/student/profile-review?contractId=contract-1');
    expect(mocks.getSummary).toHaveBeenCalledWith('contract-1');
    expect(mocks.getProfileReview).toHaveBeenCalledWith('contract-1');
  });

  it('não cria CTA quando não existe revisão pendente', async () => {
    mocks.getSummary.mockResolvedValue({
      name: 'Aluno',
      nextProfileReviewAt: null,
      hasPendingProfileReview: false,
      recentNotifications: [],
    });

    renderEntry();

    expect(await screen.findByText('Nenhuma revisão cadastral pendente')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir revisão' })).not.toBeInTheDocument();
    expect(mocks.getProfileReview).not.toHaveBeenCalled();
    expect(mocks.getNotifications).not.toHaveBeenCalled();
  });

  it('transforma notificações de revisão do vínculo atual em navegação web e ignora outro vínculo', async () => {
    mocks.getSummary.mockResolvedValue({
      name: 'Aluno',
      nextProfileReviewAt: '2026-08-20T12:00:00.000Z',
      hasPendingProfileReview: true,
      recentNotifications: [],
    });
    mocks.getProfileReview.mockResolvedValue(review);
    mocks.getNotifications.mockResolvedValue([
      {
        id: 'n1',
        type: 'profile_review_requested',
        title: 'Revisão solicitada',
        message: 'Confira seus dados.',
        data: { alunoId: 'aluno-1', reviewId: 'review-1', deepLink: 'acesso://student/profile-review' },
        createdAt: '2026-08-10T12:00:00.000Z',
      },
      {
        id: 'n2',
        type: 'profile_review_overdue',
        title: 'Outra revisão vencida',
        message: 'Outro vínculo.',
        data: { alunoId: 'aluno-2', reviewId: 'review-2' },
        createdAt: '2026-08-09T12:00:00.000Z',
      },
      {
        id: 'n3',
        type: 'workout_available',
        title: 'Treino disponível',
        message: 'Novo treino.',
        data: { alunoId: 'aluno-1' },
        createdAt: '2026-08-08T12:00:00.000Z',
      },
    ]);

    renderEntry('contract-1');

    expect(await screen.findByText('Revisão solicitada')).toBeInTheDocument();
    expect(screen.queryByText('Outra revisão vencida')).not.toBeInTheDocument();
    expect(screen.queryByText('Treino disponível')).not.toBeInTheDocument();

    const links = screen.getAllByRole('link', { name: /Abrir revisão/ });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/student/profile-review?contractId=contract-1');
    }
  });

  it('exibe falha recuperável e permite tentar novamente', async () => {
    mocks.getSummary
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce({
        name: 'Aluno',
        nextProfileReviewAt: null,
        hasPendingProfileReview: false,
        recentNotifications: [],
      });

    renderEntry();

    expect(await screen.findByText('Não foi possível carregar sua revisão')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Nenhuma revisão cadastral pendente')).toBeInTheDocument();
    await waitFor(() => expect(mocks.getSummary).toHaveBeenCalledTimes(2));
  });

  it('orienta seleção de vínculo quando a API exige contractId', async () => {
    mocks.getSummary.mockRejectedValue({ response: { status: 409 } });

    renderEntry();

    expect(await screen.findByText('Selecione o vínculo para continuar')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir revisão' })).not.toBeInTheDocument();
  });
});
