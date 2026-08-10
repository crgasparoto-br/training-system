import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listProcesses: vi.fn(),
  getSession: vi.fn(),
  getParq: vi.fn(),
  user: {} as Record<string, unknown>,
}));

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: () => ({ user: mocks.user, isAuthenticated: true }),
}));

vi.mock('../services/pre-registration-public.service', () => ({
  preRegistrationPublicService: {
    listProcesses: mocks.listProcesses,
    getSession: mocks.getSession,
    getParq: mocks.getParq,
  },
}));

import { Home } from './Home';

const completedSession = {
  alunoId: 'aluno-1',
  status: 'PRE_REGISTRATION_COMPLETED',
  version: 2,
  currentStep: 'COMPLETED',
  tenant: { name: 'Academia', privacyNoticeUrl: 'https://example.com/privacy' },
  identity: {},
  isMinor: false,
  claimRole: 'STUDENT',
  guardianAuthorization: { status: 'NOT_REQUIRED' },
  privacy: { noticeVersion: 'v1', noticeUrl: 'https://example.com/privacy' },
  missingRequiredFields: [],
  duplicateWarnings: [],
  nextSteps: [
    {
      key: 'ANAMNESIS',
      title: 'Responder Anamnese Inicial',
      description: 'Conte informações importantes.',
      optional: true,
      status: 'COMPLETED',
      action: 'VIEW',
      href: '/pre-cadastro/anamnese?alunoId=aluno-1',
    },
    {
      key: 'PARQ',
      title: 'Responder PAR-Q',
      description: 'Responda o questionário.',
      optional: true,
      status: 'COMPLETED',
      action: 'VIEW',
      href: '/pre-cadastro/par-q?alunoId=aluno-1',
    },
  ],
};

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );
}

describe('Issue #309 - regressões da auditoria do PAR-Q na home do lead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: 'a1', type: 'aluno' };
    mocks.listProcesses.mockResolvedValue([
      { alunoId: 'aluno-1', status: 'PRE_REGISTRATION_COMPLETED' },
    ]);
    mocks.getSession.mockResolvedValue(completedSession);
  });

  it('não recomenda responder novamente quando o PAR-Q aguarda análise profissional', async () => {
    mocks.getParq.mockResolvedValue({
      alunoId: 'aluno-1',
      status: 'COMPLETED_REVIEW_REQUIRED',
    });

    renderHome();

    expect(await screen.findByText('Análise profissional necessária')).toBeInTheDocument();
    expect(
      screen.getByText('Aguarde a análise profissional do PAR-Q e o contato da equipe.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Responda o PAR-Q quando puder.')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver respostas enviadas' })).toBeInTheDocument();
  });

  it('não mascara falha ao carregar o PAR-Q como resumo parcial do processo', async () => {
    mocks.getParq.mockRejectedValue({
      response: { data: { error: 'Falha ao carregar PAR-Q' } },
    });

    renderHome();

    expect(await screen.findByText('Falha ao carregar PAR-Q')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma rotina liberada')).not.toBeInTheDocument();
    expect(screen.queryByText('Seu processo de pré-matrícula')).not.toBeInTheDocument();
  });
});
