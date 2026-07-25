import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  getHealthIntake: vi.fn(),
  saveHealthIntakeStep: vi.fn(),
  completeHealthIntake: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: () => ({ isAuthenticated: true }),
}));

vi.mock('../../services/pre-registration-public.service', () => ({
  preRegistrationPublicService: {
    getHealthIntake: mocks.getHealthIntake,
    saveHealthIntakeStep: mocks.saveHealthIntakeStep,
    completeHealthIntake: mocks.completeHealthIntake,
  },
}));

import { HealthIntake } from './HealthIntake';

const baseSession = {
  alunoId: 'student-1',
  status: 'NOT_STARTED',
  version: 1,
  currentStep: 'CONSENT',
  formVersion: 'health-intake-v1',
  answers: {},
  consent: {
    requiredVersion: '2026-07',
  },
  respondent: {
    role: 'STUDENT',
    userId: 'user-1',
  },
  migratedFromLegacy: false,
  migrationReviewRequired: false,
  tenant: {
    name: 'Academia Teste',
    privacyNoticeUrl: 'https://example.com/privacy',
  },
};

describe('HealthIntake', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.getHealthIntake.mockReset();
    mocks.saveHealthIntakeStep.mockReset();
    mocks.completeHealthIntake.mockReset();
    mocks.getHealthIntake.mockResolvedValue(baseSession);
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/pre-cadastro/anamnese?alunoId=student-1']}>
        <HealthIntake />
      </MemoryRouter>
    );
  }

  it('does not persist health answers before explicit consent', async () => {
    renderPage();

    await screen.findByRole('heading', { name: /Privacidade e consentimento/i });
    expect(screen.getByRole('button', { name: /Salvar e avançar/i })).toBeDisabled();
    expect(mocks.saveHealthIntakeStep).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: /Salvar e avançar/i })).not.toBeDisabled();
  });

  it('resumes at the persisted step with server answers', async () => {
    mocks.getHealthIntake.mockResolvedValue({
      ...baseSession,
      status: 'IN_PROGRESS',
      version: 4,
      currentStep: 'MEDICATIONS',
      answers: {
        mainGoal: 'Voltar a correr',
        hasMedicalConditions: false,
      },
      consent: {
        requiredVersion: '2026-07',
        acceptedVersion: '2026-07',
        acceptedAt: '2026-07-25T00:00:00.000Z',
      },
    });

    renderPage();

    await screen.findByRole('heading', { name: /Medicações e alergias/i });
    expect(screen.getByText(/Etapa 3 de 6/i)).toBeInTheDocument();
  });

  it('shows an explicit reload action instead of overwriting a concurrent edit', async () => {
    mocks.saveHealthIntakeStep.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: 'Conflito de versão',
          details: { code: 'CONCURRENT_MODIFICATION', currentVersion: 2 },
        },
      },
    });

    renderPage();
    await screen.findByRole('heading', { name: /Privacidade e consentimento/i });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Salvar e avançar/i }));

    expect(await screen.findByRole('button', { name: /Recarregar versão mais recente/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/alterada em outro acesso/i);

    fireEvent.click(screen.getByRole('button', { name: /Recarregar versão mais recente/i }));
    await waitFor(() => expect(mocks.getHealthIntake).toHaveBeenCalledTimes(2));
  });
});
