import {
  buildAdipometryInputFingerprint,
  calculateAdipometry,
  type AdipometryCalculationContext,
} from './adipometry.service.js';

const bodyFatExpression = {
  op: 'multiply',
  args: [
    {
      op: 'subtract',
      left: {
        op: 'divide',
        numerator: { op: 'constant', value: 4.95 },
        denominator: {
          op: 'ifEquals',
          field: 'profileCriteria.sex',
          expected: 'MALE',
          then: {
            op: 'subtract',
            left: { op: 'constant', value: 1.17136 },
            right: {
              op: 'multiply',
              args: [
                { op: 'constant', value: 0.06706 },
                { op: 'log10', value: { op: 'variable', name: 'skinfoldTotalMm' } },
              ],
            },
          },
          else: {
            op: 'subtract',
            left: { op: 'constant', value: 1.1665 },
            right: {
              op: 'multiply',
              args: [
                { op: 'constant', value: 0.07063 },
                { op: 'log10', value: { op: 'variable', name: 'skinfoldTotalMm' } },
              ],
            },
          },
        },
      },
      right: { op: 'constant', value: 4.5 },
    },
    { op: 'constant', value: 100 },
  ],
} as const;

const definitionSnapshot = {
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
  inputScales: {
    weightKg: 2,
    tricepsMm: 1,
    subscapularMm: 1,
    suprailiacMm: 1,
    abdominalMm: 1,
    thighMm: 1,
  },
  outputUnits: {
    skinfoldTotalMm: 'mm',
    bodyFatPercentage: 'percent',
    fatMassKg: 'kg',
    leanMassKg: 'kg',
  },
  equations: [
    {
      id: 'siri-body-fat-percentage',
      output: 'bodyFatPercentage',
      expression: bodyFatExpression,
    },
    {
      id: 'absolute-fat-mass',
      output: 'fatMassKg',
      expression: {
        op: 'divide',
        numerator: {
          op: 'multiply',
          args: [
            { op: 'variable', name: 'weightKg' },
            { op: 'variable', name: 'bodyFatPercentage' },
          ],
        },
        denominator: { op: 'constant', value: 100 },
      },
    },
    {
      id: 'lean-mass',
      output: 'leanMassKg',
      expression: {
        op: 'subtract',
        left: { op: 'variable', name: 'weightKg' },
        right: { op: 'variable', name: 'fatMassKg' },
      },
    },
  ],
  limits: {
    blocking: {
      weightKg: { min: 0.01, max: 999.99 },
      tricepsMm: { min: 0.1, max: 80 },
      subscapularMm: { min: 0.1, max: 80 },
      suprailiacMm: { min: 0.1, max: 80 },
      abdominalMm: { min: 0.1, max: 80 },
      thighMm: { min: 0.1, max: 80 },
    },
    warnings: [
      {
        field: 'tricepsMm',
        min: 45.1,
        max: 80,
        message: 'Confirme a capacidade do adipômetro.',
      },
      {
        field: 'subscapularMm',
        min: 45.1,
        max: 80,
        message: 'Confirme a capacidade do adipômetro.',
      },
      {
        field: 'suprailiacMm',
        min: 45.1,
        max: 80,
        message: 'Confirme a capacidade do adipômetro.',
      },
      {
        field: 'abdominalMm',
        min: 45.1,
        max: 80,
        message: 'Confirme a capacidade do adipômetro.',
      },
      {
        field: 'thighMm',
        min: 45.1,
        max: 80,
        message: 'Confirme a capacidade do adipômetro.',
      },
    ],
  },
  precision: {
    measurementScale: 1,
    resultScale: 2,
    internalScale: 8,
    skinfoldTotalScale: 1,
  },
  rounding: { mode: 'HALF_UP', stage: 'FINAL_RESULTS_ONLY' },
  missingDataBehavior: {
    missingRequired: 'BLOCK',
    incompatibleProfile: 'BLOCK',
  },
  testVectors: [],
} as const;

function context(
  overrides: Partial<AdipometryCalculationContext> = {}
): AdipometryCalculationContext {
  return {
    assessmentId: 'assessment-1',
    alunoId: 'aluno-1',
    assessmentDate: '2026-08-03',
    measurements: {
      weightKg: 80,
      tricepsMm: 12,
      suprailiacMm: 18,
      abdominalMm: 20,
    },
    protocolSex: 'male',
    protocolSexSource: 'profile',
    protocolSexOverrideReason: null,
    profile: { birthDate: '2001-08-03', profileSex: 'male' },
    protocol: {
      protocolId: 'protocol-1',
      protocolCode: 'GUEDES_1991_ADULT_YOUNG',
      protocolVersion: 1,
      protocolName: 'Guedes 1991 - adultos jovens',
      protocolStatus: 'DRAFT',
      protocolReference: '10.5433/1679-0367.1991v12n2p61',
      definitionSnapshot,
      approvalId: 'approval-1',
      responsibilityId: 'responsibility-1',
      approvedAt: new Date('2026-08-01T12:00:00.000Z'),
      approvedByProfessorId: 'professor-1',
      approvedByName: 'Responsável técnico',
      approvedByCref: 'CREF-0001',
      approvedSpecificationHash: 'a'.repeat(64),
    },
    capacityWarningConfirmed: false,
    actorUserId: 'user-1',
    calculatedAt: new Date('2026-08-03T12:00:00.000Z'),
    ...overrides,
  } as AdipometryCalculationContext;
}

