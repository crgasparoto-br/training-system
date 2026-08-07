import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreRegistrationSessionDTO } from '@corrida/types';
import type { LeadOnboardingSummaryState } from '../../hooks/useLeadOnboardingSummary';

const mocks = vi.hoisted(() => ({
  summaryState: { status: 'loading' } as LeadOnboardingSummaryState,
  retry: vi.fn(),
  listProcesses: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('../../hooks/useLeadOnboardingSummary', () => ({
  useLeadOnboardingSummary: () => ({ state: mocks.summaryState, retry: mocks.retry }),
}));

vi.mock('../../services/pre-registration-public.service', () => ({
  preRegistrationPublicService: {
    listProcesses: mocks.listProcesses,
    getSession: mocks.getSession,
  },
}));

vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: () => ({ isAuthenticated: true }),
}));

import {
  AuthenticatedPreRegistrationPortal,
  PreRegistrationDataSummary,
} from './AuthenticatedPreRegistrationPortal';

const baseSession: PreRegistrationSessionDTO = {
  alunoId: 'student-1',
  status: 'PRE_REGISTRATION_IN_PROGRESS',
  version: 1,
  currentStep: 'IDENTIFICATION',
  isMinor: false,
  claimRole: 'STUDENT',
  identity: {
    name: 'Aluno Teste',
    birthDate: '1990-01-01',
    cpf: '52998224725',
    phone: '15999990000',
    email: 'aluno@example.com',
    addressStreet: 'Rua Teste',
    addressNumber: '123',
    addressNeighborhood: 'Centro',
    addressCity: 'Sorocaba',
    addressState: 'SP',
    addressZipCode: '18000000',
  },
  tenant: { name: 'Academia Teste', privacyNoticeUrl: 'https://example.com/privacy' },
  guardianAuthorization: { status: 'NOT_REQUIRED', role: 'STUDENT' },
  privacy: {
    noticeUrl: 'https://example.com/privacy',
    noticeVersion: '2026-07',
    acceptedAt: '2026-08-01T12:00:00.000Z',
  },
  missingRequiredFields: [],
  duplicateWarnings: [],
  nextSteps: [
    {
      key: 'ANAMNESIS',
      title: 'Anamnese Inicial',
      description: 'Conte informações importantes para o acompanhamento.',
      optional: true,
      status: 'NOT_STARTED',
      action: 'START',
      href: '/pre-cadastro/anamnese?alunoId=student-1',
    },
    {
      key: 'PARQ',
      title: 'PAR-Q',
      description: 'Questionário de prontidão para atividade física.',
      optional: true,
      status: 'IN_PROGRESS',
      action: 'CONTINUE',
      href: '/pre-cadastro/par-q?alunoId=student-1',
    },
  ],
};

function renderPortal(initialEntry: string | { pathname: string; state?: unknown } = '/pre-cadastro') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthenticatedPreRegistrationPortal>
        <div>Fluxo canônico do pré-cadastro</div>
      </AuthenticatedPreRegistrationPortal>
    </MemoryRouter>
  );
}

