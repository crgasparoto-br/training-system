import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  setAuthenticatedSession: vi.fn(),
  clearDraft: vi.fn(),
}));

vi.mock('./api', () => ({
  default: {
    get: mocks.get,
    post: mocks.post,
    patch: mocks.patch,
  },
}));

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: {
    getState: () => ({
      setAuthenticatedSession: mocks.setAuthenticatedSession,
    }),
  },
}));

vi.mock('../pages/PublicPreRegistration/preRegistrationDraft', () => ({
  clearDraft: mocks.clearDraft,
}));

import { preRegistrationPublicService } from './pre-registration-public.service';

describe('preRegistrationPublicService', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.patch.mockReset();
    mocks.setAuthenticatedSession.mockReset();
    mocks.clearDraft.mockReset();
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

  it.each([
    ['session', () => preRegistrationPublicService.getSession('minor-student'), mocks.get],
    [
      'save',
      () => preRegistrationPublicService.saveStep('minor-student', {
        expectedVersion: 1,
        step: 'CONTACT',
        data: { email: 'guardian@example.com' },
      }),
      mocks.patch,
    ],
    [
      'complete',
      () => preRegistrationPublicService.complete('minor-student', {
        expectedVersion: 1,
        privacyAccepted: true,
      }),
      mocks.post,
    ],
  ])('clears the scoped draft after authoritative %s denial', async (_label, invoke, requestMock) => {
    requestMock.mockRejectedValue({
      response: { status: 404, data: { details: { code: 'NOT_FOUND' } } },
    });

    await expect(invoke()).rejects.toBeTruthy();

    expect(mocks.clearDraft).toHaveBeenCalledWith('minor-student');
  });

  it('keeps the draft after a temporary network failure', async () => {
    mocks.patch.mockRejectedValue(new Error('network unavailable'));

    await expect(
      preRegistrationPublicService.saveStep('minor-student', {
        expectedVersion: 1,
        step: 'CONTACT',
        data: { email: 'guardian@example.com' },
      })
    ).rejects.toThrow('network unavailable');

    expect(mocks.clearDraft).not.toHaveBeenCalled();
  });
});
