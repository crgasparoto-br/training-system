import type { PreRegistrationInvite } from '@prisma/client';
import {
  MAX_PRE_REGISTRATION_INVITE_HISTORY_LIMIT,
  normalizePreRegistrationInviteHistoryLimit,
  toInviteSummaries,
} from '../src/modules/pre-registration-invites/pre-registration-invite-summary.js';
import type { PreRegistrationInviteDbClient } from '../src/modules/pre-registration-invites/pre-registration-invite-store.js';

const allowedActions = {
  canGenerateFirst: false,
  canRegenerate: true,
  canRevoke: true,
};

function invite(input: {
  id: string;
  createdAt: string;
  replacesInviteId?: string;
}): PreRegistrationInvite {
  return {
    id: input.id,
    alunoId: 'aluno-1',
    contractId: 'contract-1',
    purpose: 'PRE_REGISTRATION',
    tokenHash: `hash-${input.id}`,
    status: input.id === 'new' ? 'ACTIVE' : 'SUPERSEDED',
    createdAt: new Date(input.createdAt),
    expiresAt: new Date('2026-12-31T00:00:00.000Z'),
    createdByProfessorId: 'professor-1',
    createdByUserId: 'user-1',
    firstAccessedAt: null,
    lastAccessAt: null,
    completedAt: null,
    revokedAt: null,
    revokedByProfessorId: null,
    revocationReason: null,
    supersededAt: input.id === 'old' ? new Date('2026-07-02T00:00:00.000Z') : null,
    replacesInviteId: input.replacesInviteId ?? null,
  };
}

describe('issue 275 bounded invite summary', () => {
  it('loads replacement relationships in one batch instead of one query per invite', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'new', replacesInviteId: 'old' },
    ]);
    const client = {
      preRegistrationInvite: { findMany },
    } as unknown as PreRegistrationInviteDbClient;
    const invites = [
      invite({ id: 'new', createdAt: '2026-07-03T00:00:00.000Z', replacesInviteId: 'old' }),
      invite({ id: 'old', createdAt: '2026-07-01T00:00:00.000Z' }),
    ];

    const summaries = await toInviteSummaries(invites, client, { allowedActions });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { replacesInviteId: { in: ['new', 'old'] } },
      select: { id: true, replacesInviteId: true },
    });
    expect(summaries).toHaveLength(2);
    expect(summaries[1].replacedByInviteId).toBe('new');
    expect(summaries[0].allowedActions).toEqual(allowedActions);
  });

  it('uses a safe default and caps oversized history requests', () => {
    expect(normalizePreRegistrationInviteHistoryLimit()).toBe(20);
    expect(normalizePreRegistrationInviteHistoryLimit(0)).toBe(20);
    expect(normalizePreRegistrationInviteHistoryLimit(5)).toBe(5);
    expect(normalizePreRegistrationInviteHistoryLimit(500)).toBe(
      MAX_PRE_REGISTRATION_INVITE_HISTORY_LIMIT
    );
  });
});
