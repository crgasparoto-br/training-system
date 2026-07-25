import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthResponse } from '@corrida/types';
import { authService } from '../services/auth.service';
import { writeDraft } from '../pages/PublicPreRegistration/preRegistrationDraft';
import { useAuthStore } from './useAuthStore';

function authResponse(userId: string): AuthResponse {
  return {
    token: `token-${userId}`,
    user: {
      id: userId,
      email: `${userId}@example.com`,
      name: userId,
      type: 'aluno',
      profile: null,
    },
  } as AuthResponse;
}

describe('useAuthStore pre-registration draft isolation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it('clears all pre-registration drafts when the authenticated account changes', () => {
    useAuthStore.getState().setAuthenticatedSession(authResponse('user-a'));
    writeDraft({ form: { name: 'Rascunho A' }, step: 'IDENTIFICATION', baseVersion: 1 }, 'student-1');
    expect(window.sessionStorage.length).toBe(1);

    useAuthStore.getState().setAuthenticatedSession(authResponse('user-b'));

    expect(window.sessionStorage.length).toBe(0);
  });

  it('clears all pre-registration drafts on logout even if the API logout fails', async () => {
    useAuthStore.getState().setAuthenticatedSession(authResponse('user-a'));
    writeDraft({ form: { name: 'Rascunho A' }, step: 'IDENTIFICATION', baseVersion: 1 }, 'student-1');
    vi.spyOn(authService, 'logout').mockRejectedValue(new Error('network'));

    await useAuthStore.getState().logout();

    expect(window.sessionStorage.length).toBe(0);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
