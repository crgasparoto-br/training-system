import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('./api', () => ({
  default: { get: mocks.get },
  api: { get: mocks.get },
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

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/student/me/summary', {
      headers: { 'x-contract-id': 'contract-1' },
    });
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/student/me/profile-review', {
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

  it('mantém contractId somente em rotas locais controladas pelo fluxo', () => {
    expect(getStudentContractId('?contractId=contract-1')).toBe('contract-1');
    expect(getStudentContractId('?contractId=%20')).toBeUndefined();
    expect(withStudentContractContext('/student/profile-review', 'contract-1')).toBe(
      '/student/profile-review?contractId=contract-1'
    );
    expect(withStudentContractContext('/inicio')).toBe('/inicio');
  });
});
