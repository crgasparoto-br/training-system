import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  setAuthenticatedSession: vi.fn(),
}));

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: mocks.post,
    patch: vi.fn(),
  },
}));

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: {
    getState: () => ({
      setAuthenticatedSession: mocks.setAuthenticatedSession,
    }),
  },
}));

import { preRegistrationPublicService } from './pre-registration-public.service';

describe('preRegistrationPublicService.registerAndClaim', () => {
  beforeEach(() => {
    mocks.post.mockReset();
    mocks.setAuthenticatedSession.mockReset();
  });

  it('opens the authenticated application session before returning the claim result', async () => {
    const response = {
      token: 'invite-session-token',
      user: {
        id: 'guardian-user',
        email: 'guardian@example.com',
        name: 'Responsável Legal',
        type: 'aluno' as const,
        profile: null,
      },
      alunoId: 'minor-student',
      redirectTo: '/pre-cadastro' as const,
    };
    mocks.post.mockResolvedValue({ data: { success: true, data: response } });

    await expect(
      preRegistrationPublicService.registerAndClaim('safe-token', {
        name: 'Responsável Legal',
        email: 'guardian@example.com',
        password: 'senha-segura',
        role: 'GUARDIAN',
      })
    ).resolves.toEqual(response);

    expect(mocks.post).toHaveBeenCalledWith('/pre-cadastro/safe-token/register', {
      name: 'Responsável Legal',
      email: 'guardian@example.com',
      password: 'senha-segura',
      role: 'GUARDIAN',
    });
    expect(mocks.setAuthenticatedSession).toHaveBeenCalledTimes(1);
    expect(mocks.setAuthenticatedSession).toHaveBeenCalledWith(response);
  });
});
