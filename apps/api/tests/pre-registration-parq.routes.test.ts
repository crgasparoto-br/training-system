import { PARQ_CATALOG_VERSION } from '@corrida/types';
import {
  parseParqCompletion,
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

  it('accepts only the shared current catalog and allowlisted answers', () => {
    expect(
      parseParqDraft({
        catalogVersion: PARQ_CATALOG_VERSION,
        expectedVersion: 1,
        responses,
        consent: { accepted: true, privacyNoticeVersion: '2026-07' },
      })
    ).toEqual(expect.objectContaining({ catalogVersion: PARQ_CATALOG_VERSION, responses }));
  });

  it.each(['positiveCount', 'positiveItems', 'contractId', 'alunoId', 'status', 'reviewStatus'])(
    'rejects mass assignment field %s',
    (field) => {
      expect(() =>
        parseParqDraft({
          catalogVersion: PARQ_CATALOG_VERSION,
          expectedVersion: 1,
          responses,
          consent: { accepted: true, privacyNoticeVersion: '2026-07' },
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
        consent: { accepted: true, privacyNoticeVersion: '2026-07' },
      })
    ).toThrow();

    expect(() =>
      parseParqCompletion({
        catalogVersion: PARQ_CATALOG_VERSION,
        expectedVersion: 1,
        responses,
        consent: { accepted: true, privacyNoticeVersion: '2026-07' },
        idempotencyKey: 'retry-key-123',
      })
    ).toThrow();
  });
});
