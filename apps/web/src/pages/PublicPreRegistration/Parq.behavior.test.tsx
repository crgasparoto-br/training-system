import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PARQ_CATALOG } from '@corrida/types';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  getParq: vi.fn(),
  saveParqDraft: vi.fn(),
  completeParq: vi.fn(),
  revokeParqConsent: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: () => ({ isAuthenticated: true }),
}));

vi.mock('../../services/pre-registration-public.service', () => ({
  preRegistrationPublicService: {
    getParq: mocks.getParq,
    saveParqDraft: mocks.saveParqDraft,
    completeParq: mocks.completeParq,
    revokeParqConsent: mocks.revokeParqConsent,
  },
}));

import { Parq } from './Parq';

const baseSession = {
  alunoId: 'student-1',
  catalog: PARQ_CATALOG,
  status: 'NOT_STARTED',
  version: 1,
  responses: {},
  consent: { requiredVersion: '2026-07', version: 1 },
  legacy: { preserved: false, needsRepeat: false },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/pre-cadastro/par-q?alunoId=student-1']}>
      <Parq />
    </MemoryRouter>
  );
}

describe('Parq', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.getParq.mockReset();
    mocks.saveParqDraft.mockReset();
    mocks.completeParq.mockReset();
    mocks.revokeParqConsent.mockReset();
    mocks.getParq.mockResolvedValue(baseSession);
    mocks.saveParqDraft.mockImplementation(async (_id, input) => ({
      ...baseSession,
      status: 'IN_PROGRESS',
      version: 2,
      responses: input.responses,
      consent: { requiredVersion: '2026-07', version: 1, acceptedVersion: '2026-07', acceptedAt: '2026-07-25T00:00:00.000Z' },
      lastSavedAt: '2026-07-25T00:00:00.000Z',
    }));
  });

  it('does not save health responses before consent', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /Questionário PAR-Q/i });
    expect(screen.getByRole('button', { name: /Salvar e continuar depois/i })).toBeDisabled();
    expect(mocks.saveParqDraft).not.toHaveBeenCalled();
  });

  it('restores a persisted draft without local storage', async () => {
    mocks.getParq.mockResolvedValue({
      ...baseSession,
      status: 'IN_PROGRESS',
      version: 4,
      responses: { q1: true, q2: false },
      consent: { requiredVersion: '2026-07', version: 1, acceptedVersion: '2026-07', acceptedAt: '2026-07-25T00:00:00.000Z' },
    });
    renderPage();
    await screen.findByRole('heading', { name: /Questionário PAR-Q/i });
    const yesAnswers = screen.getAllByRole('radio', { name: 'Sim' });
    const noAnswers = screen.getAllByRole('radio', { name: 'Não' });
    expect(yesAnswers[0]).toBeChecked();
    expect(noAnswers[1]).toBeChecked();
  });

  it('shows a reload action on concurrent modification', async () => {
    mocks.saveParqDraft.mockRejectedValue({
      response: { status: 409, data: { error: 'Alterado em outro acesso', details: { code: 'CONCURRENT_MODIFICATION' } } },
    });
    renderPage();
    await screen.findByRole('heading', { name: /Questionário PAR-Q/i });
    fireEvent.click(screen.getByRole('checkbox', { name: /aviso de privacidade/i }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar e continuar depois/i }));
    expect(await screen.findByRole('button', { name: /Recarregar alterações mais recentes/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Recarregar alterações mais recentes/i }));
    await waitFor(() => expect(mocks.getParq).toHaveBeenCalledTimes(2));
  });

  it('revokes active consent using the server consent generation', async () => {
    const active = {
      ...baseSession,
      consent: {
        requiredVersion: '2026-07',
        version: 3,
        acceptedVersion: '2026-07',
        acceptedAt: '2026-07-25T00:00:00.000Z',
      },
    };
    mocks.getParq.mockResolvedValue(active);
    mocks.revokeParqConsent.mockResolvedValue({
      ...active,
      consent: { ...active.consent, version: 4, revokedAt: '2026-07-26T00:00:00.000Z' },
    });
    renderPage();
    await screen.findByRole('heading', { name: /Questionário PAR-Q/i });
    fireEvent.click(screen.getByRole('button', { name: /Revogar consentimento/i }));
    await waitFor(() => expect(mocks.revokeParqConsent).toHaveBeenCalledWith('student-1', { expectedVersion: 3 }));
    expect(await screen.findByText(/Consentimento revogado/i)).toBeInTheDocument();
  });

  it('explains that a positive completion requires review without diagnosis or commercial block', async () => {
    mocks.getParq.mockResolvedValue({
      ...baseSession,
      status: 'COMPLETED_REVIEW_REQUIRED',
      latestSubmission: {
        id: 'submission-1', alunoId: 'student-1', contractId: 'contract-1',
        catalogVersion: 'parq-2026-01', submittedAt: '2026-07-25T00:00:00.000Z',
        responses: { q1: true, q2: false, q3: false, q4: false, q5: false, q6: false, q7: false },
        positiveItems: [{ key: 'q1', label: 'Pergunta' }], positiveCount: 1,
        declarationAccepted: true, sourceType: 'student', review: { id: 'review-1', status: 'PENDING' },
      },
    });
    renderPage();
    expect(await screen.findByText(/Análise profissional necessária/i)).toBeInTheDocument();
    expect(screen.getByText(/não bloqueia a conclusão comercial/i)).toBeInTheDocument();
    expect(screen.getByText(/não constitui diagnóstico, prescrição ou liberação médica/i)).toBeInTheDocument();
  });
});
