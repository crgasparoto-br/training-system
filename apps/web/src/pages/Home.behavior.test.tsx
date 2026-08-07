import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
import { AuthenticatedPreRegistrationPortal } from './PublicPreRegistration/AuthenticatedPreRegistrationPortal';

const baseSession = {
  alunoId: 'aluno-1',
  status: 'PRE_REGISTRATION_IN_PROGRESS',
  version: 1,
  currentStep: 'IDENTIFICATION',
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
      status: 'NOT_STARTED',
      action: 'START',
      href: '/pre-cadastro/anamnese?alunoId=aluno-1',
    },
    {
      key: 'PARQ',
      title: 'Responder PAR-Q',
      description: 'Responda o questionário.',
      optional: true,
      status: 'NOT_STARTED',
      action: 'START',
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

function renderLeadRoundTrip(initialEntry: { pathname: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/inicio" element={<Home />} />
        <Route
          path="/pre-cadastro"
          element={
            <AuthenticatedPreRegistrationPortal>
              <div>Fluxo canônico do pré-cadastro</div>
            </AuthenticatedPreRegistrationPortal>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('Home - roteamento entre professor/gestor e lead de pré-matrícula', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra os atalhos padrão para usuário do tipo professor, sem chamar o fluxo de pré-matrícula', async () => {
    mocks.user = { id: 'p1', type: 'professor', professor: { role: 'master' } };

    renderHome();

    expect(await screen.findByText('Central do Aluno')).toBeInTheDocument();
    expect(mocks.listProcesses).not.toHaveBeenCalled();
  });

  it('não cai silenciosamente em "Nenhuma rotina liberada" quando o aluno é um lead válido cujo carregamento falha', async () => {
    mocks.user = { id: 'a1', type: 'aluno' };
    mocks.listProcesses.mockRejectedValue({ response: { data: { error: 'Falha de rede' } } });

    renderHome();

    expect(await screen.findByText('Falha de rede')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma rotina liberada')).not.toBeInTheDocument();
  });

  it('mostra a home genérica quando o aluno não possui nenhum processo de pré-matrícula', async () => {
    mocks.user = { id: 'a1', type: 'aluno' };
    mocks.listProcesses.mockResolvedValue([]);

    renderHome();

    expect(await screen.findByText('Nenhuma rotina liberada')).toBeInTheDocument();
  });

  it('bloqueia Anamnese e PAR-Q e orienta concluir o cadastro quando o cadastro básico está incompleto', async () => {
    mocks.user = { id: 'a1', type: 'aluno' };
    mocks.listProcesses.mockResolvedValue([
      { alunoId: 'aluno-1', status: 'PRE_REGISTRATION_IN_PROGRESS' },
    ]);
    mocks.getSession.mockResolvedValue(baseSession);

    renderHome();

    expect(await screen.findByText('Continuar cadastro')).toBeInTheDocument();
    expect(screen.getAllByText('Concluir cadastro primeiro')).toHaveLength(2);
    expect(mocks.getParq).not.toHaveBeenCalled();
  });

  it('permite consulta não editável após PRE_REGISTRATION_COMPLETED', async () => {
    mocks.user = { id: 'a1', type: 'aluno' };
    mocks.listProcesses.mockResolvedValue([
      { alunoId: 'aluno-1', status: 'PRE_REGISTRATION_COMPLETED' },
    ]);
    mocks.getSession.mockResolvedValue({ ...baseSession, status: 'PRE_REGISTRATION_COMPLETED' });
    mocks.getParq.mockResolvedValue({ alunoId: 'aluno-1', status: 'NOT_STARTED' });

    renderHome();

    expect(await screen.findByText('Ver meus dados')).toBeInTheDocument();
  });

  it('mantém a home do lead e libera Anamnese/PAR-Q em READY_FOR_ENROLLMENT', async () => {
    mocks.user = { id: 'a1', type: 'aluno' };
    mocks.listProcesses.mockResolvedValue([
      { alunoId: 'aluno-1', status: 'READY_FOR_ENROLLMENT' },
    ]);
    mocks.getSession.mockResolvedValue({ ...baseSession, status: 'READY_FOR_ENROLLMENT' });
    mocks.getParq.mockResolvedValue({ alunoId: 'aluno-1', status: 'NOT_STARTED' });

    renderHome();

    expect(
      await screen.findByText('Cadastro básico concluído, em análise para matrícula')
    ).toBeInTheDocument();
    expect(screen.getByText('Ver meus dados')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Responder Anamnese' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Responder PAR-Q' })).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma rotina liberada')).not.toBeInTheDocument();
    expect(mocks.getParq).toHaveBeenCalledWith('aluno-1');
  });

  it('mantém o mesmo registro canônico no ciclo /inicio → /pre-cadastro → /inicio com dois processos vinculados', async () => {
    mocks.user = { id: 'a1', type: 'aluno' };
    mocks.listProcesses.mockResolvedValue([
      { alunoId: 'aluno-1', status: 'PRE_REGISTRATION_COMPLETED' },
      { alunoId: 'aluno-2', status: 'PRE_REGISTRATION_COMPLETED' },
    ]);
    mocks.getSession.mockImplementation((alunoId: string) =>
      Promise.resolve({ ...baseSession, alunoId, status: 'PRE_REGISTRATION_COMPLETED' })
    );
    mocks.getParq.mockImplementation((alunoId: string) =>
      Promise.resolve({ alunoId, status: 'NOT_STARTED' })
    );

    renderLeadRoundTrip({ pathname: '/inicio', state: { preferredAlunoId: 'aluno-2' } });

    expect(await screen.findByText('Ver meus dados')).toBeInTheDocument();
    expect(mocks.getSession).toHaveBeenCalledWith('aluno-2');
    expect(mocks.getSession).not.toHaveBeenCalledWith('aluno-1');

    fireEvent.click(screen.getByRole('link', { name: 'Ver meus dados' }));
    expect(await screen.findByRole('heading', { name: 'Dados cadastrais' })).toBeInTheDocument();

    mocks.getSession.mockClear();
    fireEvent.click(screen.getByRole('link', { name: 'Voltar para início' }));

    expect(await screen.findByText('Ver meus dados')).toBeInTheDocument();
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledWith('aluno-2'));
    expect(mocks.getSession).not.toHaveBeenCalledWith('aluno-1');
  });

  it('mostra estado de análise profissional necessária para o PAR-Q sem sugerir liberação clínica', async () => {
    mocks.user = { id: 'a1', type: 'aluno' };
    mocks.listProcesses.mockResolvedValue([
      { alunoId: 'aluno-1', status: 'PRE_REGISTRATION_COMPLETED' },
    ]);
    mocks.getSession.mockResolvedValue({ ...baseSession, status: 'PRE_REGISTRATION_COMPLETED' });
    mocks.getParq.mockResolvedValue({
      alunoId: 'aluno-1',
      status: 'COMPLETED_REVIEW_REQUIRED',
    });

    renderHome();

    expect(await screen.findByText('Análise profissional necessária')).toBeInTheDocument();
    expect(
      screen.getByText(/não significa reprovação da matrícula nem liberação para exercício/)
    ).toBeInTheDocument();
  });

  it('não oferece ações de continuidade quando o processo está DISCARDED', async () => {
    mocks.user = { id: 'a1', type: 'aluno' };
    mocks.listProcesses.mockResolvedValue([{ alunoId: 'aluno-1', status: 'DISCARDED' }]);

    renderHome();

    expect(await screen.findByText('Processo encerrado')).toBeInTheDocument();
    expect(screen.queryByText('Continuar cadastro')).not.toBeInTheDocument();
    expect(screen.queryByText('Responder Anamnese')).not.toBeInTheDocument();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it('usa a home normal quando o processo já é ACTIVE_STUDENT', async () => {
    mocks.user = { id: 'a1', type: 'aluno' };
    mocks.listProcesses.mockResolvedValue([{ alunoId: 'aluno-1', status: 'ACTIVE_STUDENT' }]);

    renderHome();

    expect(await screen.findByText('Nenhuma rotina liberada')).toBeInTheDocument();
    expect(screen.queryByText('Seu processo de pré-matrícula')).not.toBeInTheDocument();
  });
});
