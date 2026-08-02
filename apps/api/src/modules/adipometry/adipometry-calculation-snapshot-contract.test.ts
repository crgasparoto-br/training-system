import type {
  AdipometryCalculationSnapshot,
  AdipometryProtocolApprovalSnapshot,
  AdipometryProtocolDefinitionSnapshot,
} from '@corrida/types';

function serializeSnapshot(snapshot: AdipometryCalculationSnapshot): AdipometryCalculationSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as AdipometryCalculationSnapshot;
}

const protocolDefinitionSnapshot = {
  schemaVersion: 2,
  population: {
    ageMinYears: 18,
    ageMaxYears: 30,
    sexCriteria: ['MALE', 'FEMALE'],
    maturationCriteria: 'NOT_REQUIRED',
  },
  requiredSkinfolds: [
    'tricepsMm',
    'subscapularMm',
    'suprailiacMm',
    'abdominalMm',
    'thighMm',
  ],
  calculationSkinfoldsBySex: {
    MALE: ['tricepsMm', 'suprailiacMm', 'abdominalMm'],
    FEMALE: ['subscapularMm', 'suprailiacMm', 'thighMm'],
  },
  inputUnits: {
    weightKg: 'kg',
    tricepsMm: 'mm',
    subscapularMm: 'mm',
    suprailiacMm: 'mm',
    abdominalMm: 'mm',
    thighMm: 'mm',
  },
  outputUnits: {
    skinfoldTotalMm: 'mm',
    bodyFatPercentage: 'percent',
    fatMassKg: 'kg',
    leanMassKg: 'kg',
  },
  equations: [],
  limits: {
    blocking: {
      weightKg: { min: 0.01, max: 999.99 },
      tricepsMm: { min: 0.1, max: 80 },
      subscapularMm: { min: 0.1, max: 80 },
      suprailiacMm: { min: 0.1, max: 80 },
      abdominalMm: { min: 0.1, max: 80 },
      thighMm: { min: 0.1, max: 80 },
    },
    warnings: [],
  },
  precision: {
    measurementScale: 1,
    resultScale: 2,
    internalScale: 8,
  },
  rounding: {
    mode: 'HALF_UP',
    stage: 'FINAL_RESULTS_ONLY',
  },
  missingDataBehavior: {
    missingRequired: 'BLOCK',
    incompatibleProfile: 'BLOCK',
  },
  testVectors: [],
  clinicalApproval: {
    status: 'approved',
    approverUserId: 'user-clinical-approver',
    approvedAt: '2026-07-31T18:00:00.000Z',
    approvalRecordId: 'approval-record-1',
    artifactSha256: 'a'.repeat(64),
  },
} satisfies AdipometryProtocolDefinitionSnapshot;

const protocolApproval = {
  id: 'approval-record-1',
  responsibilityId: 'responsibility-1',
  approvedAt: '2026-07-31T18:00:00.000Z',
  approvedByProfessorId: 'professor-clinical-approver',
  approvedByName: 'Responsável clínico',
  approvedByCref: 'CREF-000001-G/SP',
  approvedSpecificationHash: 'a'.repeat(64),
  protocolReference: '10.5433/1679-0367.1991v12n2p61',
  protocolDefinitionSnapshot,
} satisfies AdipometryProtocolApprovalSnapshot;

const snapshotWithoutClinicalApproval = {
  protocol: { code: 'GUEDES_1991_ADULT_YOUNG', version: 1 },
  assessmentDate: '2026-07-31',
  ageAtAssessment: 25,
  profileCriteria: {
    sex: 'MALE' as const,
    protocolSex: 'male' as const,
  },
  protocolSexDecision: {
    protocolSex: 'male' as const,
    profileSexSnapshot: 'male' as const,
    source: 'profile' as const,
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
};

// This is a discriminating compile-time control: if protocolApproval becomes
// optional, TypeScript reports an unused @ts-expect-error and the gate fails.
// @ts-expect-error completed snapshots require immutable clinical approval provenance
const rejectedSnapshotWithoutClinicalApproval: AdipometryCalculationSnapshot =
  snapshotWithoutClinicalApproval;
void rejectedSnapshotWithoutClinicalApproval;

describe('adipometry calculation snapshot contract', () => {
  it('serializes a male snapshot with unused subscapular and thigh skinfolds as null', () => {
    const snapshot = {
      protocol: { code: 'GUEDES_1991_ADULT_YOUNG', version: 1 },
      protocolApproval,
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
    expect(serialized.protocolApproval.id).toBe('approval-record-1');
    expect(serialized.protocolApproval.approvedSpecificationHash).toHaveLength(64);
    expect(serialized.protocolApproval.protocolDefinitionSnapshot.schemaVersion).toBe(2);
    expect(serialized.results.skinfoldTotalMm).toBe(50);
  });

  it('serializes a female snapshot with unused triceps and abdominal skinfolds as null', () => {
    const snapshot = {
      protocol: { code: 'GUEDES_1991_ADULT_YOUNG', version: 1 },
      protocolApproval,
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
    expect(serialized.protocolApproval.approvedByCref).toBe('CREF-000001-G/SP');
    expect(serialized.protocolApproval.protocolReference).toContain('10.5433');
    expect(serialized.results.skinfoldTotalMm).toBe(60);
  });
});
