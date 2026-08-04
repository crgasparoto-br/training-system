import type { AdipometryCalculationSnapshot } from '@corrida/types';
import {
  applyPersistedProtocolSexDecision,
  buildAdipometryClinicalFingerprint,
  getProtocolSexSourceIncompatibility,
} from './adipometry-clinical-integrity.js';

describe('adipometry clinical integrity hardening', () => {
  const decision = {
    protocolSex: 'male' as const,
    profileSexSnapshot: 'male' as const,
    source: 'profile' as const,
    confirmedByUserId: 'user-confirmed',
    confirmedAt: '2026-08-03T10:00:00.000Z',
    overrideReason: null,
  };

  it('invalidates the clinical fingerprint when authoritative profile data changes', () => {
    const base = {
      legacyFingerprint: 'a'.repeat(64),
      profile: { birthDate: '2000-01-01', profileSex: 'male' as const },
      ageAtAssessment: 26,
      decision,
    };

    expect(buildAdipometryClinicalFingerprint(base)).not.toBe(
      buildAdipometryClinicalFingerprint({
        ...base,
        profile: { ...base.profile, birthDate: '2001-01-01' },
        ageAtAssessment: 25,
      })
    );
    expect(buildAdipometryClinicalFingerprint(base)).not.toBe(
      buildAdipometryClinicalFingerprint({
        ...base,
        profile: { ...base.profile, profileSex: 'other' },
      })
    );
  });

  it('preserves the original clinical confirmer instead of the finalization actor', () => {
    const snapshot = {
      protocolSexDecision: {
        protocolSex: 'male',
        profileSexSnapshot: 'other',
        source: 'professional_confirmation',
        confirmedByUserId: 'user-finalized',
        confirmedAt: '2026-08-04T10:00:00.000Z',
        overrideReason: null,
      },
    } as unknown as AdipometryCalculationSnapshot;

    expect(applyPersistedProtocolSexDecision(snapshot, decision).protocolSexDecision).toEqual(decision);
  });

  it('requires profile source to match a concrete registered sex', () => {
    expect(getProtocolSexSourceIncompatibility({
      profile: { birthDate: '2000-01-01', profileSex: null },
      protocolSex: 'male',
      source: 'profile',
      overrideReason: null,
    })?.code).toBe('MISSING_PROTOCOL_SEX_CONFIRMATION');

    expect(getProtocolSexSourceIncompatibility({
      profile: { birthDate: '2000-01-01', profileSex: 'female' },
      protocolSex: 'male',
      source: 'profile',
      overrideReason: null,
    })?.code).toBe('PROTOCOL_SEX_DIVERGENCE_REQUIRES_REASON');

    expect(getProtocolSexSourceIncompatibility({
      profile: { birthDate: '2000-01-01', profileSex: 'female' },
      protocolSex: 'male',
      source: 'professional_override',
      overrideReason: 'Decisão clínica registrada pelo profissional.',
    })).toBeNull();
  });
});
