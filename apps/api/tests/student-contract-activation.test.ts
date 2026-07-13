import { resolveSignedContractActivation } from '../src/modules/student-contracts/student-contract-activation.js';

describe('resolveSignedContractActivation', () => {
  const signedAt = new Date('2026-07-11T12:00:00.000Z');

  it('ativa imediatamente quando não há início futuro', () => {
    expect(resolveSignedContractActivation({ signedAt })).toEqual({
      effectiveAt: signedAt,
      scheduled: false,
    });
  });

  it('não retroage a vigência para uma data anterior à assinatura', () => {
    expect(
      resolveSignedContractActivation({
        signedAt,
        requestedStartDate: new Date('2026-07-01T00:00:00.000Z'),
      })
    ).toEqual({
      effectiveAt: signedAt,
      scheduled: false,
    });
  });

  it('agenda a vigência quando o início planejado é futuro', () => {
    const requestedStartDate = new Date('2026-08-01T00:00:00.000Z');

    expect(resolveSignedContractActivation({ signedAt, requestedStartDate })).toEqual({
      effectiveAt: requestedStartDate,
      scheduled: true,
    });
  });
});
