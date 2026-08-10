import {
  activityWhere,
  inviteFilterWhere,
  orderByFor,
  parqReviewWhere,
  statusWhere,
} from '../src/modules/pre-registration-admin/pre-registration-admin.service.js';

describe('pre-registration admin discriminating query rules', () => {
  it('intersects lifecycle status with pending review instead of overriding the selected status', () => {
    expect(statusWhere(['LEAD'], true)).toEqual([
      { status: { in: ['LEAD'] } },
      { status: 'PRE_REGISTRATION_COMPLETED' },
    ]);
  });

  it('orders by the exact lastActivityAt projection rendered by the API', () => {
    expect(orderByFor('lastActivityAt:desc')).toEqual([
      { lastActivityAt: 'desc' },
      { id: 'desc' },
    ]);
    expect(activityWhere({ gte: new Date('2026-07-01T00:00:00.000Z') })).toEqual({
      lastActivityAt: { gte: new Date('2026-07-01T00:00:00.000Z') },
    });
  });

  it('filters the current invite projection rather than any historical invite', () => {
    const now = new Date('2026-07-23T00:00:00.000Z');
    expect(inviteFilterWhere('ACTIVE', now)).toEqual({
      currentPreRegistrationInviteStatus: 'ACTIVE',
      currentPreRegistrationInviteExpiresAt: { gt: now },
    });
    expect(inviteFilterWhere('REVOKED', now)).toEqual({
      currentPreRegistrationInviteStatus: 'REVOKED',
    });
  });

  it('uses the same PAR-Q projection for filtering and display', () => {
    expect(parqReviewWhere(true)).toEqual({ parqRequiresProfessionalReview: true });
    expect(parqReviewWhere(false)).toEqual({ parqRequiresProfessionalReview: false });
  });
});
