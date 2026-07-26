import { PARQ_CATALOG_VERSION } from '@corrida/types';
import {
  parseParqCompletion,
  parseParqConsentRevocation,
  parseParqDraft,
} from '../src/modules/pre-registration-public/pre-registration-parq.routes.js';

describe('pre-registration PAR-Q routes contract', () => {
  const responses = {
    q1: false,
    q2: false,
    q3: false,
    q4: false,
    q5: false,
    q6: false,
    q7: false,
  };
  const consent = {
    accepted: true as const,
    privacyNoticeVersion: '2026-07',
    expectedVersion: 1,
  };

  it('accepts only the shared catalog and versioned health consent', () => {
    expect(
      parseParqDraft({
        catalogVersion: PARQ_CATALOG_VERSION,
        expectedVersion: 1,
        responses,
        consent,
      })
    ).toEqual(expect.objectContaining({ catalogVersion: PARQ_CATALOG_VERSION, responses, consent }));
  });

  it.each(['positiveCount', 'positiveItems', 'contractId', 'alunoId', 'status', 'reviewStatus'])(
    'rejects mass assignment field %s',
    (field) => {
      expect(() =>
        parseParqDraft({
          catalogVersion: PARQ_CATALOG_VERSION,
          expectedVersion: 1,
          responses,
          consent,
          [field]: field === 'positiveCount' ? 0 : 'attacker-controlled',
        })
      ).toThrow();
    }
  );

  it('rejects q8 and requires an explicit declaration for completion', () => {
    expect(() =>
      parseParqDraft({
        catalogVersion: PARQ_CATALOG_VERSION,
        expectedVersion: 1,
        responses: { ...responses, q8: true },
        consent,
      })
    ).toThrow();

    expect(() =>
      parseParqCompletion({
        catalogVersion: PARQ_CATALOG_VERSION,
        expectedVersion: 1,
        responses,
        consent,
        idempotencyKey: 'retry-key-123',
      })
    ).toThrow();
  });

  it('requires optimistic versions for consent acceptance and revocation', () => {
    expect(() =>
      parseParqDraft({
        catalogVersion: PARQ_CATALOG_VERSION,
        expectedVersion: 1,
        responses,
        consent: { accepted: true, privacyNoticeVersion: '2026-07' },
      })
    ).toThrow();

    expect(parseParqConsentRevocation({ expectedVersion: 3 })).toEqual({ expectedVersion: 3 });
    expect(() => parseParqConsentRevocation({ expectedVersion: 0 })).toThrow();
    expect(() => parseParqConsentRevocation({ expectedVersion: 1, alunoId: 'attacker' })).toThrow();
  });
});
