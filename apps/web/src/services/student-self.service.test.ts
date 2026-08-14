import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('./api', () => ({
  default: { get: mocks.get, post: mocks.post },
  api: { get: mocks.get, post: mocks.post },
}));

import {
  getStudentContractId,
  studentSelfService,
  withStudentContractContext,
} from './student-self.service';

describe('studentSelfService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('envia x-contract-id nas consultas escopadas do aluno', async () => {
    mocks.get.mockResolvedValue({ data: { data: { hasPendingProfileReview: false } } });

    await studentSelfService.getSummary('contract-1');
    await studentSelfService.getProfileReview('contract-1');
    await studentSelfService.getProfile('contract-1');

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/student/me/summary', {
      headers: { 'x-contract-id': 'contract-1' },
    });
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/student/me/profile-review', {
      headers: { 'x-contract-id': 'contract-1' },
    });
    expect(mocks.get).toHaveBeenNthCalledWith(3, '/student/me/profile', {
      headers: { 'x-contract-id': 'contract-1' },
    });
  });

  it('preserva o vínculo também na listagem de notificações', async () => {
    mocks.get.mockResolvedValue({ data: { data: [] } });

    await studentSelfService.getNotifications('contract-1', 10);

    expect(mocks.get).toHaveBeenCalledWith('/student/me/notifications', {
      headers: { 'x-contract-id': 'contract-1' },
      params: { limit: 10 },
    });
  });

  it('conclui a revisão usando o endpoint atual e o mesmo contexto de vínculo', async () => {
    mocks.post.mockResolvedValue({
      data: { data: { id: 'review-1', status: 'completed_no_changes' } },
    });

    await studentSelfService.completeProfileReview(
      'review-1',
      { noChanges: true },
      'contract-1'
    );

    expect(mocks.post).toHaveBeenCalledWith(
      '/student/me/profile-reviews/review-1/complete',
      { noChanges: true },
      { headers: { 'x-contract-id': 'contract-1' } }
    );
  });

  it('mantém contractId somente em rotas locais controladas pelo fluxo', () => {
    expect(getStudentContractId('?contractId=contract-1')).toBe('contract-1');
    expect(getStudentContractId('?contractId=%20')).toBeUndefined();
    expect(withStudentContractContext('/student/profile-review', 'contract-1')).toBe(
      '/student/profile-review?contractId=contract-1'
    );
    expect(withStudentContractContext('/inicio')).toBe('/inicio');
  });
});
