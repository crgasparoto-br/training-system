import {
  buildContractRejectionAuditDetails,
  buildContractRejectionClaimWhere,
  normalizeContractRejectionReason,
  resolveContractRejection,
} from '../src/modules/contracts/contract-rejection.js';

describe('contract rejection helpers', () => {
  it('normalizes an optional rejection reason', () => {
    expect(normalizeContractRejectionReason('  Preciso revisar os valores.  ')).toBe(
      'Preciso revisar os valores.'
    );
    expect(normalizeContractRejectionReason('   ')).toBeNull();
  });

  it('rejects reasons above the configured limit', () => {
    expect(() => normalizeContractRejectionReason('a'.repeat(1001))).toThrow(
      'O motivo da recusa deve ter no máximo 1000 caracteres'
    );
  });

  it('builds an atomic claim bound to the token, non-terminal status and validity', () => {
    const claimedAt = new Date('2026-07-13T20:55:00.000Z');

    expect(
      buildContractRejectionClaimWhere('contract-1', 'token-digest', claimedAt)
    ).toEqual({
      id: 'contract-1',
      publicTokenHash: 'token-digest',
      status: { notIn: ['SIGNED', 'CANCELLED', 'EXPIRED'] },
      OR: [
        { publicTokenExpiresAt: null },
        { publicTokenExpiresAt: { gte: claimedAt } },
      ],
    });
  });

  it('resolves rejection metadata from the audit trail', () => {
    const rejectedAt = new Date('2026-07-11T02:20:00.000Z');
    const details = buildContractRejectionAuditDetails(rejectedAt, 'Não concordo com a vigência.');

    expect(
      resolveContractRejection([
        {
          details,
          createdAt: rejectedAt,
        },
      ])
    ).toEqual({
      rejectedAt: '2026-07-11T02:20:00.000Z',
      rejectionReason: 'Não concordo com a vigência.',
    });
  });

  it('ignores unrelated audit updates', () => {
    expect(
      resolveContractRejection([
        {
          details: { kind: 'OTHER_UPDATE' },
          createdAt: '2026-07-11T02:20:00.000Z',
        },
      ])
    ).toBeNull();
  });
});