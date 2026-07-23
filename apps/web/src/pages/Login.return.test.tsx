import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  login: vi.fn(),
  clearError: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: () => ({
    login: mocks.login,
    clearError: mocks.clearError,
    error: null,
  }),
}));

import { Login } from './Login';

describe('Login local return path', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.login.mockReset();
    mocks.clearError.mockReset();
    mocks.login.mockResolvedValue(undefined);
  });

  async function submitAt(entry: string) {
    render(
      <MemoryRouter initialEntries={[entry]}>
        <Login />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'aluno@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/senha/i), {
      target: { value: 'senha-segura' },
    });
    fireEvent.submit(document.querySelector('#login-form') as HTMLFormElement);
    await waitFor(() => expect(mocks.login).toHaveBeenCalled());
  }

  it('returns to the authenticated pre-registration flow after login', async () => {
    await submitAt('/login?returnTo=%2Fpre-cadastro');
    expect(mocks.navigate).toHaveBeenCalledWith('/pre-cadastro', { replace: true });
  });

  it('rejects protocol-relative return paths', async () => {
    await submitAt('/login?returnTo=%2F%2Fevil.example');
    expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true });
  });
});