describe('AuthenticatedPreRegistrationPortal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.summaryState = { status: 'loading' };
  });

  it('integra dados cadastrais com o fluxo canônico e oferece retorno ao início enquanto incompleto', () => {
    mocks.summaryState = { status: 'open', session: baseSession, parq: null };

    renderPortal({ pathname: '/pre-cadastro', state: { preferredAlunoId: 'student-1' } });

    expect(screen.getByRole('heading', { name: 'Dados cadastrais' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continuar pré-cadastro' })).toHaveAttribute(
      'href',
      '#pre-registration-flow'
    );
    expect(screen.getByRole('link', { name: 'Voltar para início' })).toHaveAttribute(
      'href',
      '/inicio'
    );
    expect(screen.getByText('Fluxo canônico do pré-cadastro')).toBeInTheDocument();
  });

  it('oferece consulta explícita do pré-cadastro concluído sem substituir os próximos passos', () => {
    mocks.summaryState = {
      status: 'open',
      session: {
        ...baseSession,
        status: 'PRE_REGISTRATION_COMPLETED',
        completedAt: '2026-08-01T12:30:00.000Z',
      },
      parq: null,
    };

    renderPortal();

    expect(screen.getByRole('link', { name: 'Ver pré-cadastro' })).toHaveAttribute(
      'href',
      '/pre-cadastro?view=dados&alunoId=student-1'
    );
    expect(screen.getByText('Fluxo canônico do pré-cadastro')).toBeInTheDocument();
  });

  it('mantém READY_FOR_ENROLLMENT somente para leitura e preserva Anamnese e PAR-Q', () => {
    mocks.summaryState = {
      status: 'open',
      session: {
        ...baseSession,
        status: 'READY_FOR_ENROLLMENT',
        completedAt: '2026-08-01T12:30:00.000Z',
      },
      parq: null,
    };

    renderPortal();

    expect(
      screen.getByRole('heading', { name: /Pré-cadastro concluído e em análise/i })
    ).toBeInTheDocument();
    expect(screen.queryByText('Fluxo canônico do pré-cadastro')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Iniciar' })).toHaveAttribute(
      'href',
      '/pre-cadastro/anamnese?alunoId=student-1'
    );
    expect(screen.getByRole('link', { name: 'Continuar' })).toHaveAttribute(
      'href',
      '/pre-cadastro/par-q?alunoId=student-1'
    );
  });

  it('não oferece continuidade quando o processo foi descartado', () => {
    mocks.summaryState = { status: 'discarded' };

    renderPortal();

    expect(screen.getByRole('heading', { name: 'Processo encerrado' })).toBeInTheDocument();
    expect(screen.queryByText('Fluxo canônico do pré-cadastro')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Continuar pré-cadastro/i })).not.toBeInTheDocument();
  });
});

describe('PreRegistrationDataSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listProcesses.mockResolvedValue([
      {
        alunoId: 'student-1',
        status: 'PRE_REGISTRATION_COMPLETED',
      },
    ]);
    mocks.getSession.mockResolvedValue({
      ...baseSession,
      status: 'PRE_REGISTRATION_COMPLETED',
      completedAt: '2026-08-01T12:30:00.000Z',
    });
  });

  it('carrega somente o registro vinculado e exibe resumo cadastral não editável', async () => {
    render(
      <MemoryRouter initialEntries={['/pre-cadastro?view=dados&alunoId=student-1']}>
        <PreRegistrationDataSummary />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('heading', { name: 'Seus dados cadastrais' })
    ).toBeInTheDocument();
    expect(mocks.getSession).toHaveBeenCalledWith('student-1');
    expect(screen.getByText('Aluno Teste')).toBeInTheDocument();
    expect(screen.getByText(/somente para leitura/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para início' })).toHaveAttribute(
      'href',
      '/inicio'
    );
    expect(screen.getByRole('link', { name: 'Voltar para pré-cadastro' })).toHaveAttribute(
      'href',
      '/pre-cadastro'
    );
  });

  it('não consulta um alunoId que não pertence aos processos autenticados', async () => {
    render(
      <MemoryRouter initialEntries={['/pre-cadastro?view=dados&alunoId=foreign-student']}>
        <PreRegistrationDataSummary />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('heading', { name: 'Não foi possível abrir o pré-cadastro' })
    ).toBeInTheDocument();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it('orienta continuar o pré-cadastro quando os dados básicos ainda não foram concluídos', async () => {
    mocks.listProcesses.mockResolvedValue([
      { alunoId: 'student-1', status: 'PRE_REGISTRATION_IN_PROGRESS' },
    ]);
    mocks.getSession.mockResolvedValue(baseSession);

    render(
      <MemoryRouter initialEntries={['/pre-cadastro?view=dados&alunoId=student-1']}>
        <PreRegistrationDataSummary />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('heading', { name: 'Seu pré-cadastro ainda está em andamento' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continuar pré-cadastro' })).toHaveAttribute(
      'href',
      '/pre-cadastro'
    );
  });
});
