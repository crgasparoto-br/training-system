import type { AdipometryCalculationSnapshot } from '@corrida/types';

function serializeSnapshot(snapshot: AdipometryCalculationSnapshot): AdipometryCalculationSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as AdipometryCalculationSnapshot;
}

describe('adipometry calculation snapshot contract', () => {
  it('serializes a male snapshot with unused subscapular and thigh skinfolds as null', () => {
    const snapshot = {
      protocol: { code: 'GUEDES_1991_ADULT_YOUNG', version: 1 },
      assessmentDate: '2026-07-31',
      ageAtAssessment: 25,
      profileCriteria: {
        profileSex: 'MALE',
        sex: 'MALE',
        protocolSex: 'male',
        protocolSexSource: 'profile',
      },
      protocolSexDecision: {
        protocolSex: 'male',
        profileSexSnapshot: 'male',
        source: 'profile',
        confirmedByUserId: 'user-male',
        confirmedAt: '2026-07-31T18:00:00.000Z',
        overrideReason: null,
      },
      inputs: {
        weightKg: 80,
        tricepsMm: 12,
        subscapularMm: null,
        suprailiacMm: 18,
        abdominalMm: 20,
        thighMm: null,
      },
      rules: {},
      results: {
        skinfoldTotalMm: 50,
        bodyFatPercentage: 18.12,
        fatMassKg: 14.49,
        leanMassKg: 65.51,
      },
      implementationVersion: '1.0.0',
      calculatedAt: '2026-07-31T18:00:00.000Z',
    } satisfies AdipometryCalculationSnapshot;

    const serialized = serializeSnapshot(snapshot);

    expect(serialized.protocolSexDecision.protocolSex).toBe('male');
    expect(serialized.inputs.subscapularMm).toBe(null);
    expect(serialized.inputs.thighMm).toBe(null);
    expect(serialized.results.skinfoldTotalMm).toBe(50);
  });

  it('serializes a female snapshot with unused triceps and abdominal skinfolds as null', () => {
    const snapshot = {
      protocol: { code: 'GUEDES_1991_ADULT_YOUNG', version: 1 },
      assessmentDate: '2026-07-31',
      ageAtAssessment: 27,
      profileCriteria: {
        profileSex: 'FEMALE',
        sex: 'FEMALE',
        protocolSex: 'female',
        protocolSexSource: 'profile',
      },
      protocolSexDecision: {
        protocolSex: 'female',
        profileSexSnapshot: 'female',
        source: 'profile',
        confirmedByUserId: 'user-female',
        confirmedAt: '2026-07-31T18:00:00.000Z',
        overrideReason: null,
      },
      inputs: {
        weightKg: 65,
        tricepsMm: null,
        subscapularMm: 15,
        suprailiacMm: 20,
        abdominalMm: null,
        thighMm: 25,
      },
      rules: {},
      results: {
        skinfoldTotalMm: 60,
        bodyFatPercentage: 25.55,
        fatMassKg: 16.6,
        leanMassKg: 48.4,
      },
      implementationVersion: '1.0.0',
      calculatedAt: '2026-07-31T18:00:00.000Z',
    } satisfies AdipometryCalculationSnapshot;

    const serialized = serializeSnapshot(snapshot);

    expect(serialized.protocolSexDecision.protocolSex).toBe('female');
    expect(serialized.inputs.tricepsMm).toBe(null);
    expect(serialized.inputs.abdominalMm).toBe(null);
    expect(serialized.results.skinfoldTotalMm).toBe(60);
  });
});
