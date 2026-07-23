import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  routeToken: undefined as string | undefined,
  getSession: vi.fn(),
  saveStep: vi.fn(),
  lookupCep: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useParams: () => (mocks.routeToken ? { token: mocks.routeToken } : {}),
  };
});

vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    user: { id: 'guardian-1', email: 'guardian@example.com', type: 'aluno' },
  }),
}));

vi.mock('../../services/pre-registration-public.service', () => ({
  preRegistrationPublicService: {
    getSession: mocks.getSession,
    saveStep: mocks.saveStep,
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

const baseSession = {
  status: 'PRE_REGISTRATION_IN_PROGRESS',
  version: 1,
  currentStep: 'IDENTIFICATION',
  isMinor: false,
  claimRole: 'STUDENT',
  identity: { name: 'Aluno Teste' },
  tenant: { name: 'Academia Teste', privacyNoticeUrl: 'https://example.com/privacy' },
  privacy: { noticeUrl: 'https://example.com/privacy', noticeVersion: '2026-07' },
  missingRequiredFields: [],
  duplicateWarnings: [],
  nextSteps: [],
};

describe('PublicPreRegistration - resiliência de rede e sessão', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.getSession.mockReset();
    mocks.saveStep.mockReset();
    mocks.lookupCep.mockReset();
    window.sessionStorage.clear();
  });

  async function goToAddressStep() {
    await screen.findByLabelText(/Nome completo/i);
    fireEvent.click(await screen.findByRole('button', { name: /Endereço/i }));
    return screen.findByLabelText(/^CEP$/i);
  }

  it('preserves the typed field and allows retry when saving fails due to a network error', async () => {
    mocks.getSession.mockResolvedValue(baseSession);
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

    // O campo preenchido continua visível e editável para nova tentativa --
    // a falha de rede não deve descartar o que já foi digitado.
    expect((screen.getByLabelText(/Nome completo/i) as HTMLInputElement).value).toBe(
      'Novo Nome Digitado'
    );
    expect(screen.getByRole('button', { name: /Salvar e avançar/i })).not.toBeDisabled();
  });

  it('persists an unsaved draft to sessionStorage and restores it on the next mount (session expiry)', async () => {
    mocks.getSession.mockResolvedValue(baseSession);

    const first = render(
      <MemoryRouter>
        <PublicPreRegistration />
      </MemoryRouter>
    );

    const nameInput = await screen.findByLabelText(/Nome completo/i);
    fireEvent.change(nameInput, { target: { value: 'Rascunho Não Salvo' } });

    await waitFor(() => {
      const raw = window.sessionStorage.getItem(DRAFT_KEY);
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw as string).form.name).toBe('Rascunho Não Salvo');
    });

    // Simula reautenticação após expiração de sessão: novo mount, mesma
    // sessionStorage (um redirecionamento de página inteira preserva
    // sessionStorage, ao contrário do estado React em memória).
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
    mocks.getSession.mockResolvedValue(baseSession);
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
    mocks.getSession.mockResolvedValue(baseSession);
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

    const streetInput = screen.getByLabelText(/^Rua$/i) as HTMLInputElement;
    expect(streetInput).not.toBeDisabled();
    fireEvent.change(streetInput, { target: { value: 'Preenchimento manual' } });
    expect(streetInput.value).toBe('Preenchimento manual');
  });

  it('never persists cpf or birthDate to sessionStorage while editing the identification step', async () => {
    mocks.getSession.mockResolvedValue(baseSession);

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
      const raw = window.sessionStorage.getItem(DRAFT_KEY);
      expect(raw).toBeTruthy();
      expect(raw).not.toContain('123.456.789-00');
      expect(raw).not.toContain('1990-01-01');
      const stored = JSON.parse(raw as string);
      expect(stored.form.cpf).toBeUndefined();
      expect(stored.form.birthDate).toBeUndefined();
    });
  });
});
