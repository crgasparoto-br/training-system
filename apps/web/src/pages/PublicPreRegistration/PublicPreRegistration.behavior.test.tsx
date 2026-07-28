import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  routeToken: undefined as string | undefined,
  open: vi.fn(),
  claim: vi.fn(),
  registerAndClaim: vi.fn(),
  login: vi.fn(),
  listProcesses: vi.fn(),
  getSession: vi.fn(),
  saveStep: vi.fn(),
  requestGuardianAuthorization: vi.fn(),
  complete: vi.fn(),
  lookupCep: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useParams: () => (mocks.routeToken ? { token: mocks.routeToken } : {}),
    useLocation: () => ({ state: null }),
  };
});

vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    login: mocks.login,
    user: { id: 'guardian-1', email: 'guardian@example.com', type: 'aluno' },
  }),
}));

vi.mock('../../services/pre-registration-public.service', () => ({
  preRegistrationPublicService: {
    open: mocks.open,
    claim: mocks.claim,
    registerAndClaim: mocks.registerAndClaim,
    listProcesses: mocks.listProcesses,
    getSession: mocks.getSession,
    saveStep: mocks.saveStep,
    requestGuardianAuthorization: mocks.requestGuardianAuthorization,
    complete: mocks.complete,
  },
}));

vi.mock('../../services/cep.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/cep.service')>(
    '../../services/cep.service'
  );
  return { ...actual, lookupCep: mocks.lookupCep };
});

import { PublicPreRegistration } from './PublicPreRegistration';
import { DRAFT_STORAGE_KEY as DRAFT_KEY } from './preRegistrationDraft';

const baseProcess = {
  alunoId: 'student-1',
  status: 'PRE_REGISTRATION_IN_PROGRESS',
  claimRole: 'STUDENT',
  currentStep: 'IDENTIFICATION',
  displayName: 'Aluno Teste',
  tenant: {
    name: 'Academia Teste',
    privacyNoticeUrl: 'https://example.com/privacy',
  },
  guardianAuthorizationStatus: 'NOT_REQUIRED',
  requiresGuardianConfirmation: false,
};

const baseSession = {
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
  },
  tenant: { name: 'Academia Teste', privacyNoticeUrl: 'https://example.com/privacy' },
  guardianAuthorization: { status: 'NOT_REQUIRED', role: 'STUDENT' },
  privacy: { noticeUrl: 'https://example.com/privacy', noticeVersion: '2026-07' },
  missingRequiredFields: [],
  duplicateWarnings: [],
  nextSteps: [],
};

const scopedDraftKey = `${DRAFT_KEY}:guardian-1:${baseSession.alunoId}`;

