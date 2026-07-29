import {
  validatePreviousWebCompatibilityEvidence,
  validateReauthenticationEvidence,
} from '../scripts/issue-275-literal-scenario-contract.js';

describe('issue 275 literal scenario evidence', () => {
  const previousWebEvidence = {
    previousWebSha: '1'.repeat(40),
    expectedPreviousWebSha: '1'.repeat(40),
    currentHeadSha: '2'.repeat(40),
    previousWebDistDigest: 'a'.repeat(64),
    publicInviteRendered: true,
    authenticatedResumeRendered: true,
    administrativeListRendered: true,
  };

  it('accepts only a distinct, digest-bound previous web checkout with real consumers', () => {
    expect(validatePreviousWebCompatibilityEvidence(previousWebEvidence)).toEqual(
      previousWebEvidence
    );
  });

  it('rejects the HTTP-root surrogate that executes no previous web bundle', () => {
    expect(() =>
      validatePreviousWebCompatibilityEvidence({
        ...previousWebEvidence,
        previousWebSha: previousWebEvidence.currentHeadSha,
        expectedPreviousWebSha: previousWebEvidence.currentHeadSha,
      })
    ).toThrow(/mesmo SHA/i);
  });

  it('rejects compatibility evidence without an actual built-bundle digest', () => {
    expect(() =>
      validatePreviousWebCompatibilityEvidence({
        ...previousWebEvidence,
        previousWebDistDigest: '',
      })
    ).toThrow(/Digest SHA-256/i);
  });

  const reauthenticationEvidence = {
    secondContextStartedWithoutSession: true,
    authLoginRequestCount: 1,
    authLoginStatus: 200,
    resumedStep: 'CONTACT',
    expectedResumedStep: 'CONTACT',
    inviteTokenAbsentFromUrl: true,
    inviteTokenAbsentFromStorage: true,
    authenticatedSessionPresent: true,
  };

  it('accepts a clean second context that performs a real login before resuming', () => {
    expect(validateReauthenticationEvidence(reauthenticationEvidence)).toEqual(
      reauthenticationEvidence
    );
  });

  it('rejects session injection as a substitute for reauthentication', () => {
    expect(() =>
      validateReauthenticationEvidence({
        ...reauthenticationEvidence,
        authLoginRequestCount: 0,
      })
    ).toThrow(/autenticação real/i);
  });

  it('rejects a second device that starts with a preloaded session', () => {
    expect(() =>
      validateReauthenticationEvidence({
        ...reauthenticationEvidence,
        secondContextStartedWithoutSession: false,
      })
    ).toThrow(/iniciar sem token/i);
  });
});
