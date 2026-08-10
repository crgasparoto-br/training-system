import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRE_REGISTRATION_DISABLED_EVENT } from '../config/pre-registration-availability';
import type { PreRegistrationAudience } from './PreRegistrationUnavailable';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../services/api', () => ({
  default: { get: mocks.get },
}));

import { PreRegistrationAvailabilityBoundary } from './PreRegistrationAvailabilityBoundary';

function renderBoundary(audience: PreRegistrationAudience = 'public') {
  return render(
    <MemoryRouter>
      <PreRegistrationAvailabilityBoundary audience={audience}>
        <div>Conteúdo protegido pela disponibilidade</div>
      </PreRegistrationAvailabilityBoundary>
    </MemoryRouter>
  );
}

function disabledResponse() {
  return {
    status: 503,
    data: {
      error: 'PRE_REGISTRATION_DISABLED',
      message: 'O pré-cadastro está temporariamente indisponível.',
    },
  };
}

function enabledResponse() {
  return { status: 204, data: undefined };
}

describe('PreRegistrationAvailabilityBoundary', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    vi.stubEnv('VITE_API_URL', 'http://127.0.0.1:3002');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the public invite unavailable state without raw codes or contradictory guidance', async () => {
    mocks.get.mockResolvedValueOnce(disabledResponse());

    renderBoundary('public');

    expect(
      await screen.findByRole('heading', { name: /Pré-matrícula temporariamente indisponível/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/O link não pode ser utilizado neste momento/i)).toBeInTheDocument();
    expect(screen.queryByText(/Seu progresso permanece salvo/i)).not.toBeInTheDocument();
    expect(screen.queryByText('PRE_REGISTRATION_DISABLED')).not.toBeInTheDocument();
    expect(screen.queryByText(/Solicite um novo convite/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Conteúdo protegido/i)).not.toBeInTheDocument();
  });

  it('renders authenticated resume guidance without referring to a public link', async () => {
    mocks.get.mockResolvedValueOnce(disabledResponse());

    renderBoundary('authenticated');

    expect(
      await screen.findByRole('heading', { name: /Pré-matrícula temporariamente indisponível/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Seu progresso permanece salvo/i)).toBeInTheDocument();
    expect(screen.queryByText(/O link não pode ser utilizado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nenhum cadastro ou convite existente foi apagado/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voltar ao início/i })).toBeInTheDocument();
  });

  it('fails closed for every non-canonical availability response', async () => {
    for (const response of [
      { status: 200, data: { enabled: true } },
      { status: 401, data: { error: 'Unauthorized' } },
      { status: 500, data: { error: 'Internal Server Error' } },
    ]) {
      mocks.get.mockResolvedValueOnce(response);
      const rendered = renderBoundary('administrative');
      expect(
        await screen.findByRole('heading', { name: /Pré-matrícula temporariamente indisponível/i })
      ).toBeInTheDocument();
      expect(screen.queryByText(/Conteúdo protegido/i)).not.toBeInTheDocument();
      rendered.unmount();
    }
  });

  it('fails closed when the availability probe cannot be completed', async () => {
    mocks.get.mockRejectedValueOnce(new Error('Network Error'));
    renderBoundary('administrative');

    expect(
      await screen.findByRole('heading', { name: /Pré-matrícula temporariamente indisponível/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Conteúdo protegido/i)).not.toBeInTheDocument();
  });

  it('enables the consumer only after the canonical 204 response', async () => {
    mocks.get.mockResolvedValueOnce(enabledResponse());
    renderBoundary();
    expect(await screen.findByText(/Conteúdo protegido/i)).toBeInTheDocument();
  });

  it('blocks same-origin consumers until the availability probe resolves', async () => {
    vi.stubEnv('VITE_API_URL', '');
    let resolveProbe: ((value: ReturnType<typeof disabledResponse>) => void) | undefined;
    mocks.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveProbe = resolve;
        })
    );

    renderBoundary('administrative');

    expect(screen.getByRole('status')).toHaveAttribute(
      'data-pre-registration-availability',
      'checking'
    );
    expect(screen.queryByText(/Conteúdo protegido/i)).not.toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('/pre-registration/availability', {
      validateStatus: expect.any(Function),
    });

    await act(async () => {
      resolveProbe?.(disabledResponse());
    });

    expect(
      await screen.findByRole('heading', { name: /Pré-matrícula temporariamente indisponível/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Conteúdo protegido/i)).not.toBeInTheDocument();
  });

  it('replaces an enabled administrative surface when a later request reports the feature disabled', async () => {
    mocks.get.mockResolvedValueOnce(enabledResponse());
    renderBoundary('administrative');
    expect(await screen.findByText(/Conteúdo protegido/i)).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event(PRE_REGISTRATION_DISABLED_EVENT));
    });

    expect(
      await screen.findByRole('heading', { name: /Pré-matrícula temporariamente indisponível/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Nenhum cadastro ou convite existente foi apagado/i)).toBeInTheDocument();
    expect(screen.queryByText(/O link não pode ser utilizado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Seu progresso permanece salvo/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voltar ao início/i })).toBeInTheDocument();
  });
});