describe('adipometry authoritative calculation', () => {
  it('matches the canonical male vector without intermediate rounding', () => {
    const result = calculateAdipometry(context());

    expect(result.compatibility).toEqual({ compatible: true, reasons: [], warnings: [] });
    expect(result.results).toEqual({
      skinfoldTotalMm: 50,
      bodyFatPercentage: 18.12,
      fatMassKg: 14.49,
      leanMassKg: 65.51,
    });
    expect(result.calculationSnapshot?.rules).toMatchObject({
      usedSkinfolds: ['tricepsMm', 'suprailiacMm', 'abdominalMm'],
      rawResults: expect.objectContaining({
        bodyFatPercentage: expect.any(Number),
      }),
    });
  });

  it('executes the approved equation AST instead of a hardcoded formula', () => {
    const base = context();
    const changedDefinition = {
      ...definitionSnapshot,
      equations: [
        {
          id: 'controlled-body-fat',
          output: 'bodyFatPercentage',
          expression: { op: 'constant', value: 10 },
        },
        definitionSnapshot.equations[1],
        definitionSnapshot.equations[2],
      ],
    } as const;

    const result = calculateAdipometry({
      ...base,
      protocol: {
        ...base.protocol,
        protocolVersion: 2,
        definitionSnapshot: changedDefinition,
      },
    });

    expect(result.results).toEqual({
      skinfoldTotalMm: 50,
      bodyFatPercentage: 10,
      fatMassKg: 8,
      leanMassKg: 72,
    });
  });

  it('matches the canonical female vector and does not require unused folds', () => {
    const result = calculateAdipometry(context({
      measurements: {
        weightKg: 65,
        subscapularMm: 15,
        suprailiacMm: 20,
        thighMm: 25,
      },
      protocolSex: 'female',
      profile: { birthDate: '1999-08-03', profileSex: 'female' },
    }));

    expect(result.compatibility.compatible).toBe(true);
    expect(result.results).toEqual({
      skinfoldTotalMm: 60,
      bodyFatPercentage: 25.55,
      fatMassKg: 16.6,
      leanMassKg: 48.4,
    });
  });

  it.each([
    ['2008-08-03', true],
    ['1996-08-04', true],
    ['2009-08-03', false],
    ['1995-08-03', false],
  ])('applies the inclusive 18-30 age boundary for %s', (birthDate, compatible) => {
    const result = calculateAdipometry(context({
      profile: { birthDate, profileSex: 'male' },
    }));
    expect(result.compatibility.compatible).toBe(compatible);
  });

  it('requires explicit warning confirmation between 45.1 and 80 mm', () => {
    const pending = calculateAdipometry(context({
      measurements: {
        weightKg: 80,
        tricepsMm: 46,
        suprailiacMm: 18,
        abdominalMm: 20,
      },
    }));
    expect(pending.compatibility.reasons).toContainEqual(expect.objectContaining({
      code: 'SKINFOLD_CAPACITY_WARNING_CONFIRMATION_REQUIRED',
    }));

    const confirmed = calculateAdipometry(context({
      measurements: {
        weightKg: 80,
        tricepsMm: 46,
        suprailiacMm: 18,
        abdominalMm: 20,
      },
      capacityWarningConfirmed: true,
    }));
    expect(confirmed.compatibility.compatible).toBe(true);
    expect(confirmed.compatibility.warnings).toHaveLength(1);
  });

  it('rejects extra input precision instead of silently rounding', () => {
    const result = calculateAdipometry(context({
      measurements: {
        weightKg: 80.001,
        tricepsMm: 12.01,
        suprailiacMm: 18,
        abdominalMm: 20,
      },
    }));
    expect(result.compatibility.compatible).toBe(false);
    expect(result.compatibility.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'weightKg' }),
      expect.objectContaining({ field: 'tricepsMm' }),
    ]));
  });

  it('requires a reason for professional override', () => {
    const result = calculateAdipometry(context({
      protocolSex: 'female',
      protocolSexSource: 'professional_override',
      protocolSexOverrideReason: null,
      profile: { birthDate: '2001-08-03', profileSex: 'male' },
      measurements: {
        weightKg: 65,
        subscapularMm: 15,
        suprailiacMm: 20,
        thighMm: 25,
      },
    }));
    expect(result.compatibility.reasons).toContainEqual(expect.objectContaining({
      code: 'PROTOCOL_SEX_DIVERGENCE_REQUIRES_REASON',
    }));
  });

  it('invalidates a previous fingerprint whenever an authoritative input changes', () => {
    const base = {
      assessmentId: 'assessment-1',
      assessmentDate: '2026-08-03',
      measurements: { weightKg: 80, tricepsMm: 12, suprailiacMm: 18, abdominalMm: 20 },
      protocolSex: 'male' as const,
      protocolSexSource: 'profile' as const,
      protocolSexOverrideReason: null,
      protocolCode: 'GUEDES_1991_ADULT_YOUNG',
      protocolVersion: 1,
      approvalId: 'approval-1',
      capacityWarningConfirmed: false,
    };
    expect(buildAdipometryInputFingerprint(base)).not.toBe(
      buildAdipometryInputFingerprint({
        ...base,
        measurements: { ...base.measurements, abdominalMm: 20.1 },
      })
    );
    expect(buildAdipometryInputFingerprint(base)).not.toBe(
      buildAdipometryInputFingerprint({ ...base, approvalId: 'approval-2' })
    );
  });
});