describe('PublicPreRegistration - resiliência, seleção e autorização', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.open.mockReset();
    mocks.claim.mockReset();
    mocks.registerAndClaim.mockReset();
    mocks.login.mockReset();
    mocks.listProcesses.mockReset();
    mocks.getSession.mockReset();
    mocks.saveStep.mockReset();
    mocks.requestGuardianAuthorization.mockReset();
    mocks.complete.mockReset();
    mocks.lookupCep.mockReset();
    mocks.routeToken = undefined;
    mocks.login.mockResolvedValue(undefined);
    mocks.listProcesses.mockResolvedValue([baseProcess]);
    mocks.getSession.mockResolvedValue(baseSession);
    window.localStorage.clear();
    window.localStorage.setItem('user', JSON.stringify({ id: 'guardian-1' }));
    window.sessionStorage.clear();
  });

  async function goToAddressStep() {
    await screen.findByLabelText(/Nome completo/i);
    fireEvent.click(await screen.findByRole('button', { name: /Endereço/i }));
    return screen.findByLabelText(/^CEP$/i);
  }

  it('preserves the typed field and allows retry when saving fails due to a network error', async () => {
    mocks.saveStep.mockRejectedValueOnce(new Error('Network Error'));

    render(
      <MemoryRouter>
        <PublicPreRegistration />
      </MemoryRouter>
    );

    const nameInput = await screen.findByLabelText(/Nome completo/i);
    fireEvent.change(nameInput, { target: { value: 'Novo Nome Digitado' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar e avançar/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect((screen.getByLabelText(/Nome completo/i) as HTMLInputElement).value).toBe(
      'Novo Nome Digitado'
    );
    expect(screen.getByRole('button', { name: /Salvar e avançar/i })).not.toBeDisabled();
  });

  it('persists an unsaved draft per process and restores it on the next mount', async () => {
    const first = render(
      <MemoryRouter>
        <PublicPreRegistration />
      </MemoryRouter>
    );

    const nameInput = await screen.findByLabelText(/Nome completo/i);
    fireEvent.change(nameInput, { target: { value: 'Rascunho Não Salvo' } });

    await waitFor(() => {
      const raw = window.sessionStorage.getItem(scopedDraftKey);
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw as string)).toMatchObject({
        form: { name: 'Rascunho Não Salvo' },
        baseVersion: 1,
      });
    });

    first.unmount();
    render(
      <MemoryRouter>
        <PublicPreRegistration />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect((screen.getByLabelText(/Nome completo/i) as HTMLInputElement).value).toBe(
        'Rascunho Não Salvo'
      );
    });
  });

  it('autofills street, neighborhood, city and state when the CEP lookup succeeds', async () => {
    mocks.lookupCep.mockResolvedValue({
      street: 'Rua das Flores',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
    });

    render(
      <MemoryRouter>
        <PublicPreRegistration />
      </MemoryRouter>
    );

    const cepInput = await goToAddressStep();
    fireEvent.change(cepInput, { target: { value: '01001000' } });
    fireEvent.blur(cepInput);

    await waitFor(() => {
      expect((screen.getByLabelText(/^Rua$/i) as HTMLInputElement).value).toBe('Rua das Flores');
    });
    expect((screen.getByLabelText(/^Bairro$/i) as HTMLInputElement).value).toBe('Centro');
    expect((screen.getByLabelText(/^Cidade$/i) as HTMLInputElement).value).toBe('São Paulo');
    expect((screen.getByLabelText(/^UF$/i) as HTMLInputElement).value).toBe('SP');
  });

  it('shows an error but keeps address fields editable when the CEP lookup fails', async () => {
    mocks.lookupCep.mockRejectedValue(new Error('Não foi possível consultar o CEP'));

    render(
      <MemoryRouter>
        <PublicPreRegistration />
      </MemoryRouter>
    );

    const cepInput = await goToAddressStep();
    fireEvent.change(cepInput, { target: { value: '99999999' } });
    fireEvent.blur(cepInput);

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível consultar o CEP/i)).toBeInTheDocument();
    });

    expect(cepInput).toHaveAttribute('aria-describedby', 'pre-registration-addressZipCode-error');

    const streetInput = screen.getByLabelText(/^Rua$/i) as HTMLInputElement;
    expect(streetInput).not.toBeDisabled();
    fireEvent.change(streetInput, { target: { value: 'Preenchimento manual' } });
    expect(streetInput.value).toBe('Preenchimento manual');
  });

  it('never persists cpf or birthDate to sessionStorage', async () => {
    render(
      <MemoryRouter>
        <PublicPreRegistration />
      </MemoryRouter>
    );

    const cpfInput = await screen.findByLabelText(/^CPF/i);
    fireEvent.change(cpfInput, { target: { value: '123.456.789-00' } });
    const birthDateInput = screen.getByLabelText(/Data de nascimento/i);
    fireEvent.change(birthDateInput, { target: { value: '1990-01-01' } });

    await waitFor(() => {
      const raw = window.sessionStorage.getItem(scopedDraftKey);
      expect(raw).toBeTruthy();
      expect(raw).not.toContain('123.456.789-00');
      expect(raw).not.toContain('1990-01-01');
      const stored = JSON.parse(raw as string);
      expect(stored.form.cpf).toBeUndefined();
      expect(stored.form.birthDate).toBeUndefined();
    });
  });


  it('does not restore a stale draft over a newer server version without explicit reconciliation', async () => {
    window.sessionStorage.setItem(
      scopedDraftKey,
      JSON.stringify({
        form: { name: 'Nome local antigo' },
        step: 'IDENTIFICATION',
        baseVersion: 1,
      })
    );
    mocks.getSession.mockResolvedValueOnce({
      ...baseSession,
      version: 2,
      identity: { ...baseSession.identity, name: 'Nome alterado pela academia' },
    });

    render(
      <MemoryRouter>
        <PublicPreRegistration />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /Escolha quais dados/i })).toBeInTheDocument();
    expect(screen.getByText('Nome alterado pela academia')).toBeInTheDocument();
    expect(screen.getByText('Nome local antigo')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Nome completo/i)).not.toBeInTheDocument();
  });

  it('reconciles a concurrent change field by field and saves with the fresh version', async () => {
    mocks.saveStep
      .mockRejectedValueOnce({
        response: {
          data: {
            error: 'Os dados foram alterados em outro local.',
            details: { code: 'CONCURRENT_MODIFICATION' },
          },
        },
      })
      .mockResolvedValueOnce({ ...baseSession, version: 3 });
    mocks.getSession
      .mockResolvedValueOnce(baseSession)
      .mockResolvedValueOnce({
        ...baseSession,
        version: 2,
        identity: { ....baseSession.identity, name: 'Nome da academia' },
      });

    render(
      <MemoryRouter>
        <PublicPreRegistration />
      </MemoryRouter>
    );

    const nameInput = await screen.findByLabelText(/Nome completo/i);
    fireEvent.change(nameInput, { target: { value: 'Nome escolhido pelo aluno' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar e avançar/i }));

    expect(await screen.findByRole('heading', { name: /Escolha quais dados/i })).toBeInTheDocument();
    const localOption = screen.getByRole('radio', { name: /Meu rascunho/i });
    fireEvent.click(localOption);
    fireEvent.click(screen.getByRole('button', { name: /Aplicar minhas escolhas/i }));

    expect((await screen.findByLabelText(/Nome completo/i) as HTMLInputElement).value).toBe(
      'Nome escolhido pelo aluno',
    );
    fireEvent.click(screen.getByRole('button', { name: /Salvar e avançar/i }));

    await waitFor(() => {
      expect(mocks.saveStep).toHaveBeenLastCalledWith(
        'student-1',
        expect.objectContaining({
          expectedVersion: 2,
          data: expect.objectContaining({ name: 'Nome escolhido pelo aluno' }),
        })
      );
    });
  });

  it('shows optional alternative contact fields', async () => {
    render(
      <MemoryRouter>
        <PublicPreRegistration />
      </MemoryRouter>
    );
    await screen.findByLabelText(/Nome completo/i);
    fireEvent.click(screen.getByRole('button', { name: /Contato/i }));
    expect(await screen.findByLabelText(/Telefone alternativo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/E-mail alternativo/i)).toBeInTheDocument();
  });

  it('moves focus to a public submission error', async () => {
    mocks.routeToken = 'valid-token';
    mocks.open.mockResolvedValueOnce({
      tenant: {
        name: 'Academia Teste',
        privacyNoticeUrl: 'https://example.com/privacy',
      },
      stages: [],
      approximateDuration: '5 minutos',
      expiresAt: '2026-08-30T12:00:00.000Z',
    });
    mocks.registerAndClaim.mockRejectedValueOnce({
      response: { data: { error: 'Não foi possível criar o acesso.' } },
    });

    render(
      <MemoryRouter>
        <PublicPreRegistration />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('tab', { name: /Criar acesso/i }));
    fireEvent.click(screen.getByRole('radio', { name: /Responsável legal/i }));
    fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'Responsável' } });
    fireEvent.change(screen.getByLabelText(/^E-mail$/i), {
      target: { value: 'responsavel@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Senha$/i), { target: { value: 'senha-segura' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar acesso e continuar/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Não foi possível criar o acesso/i);
    expect(document.activeElement).toBe(alert);
  });

  it('keeps invalid invite messaging actionable', async () => {
    mocks.routeToken = 'invalid-token';
    mocks.open.mockRejectedValueOnce({ response: { data: { error: 'Link inválido ou expirado.' } } });

    render(
      <MemoryRouter>
        <PublicPreRegistration />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Link inválido ou expirado/i)).toBeInTheDocument();
    expect(screen.getByText(/Solicite um novo convite à academia/i)).toBeInTheDocument();
  });

  it('requires an explicit process selection when one account has multiple dependents', async () => {
    mocks.listProcesses.mockResolvedValue([
      baseProcess,
      {
        ...baseProcess,
        alunoId: 'student-2',
        claimRole: 'GUARDIAN',
        displayName: 'Dependente Dois',
        guardianAuthorizationStatus: 'ACTIVE',
      },
    ]);

    render(
      <MemoryRouter>
        <PublicPreRegistration />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /Escolha o cadastro/i })).toBeInTheDocument();
    expect(mocks.getSession).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Dependente Dois/i }));
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledWith('student-2'));
  });

  it('keeps minor data blocked after declaration until academy approval', async () => {
    const pendingProcess = {
      ...baseProcess,
      alunoId: 'minor-1',
      claimRole: 'GUARDIAN',
      displayName: 'Dependente convidado',
      guardianAuthorizationStatus: 'PENDING',
      requiresGuardianConfirmation: true,
    };
    mocks.listProcesses.mockResolvedValue([pendingProcess]);
    mocks.requestGuardianAuthorization.mockResolvedValue({
      status: 'PENDING',
      relationship: 'Mãe',
      requestedAt: '2026-07-24T12:00:00.000Z',
      approvalRequired: true,
    });

    render(
      <MemoryRouter>
        <PublicPreRegistration />
      </MemoryRouter>
    );

    const guardianHeading = await screen.findByRole('heading', { name: /Informe seu vínculo/i });
    expect(guardianHeading).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(guardianHeading));
    expect(mocks.getSession).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Vínculo com o menor/i), {
      target: { value: 'Mãe' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Enviar para validação/i }));

    await waitFor(() => {
      expect(mocks.requestGuardianAuthorization).toHaveBeenCalledWith('minor-1', {
        relationship: 'Mãe',
        declarationAccepted: true,
      });
    });
    const awaitingHeading = await screen.findByRole('heading', {
      name: /Aguardando validação da academia/i,
    });
    expect(awaitingHeading).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(awaitingHeading));
    expect(screen.getByText(/dados pessoais do menor continuarão protegidos/i)).toBeInTheDocument();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
});
