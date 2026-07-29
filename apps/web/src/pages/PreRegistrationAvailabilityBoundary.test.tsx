import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRE_REGISTRATION_DISABLED_EVENT } from '../config/pre-registration-availability';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../services/api', () => ({
  default: { get: mocks.get },
}));

import { PreRegistrationAvailabilityBoundary } from './PreRegistrationAvailabilityBoundary';

function renderBoundary(audience: 'public' | 'administrative' = 'public') {
  return render(
    <MemoryRouter>
      <PreRegistrationAvailabilityBoundary audience={audience}>
        <div>Conteúdo protegido pela disponibilidade</div>
      </PreRegistrationAvailabilityBoundary>
    </MemoryRouter>
  );
}

describe('PreRegistrationAvailabilityBoundary', () => {
  beforeEach(() => {
    mocks.get.mockReset();
  });

  it('renders the operational unavailable state for a disabled API without raw codes or contradictory invite guidance', async () => {
    mocks.get.mockResolvedValueOnce({
      status: 503,
      data: {
        error: 'PRE_REGISTRATION_DISABLED',
        message: 'O pré-cadastro está temporariamente indisponível.',
      },
    });

    renderBoundary('public');

    expect(
      await screen.findByRole('heading', { name: /Pré-matrícula temporariamente indisponível/i })
    ).toBeInTheDocument();
    expect(screen.queryByText('PRE_REGISTRATION_DISABLED')).not.toBeInTheDocument();
    expect(screen.queryByText(/Solicite um novo convite/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Conteúdo protegido/i)).not.toBeInTheDocument();
  });

  it('does not confuse an authentication response or a transient probe failure with rollout disablement', async () => {
    mocks.get.mockResolvedValueOnce({ status: 401, data: { error: 'Unauthorized' } });
    const first = renderBoundary();
    expect(await screen.findByText(/Conteúdo protegido/i)).toBeInTheDocument();
    first.unmount();

    mocks.get.mockRejectedValueOnce(new Error('Network Error'));
    renderBoundary();
    expect(await screen.findByText(/Conteúdo protegido/i)).toBeInTheDocument();
  });

  it('replaces an already rendered administrative surface when a later request reports the feature disabled', async () => {
    mocks.get.mockResolvedValueOnce({ status: 403, data: { error: 'FORBIDDEN' } });
    renderBoundary('administrative');
    expect(await screen.findByText(/Conteúdo protegido/i)).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event(PRE_REGISTRATION_DISABLED_EVENT));
    });

    expect(
      await screen.findByRole('heading', { name: /Pré-matrícula temporariamente indisponível/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Nenhum cadastro ou convite existente foi apagado/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voltar ao início/i })).toBeInTheDocument();
  });
});
